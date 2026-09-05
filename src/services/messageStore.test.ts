import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { MessageStoreService } from '@/services/messageStore';
import { TestHelper } from '@/utils/testing';
import type { WAMessage, WASocket } from '@whiskeysockets/baileys';

describe('services/messageStore', () => {
  let redis: ReturnType<typeof TestHelper.mockRedis>;

  beforeEach(() => {
    redis = TestHelper.mockRedis();
  });

  afterEach(() => {
    redis.restore();
  });

  test('saveMessage and getMessage store and retrieve messages from Redis', async () => {
    const mockMsg: WAMessage = {
      key: { remoteJid: '123456789@s.whatsapp.net', id: 'MSG_STORE_TEST' },
      message: { conversation: 'Hello store test' },
    };

    await MessageStoreService.saveMessage(mockMsg);

    const fetchedMsg = await MessageStoreService.getMessage({
      remoteJid: '123456789@s.whatsapp.net',
      id: 'MSG_STORE_TEST',
    });

    expect(fetchedMsg).toBeDefined();
    expect(fetchedMsg?.message?.conversation).toBe('Hello store test');
  });

  test('warmGroupCache and evictGroupCache manage group metadata', async () => {
    const groupJid = '120363111222333444@g.us';
    const mockSock = {
      groupMetadata: async (jid: string) => ({
        id: jid,
        subject: 'Test Group',
        participants: [],
      }),
    } as unknown as WASocket;

    await MessageStoreService.warmGroupCache(mockSock, groupJid);

    const cached = await MessageStoreService.getCachedGroupMetadata(groupJid);
    expect(cached).toBeDefined();
    expect(cached?.subject).toBe('Test Group');

    await MessageStoreService.evictGroupCache(groupJid);
    const evicted = await MessageStoreService.getCachedGroupMetadata(groupJid);
    expect(evicted).toBeUndefined();
  });

  test('warmGroupCache handles 403 forbidden error gracefully without throwing and evicts existing cache', async () => {
    const groupJid = '120363111222333444@g.us';

    // 1. Pre-warm cache so group metadata exists in Redis
    const validSock = {
      groupMetadata: async (jid: string) => ({
        id: jid,
        subject: 'Existing Active Group',
        participants: [],
      }),
    } as unknown as WASocket;
    await MessageStoreService.warmGroupCache(validSock, groupJid);
    expect(await MessageStoreService.getCachedGroupMetadata(groupJid)).toBeDefined();

    // 2. Now simulate 403 forbidden error (bot kicked/left)
    const forbiddenError = Object.assign(new Error('forbidden'), {
      data: 403,
      isBoom: true,
    });
    const failingSock = {
      groupMetadata: async () => {
        throw forbiddenError;
      },
    } as unknown as WASocket;

    const result = await MessageStoreService.warmGroupCache(failingSock, groupJid);
    expect(result).toBeUndefined();

    // 3. Verify cache was actively evicted
    const cached = await MessageStoreService.getCachedGroupMetadata(groupJid);
    expect(cached).toBeUndefined();
  });

  test('saveMessage and getMessage normalize JIDs with device suffixes', async () => {
    const outgoingMsg: WAMessage = {
      key: {
        remoteJid: '628123456789:2@s.whatsapp.net',
        id: 'OUTGOING_RETRY_123',
        fromMe: true,
      },
      message: { extendedTextMessage: { text: 'Bot outgoing reply' } },
    };

    await MessageStoreService.saveMessage(outgoingMsg);

    // Fetch using bare normalized JID without device suffix
    const fetchedBare = await MessageStoreService.getMessage({
      remoteJid: '628123456789@s.whatsapp.net',
      id: 'OUTGOING_RETRY_123',
    });

    expect(fetchedBare).toBeDefined();
    expect(fetchedBare?.key.fromMe).toBe(true);
    expect(fetchedBare?.message?.extendedTextMessage?.text).toBe('Bot outgoing reply');

    // Fetch using another device suffix
    const fetchedOtherDevice = await MessageStoreService.getMessage({
      remoteJid: '628123456789:99@s.whatsapp.net',
      id: 'OUTGOING_RETRY_123',
    });

    expect(fetchedOtherDevice).toBeDefined();
  });
});