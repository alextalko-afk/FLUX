import { BadRequestException } from '@nestjs/common';
import { toSafeLinkUrl } from '../common/utils/sanitize-text';

export interface TextEntity {
  type: string;
  offset: number;
  length: number;
  url?: string;
}

/**
 * Checks that formatting entities describe real ranges of `content` and returns
 * them in a canonical form (link URLs normalised, ordered by position).
 *
 * Offsets and lengths are UTF-16 code units, the unit JavaScript string
 * indexing uses, so a client can apply them with `String.prototype.slice`.
 */
export function validateEntities(content: string, entities: TextEntity[] | undefined): TextEntity[] {
  if (!entities || entities.length === 0) return [];

  const normalised = entities.map((entity) => {
    if (entity.length <= 0 || entity.offset + entity.length > content.length) {
      throw new BadRequestException('Text entity is outside of the message text');
    }

    if (entity.type === 'link') {
      const url = entity.url ? toSafeLinkUrl(entity.url) : null;
      if (!url) throw new BadRequestException('Link entity needs a safe http, https or mailto URL');
      return { ...entity, url };
    }

    if (entity.url !== undefined) {
      throw new BadRequestException(`Entity of type ${entity.type} must not carry a URL`);
    }
    return entity;
  });

  return normalised.sort((a, b) => a.offset - b.offset || b.length - a.length);
}
