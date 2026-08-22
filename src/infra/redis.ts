import { createClient, type RedisClientType } from 'redis';

import config from '@/config';
import logger from '@/utils/logger';

export type RedisClient = RedisClientType;

export class RedisService {
  private static client: RedisClientType | null = null;

  /**
   * Get or initialize the raw underlying Redis client instance.
   */
  static async getClient(): Promise<RedisClientType> {
    if (this.client?.isOpen) return this.client;

    if (!this.client) {
      this.client = createClient({
        url: config.redis.url,
      });

      this.client.on('connect', () => logger.info('[RedisService] Connecting to Redis...'));
      this.client.on('ready', () => logger.info('[RedisService] Redis ready'));
      this.client.on('error', (err) => logger.error({ err }, '[RedisService] Redis client error'));
      this.client.on('end', () => logger.warn('[RedisService] Connection closed'));
    }

    if (!this.client.isOpen) {
      await this.client.connect();
    }

    return this.client;
  }

  /**
   * Get string value by key from Redis.
   */
  static async get(key: string): Promise<string | null> {
    const client = await this.getClient();
    return await client.get(key);
  }

  /**
   * Set string value with optional TTL (in seconds) in Redis.
   */
  static async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    const client = await this.getClient();
    if (ttlSeconds && ttlSeconds > 0) {
      await client.setEx(key, ttlSeconds, value);
    } else {
      await client.set(key, value);
    }
  }

  /**
   * Delete one or more keys from Redis.
   */
  static async del(keys: string | string[]): Promise<void> {
    const client = await this.getClient();
    const keyList = Array.isArray(keys) ? keys : [keys];
    if (keyList.length > 0) {
      await client.del(keyList);
    }
  }

  /**
   * Scan keys matching a pattern.
   */
  static async scan(pattern: string): Promise<string[]> {
    const client = await this.getClient();
    const matches: string[] = [];
    for await (const key of client.scanIterator({ MATCH: pattern })) {
      matches.push(key);
    }
    return matches;
  }

  /**
   * Ping Redis server.
   */
  static async ping(): Promise<string> {
    const client = await this.getClient();
    return await client.ping();
  }

  /**
   * Gracefully disconnect the Redis client.
   */
  static async disconnect(): Promise<void> {
    if (this.client?.isOpen) {
      await this.client.quit();
      this.client = null;
      logger.info('[RedisService] Disconnected Redis client');
    }
  }
}
