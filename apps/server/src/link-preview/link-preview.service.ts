import { BadRequestException, Injectable } from '@nestjs/common';
import * as dns from 'dns';
import * as http from 'http';
import * as https from 'https';
import { createHash } from 'crypto';
import { RedisService } from '../redis/redis.service';
import { isIP } from 'net';
import { isFetchableUrl, isPrivateAddress } from './ssrf.util';

export interface LinkPreview {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
}

const MAX_BYTES = 512 * 1024;
const TIMEOUT_MS = 5000;
const MAX_REDIRECTS = 3;
const CACHE_SECONDS = 3600;

/** DNS lookup that refuses private targets at connect time, so a rebinding DNS answer cannot slip through. */
const guardedLookup = ((host: string, options: any, callback: any) => {
  dns.lookup(host, { ...options, all: true }, (err, addresses: any) => {
    if (err) return callback(err);
    const list = addresses as dns.LookupAddress[];
    if (list.length === 0 || list.some((entry) => isPrivateAddress(entry.address))) {
      return callback(new Error('Blocked address'));
    }
    if (options?.all) return callback(null, list);
    return callback(null, list[0].address, list[0].family);
  });
}) as any;

const decode = (text: string) =>
  text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .trim();

function meta(html: string, ...names: string[]): string | null {
  for (const name of names) {
    const re = new RegExp(
      `<meta[^>]+(?:property|name)=["']${name}["'][^>]*content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${name}["']`,
      'i',
    );
    const m = re.exec(html);
    const value = m?.[1] ?? m?.[2];
    if (value) return decode(value).slice(0, 300);
  }
  return null;
}

@Injectable()
export class LinkPreviewService {
  constructor(private readonly redis: RedisService) {}

  async preview(raw: string): Promise<LinkPreview | null> {
    const url = isFetchableUrl(raw);
    if (!url) throw new BadRequestException('Only http(s) links are supported');

    const key = `linkpreview:${createHash('sha1').update(url.href).digest('hex')}`;
    const cached = await this.redis.get(key).catch(() => null);
    if (cached) return JSON.parse(cached) as LinkPreview | null;

    let result: LinkPreview | null = null;
    try {
      const page = await this.fetchHtml(url, 0);
      if (page) result = this.parse(url, page.body, page.finalUrl);
    } catch {
      result = null;
    }
    await this.redis.set(key, JSON.stringify(result), result ? CACHE_SECONDS : 300).catch(() => undefined);
    return result;
  }

  private parse(original: URL, html: string, finalUrl: URL): LinkPreview | null {
    const title =
      meta(html, 'og:title', 'twitter:title') ??
      (() => {
        const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
        return m ? decode(m[1].replace(/\s+/g, ' ')).slice(0, 300) : null;
      })();
    const description = meta(html, 'og:description', 'twitter:description', 'description');
    let image = meta(html, 'og:image', 'twitter:image');
    if (image) {
      try {
        const resolved = new URL(image, finalUrl);
        image = resolved.protocol === 'https:' || resolved.protocol === 'http:' ? resolved.href : null;
      } catch {
        image = null;
      }
    }
    if (!title && !description && !image) return null;
    return { url: original.href, title, description, image, siteName: meta(html, 'og:site_name') };
  }

  private fetchHtml(url: URL, redirects: number): Promise<{ body: string; finalUrl: URL } | null> {
    return new Promise((resolve, reject) => {
      // Node skips the DNS lookup hook for IP literals, so those are checked here.
      const host = url.hostname.replace(/^\[|\]$/g, '');
      if (isIP(host) && isPrivateAddress(host)) return resolve(null);
      const client = url.protocol === 'https:' ? https : http;
      const req = client.request(
        url,
        {
          method: 'GET',
          lookup: guardedLookup,
          timeout: TIMEOUT_MS,
          headers: { 'user-agent': 'FLUXLinkPreview/1.0', accept: 'text/html,application/xhtml+xml' },
        },
        (res) => {
          const status = res.statusCode ?? 0;
          if (status >= 300 && status < 400 && res.headers.location) {
            res.resume();
            if (redirects >= MAX_REDIRECTS) return resolve(null);
            const next = isFetchableUrl(new URL(res.headers.location, url).href);
            if (!next) return resolve(null);
            return this.fetchHtml(next, redirects + 1).then(resolve, reject);
          }
          const type = String(res.headers['content-type'] ?? '');
          if (status !== 200 || !/text\/html|application\/xhtml/i.test(type)) {
            res.resume();
            return resolve(null);
          }
          const chunks: Buffer[] = [];
          let size = 0;
          res.on('data', (chunk: Buffer) => {
            size += chunk.length;
            chunks.push(chunk);
            if (size > MAX_BYTES) {
              res.destroy();
              resolve({ body: Buffer.concat(chunks).toString('utf8'), finalUrl: url });
            }
          });
          res.on('end', () => resolve({ body: Buffer.concat(chunks).toString('utf8'), finalUrl: url }));
          res.on('error', () => resolve(null));
        },
      );
      req.on('timeout', () => req.destroy(new Error('timeout')));
      req.on('error', reject);
      req.end();
    });
  }
}
