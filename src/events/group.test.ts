import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import type { WASocket } from '@whiskeysockets/baileys';

import { onGroupParticipantsUpdate, onGroupsUpdate } from '@/events/group';

import { MessageStoreService } from '@/services/messageStore';

import { TestHelper } from '@/utils/testing';

describe('events/group', () => {
  const groupJid = '120363111111111111@g.us';
  let redis: ReturnType<typeof TestHelper.mockRedis>;

  beforeEach(() => {
    redis = TestHelper.mockRedis();
  });

  afterEach(() => {
    redis.restore();
    mock.restore();
  });

  test('onGroupParticipantsUpdate evicts cache when bot is removed (via PN JID or LID)', async () => {
    const mockSock = {
      user: { id: '6289999999999@s.whatsapp.net', lid: '12345678901234@lid' },
    } as unknown as WASocket;

    const seedCache = async () => {
      await MessageStoreService.warmGroupCache(
        {
          groupMetadata: async (jid: string) => ({
            id: jid,
            subject: 'Active Group',
            participants: [],
          }),
        } as unknown as WASocket,
        groupJid
      );
    };

    // Case 1: Bot removed via Phone Number JID
    await seedCache();
    expect(await MessageStoreService.getCachedGroupMetadata(groupJid)).toBeDefined();

    await onGroupParticipantsUpdate(
      {
        id: groupJid,
        participants: [{ id: '6289999999999@s.whatsapp.net', admin: null }],
        action: 'remove',
        author: 'admin@s.whatsapp.net',
      },
      mockSock
    );
    expect(await MessageStoreService.getCachedGroupMetadata(groupJid)).toBeUndefined();

    // Case 2: Bot removed via LID identifier
    await seedCache();
    expect(await MessageStoreService.getCachedGroupMetadata(groupJid)).toBeDefined();

    await onGroupParticipantsUpdate(
      {
        id: groupJid,
        participants: [{ id: '12345678901234@lid', admin: null }],
        action: 'remove',
        author: 'admin@s.whatsapp.net',
      },
      mockSock
    );
    expect(await MessageStoreService.getCachedGroupMetadata(groupJid)).toBeUndefined();

    // Case 3: Bot removed when p.id is LID but p.phoneNumber matches bot PN (Baileys v7 LID format)
    const mockSockWithoutLid = {
      user: { id: '6289999999999@s.whatsapp.net' },
    } as unknown as WASocket;

    await seedCache();
    expect(await MessageStoreService.getCachedGroupMetadata(groupJid)).toBeDefined();

    await onGroupParticipantsUpdate(
      {
        id: groupJid,
        participants: [
          {
            id: '99999999999999@lid',
            phoneNumber: '6289999999999@s.whatsapp.net',
            admin: null,
          },
        ],
        action: 'remove',
        author: 'admin@s.whatsapp.net',
      },
      mockSockWithoutLid
    );
    expect(await MessageStoreService.getCachedGroupMetadata(groupJid)).toBeUndefined();
  });

  test('onGroupsUpdate skips partial updates without id', async () => {
    const mockSock = {} as WASocket;
    await onGroupsUpdate([{ subject: 'New Title' }], mockSock);
  });

  test('onGroupsUpdate skips warming metadata if group is not cached (avoids blind fetch/403)', async () => {
    let groupMetadataCalled = false;
    const mockSock = {
      groupMetadata: async () => {
        groupMetadataCalled = true;
        return { id: groupJid, subject: 'Uncached Group', participants: [] };
      },
    } as unknown as WASocket;

    // Verify group is not cached initially
    expect(await MessageStoreService.getCachedGroupMetadata(groupJid)).toBeUndefined();

    await onGroupsUpdate([{ id: groupJid, subject: 'Updated Title' }], mockSock);

    expect(groupMetadataCalled).toBe(false);
    expect(await MessageStoreService.getCachedGroupMetadata(groupJid)).toBeUndefined();
  });

  test('onGroupsUpdate warms metadata if group is already cached', async () => {
    let groupMetadataCalled = false;
    const mockSock = {
      groupMetadata: async (jid: string) => {
        groupMetadataCalled = true;
        return { id: jid, subject: 'Updated Active Group', participants: [] };
      },
    } as unknown as WASocket;

    // Pre-warm group in cache
    await MessageStoreService.warmGroupCache(mockSock, groupJid);
    expect(await MessageStoreService.getCachedGroupMetadata(groupJid)).toBeDefined();

    groupMetadataCalled = false;
    await onGroupsUpdate([{ id: groupJid, subject: 'Updated Active Group' }], mockSock);

    expect(groupMetadataCalled).toBe(true);
    const updated = await MessageStoreService.getCachedGroupMetadata(groupJid);
    expect(updated?.subject).toBe('Updated Active Group');
  });
});