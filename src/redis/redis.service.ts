import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService extends Redis implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      host: process.env.REDIS_HOST || 'redis',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
    });
  }

  onModuleInit() {
    console.log('⚡ Conectado ao cache Redis com sucesso!');
  }

  onModuleDestroy() {
    this.disconnect();
  }

  async acquireMultipleLocks(keys: string[], ttlMilliseconds: number): Promise<string[]> {
    const sortedKeys = [...keys].sort();
    const acquiredKeys: string[] = [];

    for (const key of sortedKeys) {
      const acquired = await this.acquireLock(key, ttlMilliseconds);
      if (!acquired) {
        await this.releaseMultipleLocks(acquiredKeys);
        return [];
      }
      acquiredKeys.push(key)
    }
    return acquiredKeys;
  }

  async releaseMultipleLocks(keys: string[]): Promise<void> {
    for (const key of keys) {
      await this.releaseLock(key);
    }
  }

  private async acquireLock(key: string, ttlMilliseconds: number): Promise<boolean> {
    const result = await this.set(key, 'LOCKED', 'PX', ttlMilliseconds, 'NX');
    
    return result === 'OK';
  }

  private async releaseLock(key: string): Promise<void> {
    await this.del(key);
  }
}