import { RedisService } from '@/infra/redis';
import logger from '@/utils/logger';
import config from '@/config';

const DEFAULT_STATE_TTL_SECONDS = 10 * 60; // Default 10 minutes TTL for interactive chat conversation states

const chatStateKey = (chatJid: string, key: string): string =>
  `${config.redis.prefix}chat_state:${chatJid}:${key}`;

export class ChatStateService {
  /**
   * Save temporary chat conversation state (e.g. multi-step user form steps, interactive prompts) to Redis.
   */
  static async set<T>(
    chatJid: string,
    key: string,
    value: T,
    ttlSeconds = DEFAULT_STATE_TTL_SECONDS
  ): Promise<void> {
    try {
      const k = chatStateKey(chatJid, key);
      const serialized = JSON.stringify(value);
      await RedisService.set(k, serialized, ttlSeconds);
    } catch (err) {
      logger.error({ err, chatJid, key }, '[ChatStateService] Failed to set chat state in Redis');
    }
  }

  /**
   * Retrieve temporary chat conversation state for a user/chat from Redis.
   */
  static async get<T>(chatJid: string, key: string): Promise<T | null> {
    try {
      const k = chatStateKey(chatJid, key);
      const raw = await RedisService.get(k);
      if (!raw) return null;

      return JSON.parse(raw) as T;
    } catch (err) {
      logger.error({ err, chatJid, key }, '[ChatStateService] Failed to get chat state from Redis');
      return null;
    }
  }

  /**
   * Delete temporary chat conversation state for a user/chat from Redis.
   */
  static async del(chatJid: string, key: string): Promise<void> {
    try {
      const k = chatStateKey(chatJid, key);
      await RedisService.del(k);
    } catch (err) {
      logger.error({ err, chatJid, key }, '[ChatStateService] Failed to delete chat state from Redis');
    }
  }

  /**
   * Check if a specific temporary chat conversation state exists for a user/chat in Redis.
   */
  static async has(chatJid: string, key: string): Promise<boolean> {
    const val = await this.get(chatJid, key);
    return val !== null;
  }
}
