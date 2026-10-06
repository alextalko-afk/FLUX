import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'node:fs';
import jwt from 'jsonwebtoken';

export interface DeviceTarget {
  id: string;
  provider: string;
  token: string;
}

export interface MobileMessage {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface MobileSendResult {
  sent: number;
  /** Tokens the provider says no longer exist; the caller deletes them. */
  invalidIds: string[];
}

export const EXPO_TOKEN_RE = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$/;

type FetchFn = typeof fetch;

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id?: string;
}

const EXPO_BATCH = 100;

/**
 * Push to phone apps. Two providers, chosen per device token:
 *
 * - `expo`: Expo's push service. Needs no credentials of ours (optional `EXPO_ACCESS_TOKEN`
 *   when "enhanced security" is on), which makes it the way to reach an Expo/EAS app.
 * - `fcm`: Firebase Cloud Messaging HTTP v1 with a service account, set by `FCM_SERVICE_ACCOUNT_JSON`
 *   (the JSON itself or a path to it) and optionally `FCM_PROJECT_ID`.
 *
 * Message text travels through these providers, so the caller already swaps in a neutral
 * text when the user turned previews off or the chat is a secret one.
 */
@Injectable()
export class MobilePushService {
  private readonly logger = new Logger(MobilePushService.name);
  /** Replaceable in tests. */
  protected fetchFn: FetchFn = (...args) => fetch(...args);
  private account: ServiceAccount | null | undefined;
  private fcmToken: { value: string; expiresAt: number } | null = null;

  constructor(private readonly config: ConfigService) {}

  isFcmConfigured(): boolean {
    return this.serviceAccount() !== null;
  }

  private serviceAccount(): ServiceAccount | null {
    if (this.account !== undefined) return this.account;
    this.account = null;
    const raw = this.config.get<string>('FCM_SERVICE_ACCOUNT_JSON');
    if (!raw) return null;
    try {
      const json = JSON.parse(raw.trim().startsWith('{') ? raw : readFileSync(raw, 'utf8')) as ServiceAccount;
      if (json.client_email && json.private_key) this.account = json;
    } catch (err) {
      this.logger.error(`FCM_SERVICE_ACCOUNT_JSON is not usable: ${err instanceof Error ? err.message : err}`);
    }
    return this.account;
  }

  async send(targets: DeviceTarget[], message: MobileMessage): Promise<MobileSendResult> {
    const result: MobileSendResult = { sent: 0, invalidIds: [] };
    const expo = targets.filter((t) => t.provider === 'expo');
    const fcm = targets.filter((t) => t.provider === 'fcm');

    for (let i = 0; i < expo.length; i += EXPO_BATCH) {
      this.merge(result, await this.sendExpo(expo.slice(i, i + EXPO_BATCH), message));
    }
    if (fcm.length > 0) {
      if (!this.serviceAccount()) {
        this.logger.warn('FCM tokens are registered but FCM_SERVICE_ACCOUNT_JSON is not set.');
      } else {
        for (const target of fcm) this.merge(result, await this.sendFcm(target, message));
      }
    }
    return result;
  }

  private merge(into: MobileSendResult, from: MobileSendResult) {
    into.sent += from.sent;
    into.invalidIds.push(...from.invalidIds);
  }

  private async sendExpo(targets: DeviceTarget[], message: MobileMessage): Promise<MobileSendResult> {
    const out: MobileSendResult = { sent: 0, invalidIds: [] };
    try {
      const accessToken = this.config.get<string>('EXPO_ACCESS_TOKEN');
      const res = await this.fetchFn('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify(
          targets.map((t) => ({
            to: t.token,
            title: message.title,
            body: message.body,
            data: message.data ?? {},
            sound: 'default',
            priority: 'high',
          })),
        ),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`Expo answered ${res.status}`);
      const json = (await res.json()) as { data?: { status: string; details?: { error?: string } }[] };
      (json.data ?? []).forEach((ticket, index) => {
        if (ticket.status === 'ok') out.sent += 1;
        else if (ticket.details?.error === 'DeviceNotRegistered' && targets[index]) out.invalidIds.push(targets[index].id);
      });
    } catch (err) {
      this.logger.warn(`Expo push failed: ${err instanceof Error ? err.message : err}`);
    }
    return out;
  }

  private async fcmAccessToken(account: ServiceAccount): Promise<string> {
    if (this.fcmToken && this.fcmToken.expiresAt - 60_000 > Date.now()) return this.fcmToken.value;
    const now = Math.floor(Date.now() / 1000);
    const assertion = jwt.sign(
      { iss: account.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 },
      account.private_key,
      { algorithm: 'RS256' },
    );
    const res = await this.fetchFn('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Google OAuth answered ${res.status}`);
    const json = (await res.json()) as { access_token: string; expires_in: number };
    this.fcmToken = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
    return json.access_token;
  }

  private async sendFcm(target: DeviceTarget, message: MobileMessage): Promise<MobileSendResult> {
    const out: MobileSendResult = { sent: 0, invalidIds: [] };
    const account = this.serviceAccount()!;
    const project = this.config.get<string>('FCM_PROJECT_ID') || account.project_id;
    if (!project) {
      this.logger.warn('FCM_PROJECT_ID is not set and the service account has no project_id.');
      return out;
    }
    try {
      const token = await this.fcmAccessToken(account);
      const res = await this.fetchFn(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(project)}/messages:send`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({
          message: {
            token: target.token,
            notification: { title: message.title, body: message.body },
            // FCM data values must all be strings.
            data: Object.fromEntries(Object.entries(message.data ?? {}).map(([k, v]) => [k, String(v)])),
            android: { priority: 'HIGH' },
          },
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) {
        out.sent += 1;
      } else if (res.status === 404 || res.status === 400) {
        // UNREGISTERED (404) and INVALID_ARGUMENT for a malformed token (400): the token is useless.
        out.invalidIds.push(target.id);
      } else {
        throw new Error(`FCM answered ${res.status}`);
      }
    } catch (err) {
      this.logger.warn(`FCM push failed: ${err instanceof Error ? err.message : err}`);
    }
    return out;
  }
}
