import {
  BufferJSON,
  jidNormalizedUser,
  type WAMessage,
  type WAMessageKey,
  type GroupMetadata,
} from '@whiskeysockets/baileys';
import { isBoom } from '@hapi/boom';

import { RedisService } from '@/infra/redis';

import logger from '@/utils/logger';

import config from '@/config';

const MESSAGE_TTL_SECONDS = 48 * 60 * 60; // 48 hours message TTL for retries & poll vote decryption
const GROUP_TTL_SECONDS = 24 * 60 * 60;   // 24 hours group metadata TTL

const msgKey = (chatJid: string, messageId: string): string =>
  `${config.redis.prefix}store:msg:${jidNormalizedUser(chatJid)}:${messageId}`;

const groupKey = (groupJid: string): string =>
  `${config.redis.prefix}store:group:${groupJid}`;

export class MessageStoreService {
  /**
   * Save message to Redis for retry delivery & poll decryption.
   */
  static async saveMessage(message: WAMessage): Promise<void> {
    const chatJid = message.key.remoteJid;
    const messageId = message.key.id;
    if (!chatJid || !messageId) return;

    try {
      const key = msgKey(chatJid, messageId);
      const json = JSON.stringify(message, BufferJSON.replacer);

      await RedisService.set(key, json, MESSAGE_TTL_SECONDS);
      logger.debug({ chatJid, messageId }, '[MessageStoreService] Saved message to Redis');
    } catch (err) {
      logger.error({ err, chatJid, messageId }, '[MessageStoreService] Failed to save message to Redis');
    }
  }

  /**
   * Retrieve stored message from Redis (used by Baileys getMessage callback).
   */
  static async getMessage(key: WAMessageKey): Promise<WAMessage | undefined> {
    const chatJid = key.remoteJid;
    const messageId = key.id;
    if (!chatJid || !messageId) return undefined;

    try {
      const redisKey = msgKey(chatJid, messageId);

      const raw = await RedisService.get(redisKey);
      if (!raw) return undefined;

      const message = JSON.parse(raw, BufferJSON.reviver) as WAMessage;
      logger.debug({ chatJid, messageId }, '[MessageStoreService] Retrieved message from Redis');

      return message;
    } catch (err) {
      logger.error({ err, chatJid, messageId }, '[MessageStoreService] Failed to load message from Redis');
      return undefined;
    }
  }

  /**
   * Fetch group metadata from WhatsApp socket and warm the Redis cache.
   */
  static async warmGroupCache(
    sock: { groupMetadata: (jid: string) => Promise<GroupMetadata> },
    groupJid: string
  ): Promise<GroupMetadata | undefined> {
    try {
      const metadata = await sock.groupMetadata(groupJid);
      const key = groupKey(groupJid);

      await RedisService.set(key, JSON.stringify(metadata), GROUP_TTL_SECONDS);
      logger.debug({ jid: groupJid }, '[MessageStoreService] Group metadata cached in Redis');

      return metadata;
    } catch (err: unknown) {
      // 403 Forbidden means bot is not/no longer a participant (e.g. kicked, left, or pending approval)
      const isForbidden =
        (isBoom(err) && (err.output?.statusCode === 403 || err.data === 403)) ||
        (err instanceof Error && err.message === 'forbidden');

      if (isForbidden) {
        await this.evictGroupCache(groupJid);
        return undefined;
      }

      logger.error({ err, jid: groupJid }, '[MessageStoreService] Failed to fetch group metadata');
      return undefined;
    }
  }

  /**
   * Remove group metadata cache from Redis when bot leaves or is removed.
   */
  static async evictGroupCache(groupJid: string): Promise<void> {
    await RedisService.del(groupKey(groupJid));
    logger.debug({ jid: groupJid }, '[MessageStoreService] Group cache evicted from Redis');
  }

  /**
   * Get cached group metadata from Redis (used by Baileys cachedGroupMetadata callback).
   */
  static async getCachedGroupMetadata(groupJid: string): Promise<GroupMetadata | undefined> {
    try {
      const key = groupKey(groupJid);

      const raw = await RedisService.get(key);
      if (!raw) return undefined;

      return JSON.parse(raw) as GroupMetadata;
    } catch (err) {
      logger.error({ err, jid: groupJid }, '[MessageStoreService] Failed to get cached group metadata from Redis');
      return undefined;
    }
  }
}
