import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { onGroupParticipantsUpdate, onGroupsUpdate } from '@/events/group';
import { TestHelper } from '@/utils/testing';
import type { WASocket } from '@whiskeysockets/baileys';

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

  test('onGroupParticipantsUpdate evicts cache when bot is removed', async () => {
    const mockSock = {
      user: { id: '6289999999999@s.whatsapp.net' },
    } as unknown as WASocket;

    // Trigger remove event for bot
    await onGroupParticipantsUpdate(
      {
        id: groupJid,
        participants: [{ id: '6289999999999@s.whatsapp.net', admin: null }],
        action: 'remove',
        author: 'admin@s.whatsapp.net',
      },
      mockSock
    );
  });

  test('onGroupsUpdate skips partial updates without id', async () => {
    const mockSock = {} as WASocket;
    await onGroupsUpdate([{ subject: 'New Title' }], mockSock);
  });
});
