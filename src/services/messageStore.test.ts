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
});
