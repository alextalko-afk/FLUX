import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis;

  constructor(private configService: ConfigService) {
    const options = {
      lazyConnect: true,
      retryStrategy: (times: number) => Math.min(times * 50, 2000),
    };
    // A hosted Redis is given as one URL (rediss:// for TLS); host and port stay for the local setup.
    const url = process.env.REDIS_URL;
    this.client = url
      ? new Redis(url, options)
      : new Redis({
          host: this.configService.get<string>('redis.host', 'localhost'),
          port: this.configService.get<number>('redis.port', 6379),
          ...options,
        });
  }

  getClient(): Redis {
    return this.client;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, value);
    }
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async onModuleDestroy() {
    await this.client.quit();
  }
}
