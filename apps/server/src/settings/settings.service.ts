import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

type Definition =
  | { type: 'boolean'; default: boolean; description: string }
  | { type: 'string'; default: string; description: string; maxLength: number }
  | { type: 'number'; default: number; description: string; min: number; max: number };

export type SettingKey = 'registrationOpen' | 'maintenanceMode' | 'maintenanceMessage' | 'maxUploadMb';
export type SettingValue = boolean | string | number;

const CACHE_MS = 5000;

/**
 * Settings an administrator can change while the server runs. Anything not stored falls back to its
 * default (for the upload limit: the `UPLOAD_MAX_SIZE_MB` environment value), so a fresh install needs no rows.
 * Reads are cached for a few seconds and the cache of this process is dropped on every change.
 */
@Injectable()
export class SettingsService {
  private cache: { at: number; values: Record<string, unknown> } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  definitions(): Record<SettingKey, Definition> {
    return {
      registrationOpen: { type: 'boolean', default: true, description: 'Anyone may create a new account.' },
      maintenanceMode: { type: 'boolean', default: false, description: 'Only administrators can use the API; everyone else gets a 503.' },
      maintenanceMessage: { type: 'string', default: '', maxLength: 200, description: 'Shown to users while maintenance mode is on.' },
      maxUploadMb: {
        type: 'number',
        default: this.config.get<number>('upload.maxSizeMb', 50),
        min: 1,
        max: 2048,
        description: 'Largest file a user may upload, in megabytes.',
      },
    };
  }

  private async stored(): Promise<Record<string, unknown>> {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache.values;
    const rows = await this.prisma.systemSetting.findMany();
    const values = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    this.cache = { at: Date.now(), values };
    return values;
  }

  async get<T extends SettingValue>(key: SettingKey): Promise<T> {
    const def = this.definitions()[key];
    const stored = (await this.stored())[key];
    return (stored === undefined ? def.default : stored) as T;
  }

  async all() {
    const stored = await this.stored();
    return Object.entries(this.definitions()).map(([key, def]) => ({
      key,
      ...def,
      value: stored[key] === undefined ? def.default : stored[key],
      isDefault: stored[key] === undefined,
    }));
  }

  /** Checks one value against its definition; throws a 400 naming the setting. */
  private validate(key: string, value: unknown): SettingValue {
    const def = (this.definitions() as Record<string, Definition>)[key];
    const bad = (why: string) =>
      new BadRequestException({ message: `Invalid value for ${key}: ${why}.`, code: 'SETTING_INVALID' });
    if (!def) throw new BadRequestException({ message: `Unknown setting ${key}.`, code: 'SETTING_UNKNOWN' });
    if (def.type === 'boolean') {
      if (typeof value !== 'boolean') throw bad('expected true or false');
      return value;
    }
    if (def.type === 'string') {
      if (typeof value !== 'string' || value.length > def.maxLength) throw bad(`text of at most ${def.maxLength} characters`);
      return value.trim();
    }
    if (typeof value !== 'number' || !Number.isInteger(value) || value < def.min || value > def.max) {
      throw bad(`whole number from ${def.min} to ${def.max}`);
    }
    return value;
  }

  async update(adminId: string, patch: Record<string, unknown>) {
    const entries = Object.entries(patch);
    if (entries.length === 0) throw new BadRequestException({ message: 'Nothing to change.', code: 'SETTING_EMPTY' });
    const checked = entries.map(([key, value]) => [key, this.validate(key, value)] as const);

    await this.prisma.$transaction(
      checked.map(([key, value]) =>
        this.prisma.systemSetting.upsert({
          where: { key },
          create: { key, value, updatedById: adminId },
          update: { value, updatedById: adminId },
        }),
      ),
    );
    this.cache = null;
    return { changed: Object.fromEntries(checked) };
  }
}
