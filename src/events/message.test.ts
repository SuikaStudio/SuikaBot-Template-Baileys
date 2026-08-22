import { describe, test, expect, beforeAll, beforeEach, afterEach, spyOn } from 'bun:test';
import type { WAMessage, WASocket } from '@whiskeysockets/baileys';

import { onMessagesUpsert, processMessage } from '@/events/message';

import { PluginService } from '@/core/plugin';

import { MessageQueueService } from '@/services/messageQueue';

import { TestHelper } from '@/utils/testing';

describe('events/message', () => {
  let redis: ReturnType<typeof TestHelper.mockRedis>;

  beforeAll(async () => {
    await PluginService.load();
  });

  beforeEach(() => {
    redis = TestHelper.mockRedis();
  });

  afterEach(() => {
    redis.restore();
  });

  test('onMessagesUpsert filters non-notify messages and non-prefix messages', async () => {
    const enqueueSpy = spyOn(MessageQueueService, 'enqueue').mockImplementation(async () => {});
    const mockSock = {} as WASocket;

    // History sync / offline messages ('append') should be ignored
    await onMessagesUpsert(
      {
        messages: [
          {
            key: { remoteJid: '123@s.whatsapp.net', id: 'M_APPEND', fromMe: false },
            message: { conversation: '.info' },
          },
        ],
        type: 'append',
      },
      mockSock
    );
    expect(enqueueSpy).not.toHaveBeenCalled();

    // Casual chat without prefix and without matching customMatcher should be ignored
    await onMessagesUpsert(
      {
        messages: [
          {
            key: { remoteJid: '123@s.whatsapp.net', id: 'M_CASUAL', fromMe: false },
            message: { conversation: 'halo selamat pagi semua' },
          },
        ],
        type: 'notify',
      },
      mockSock
    );
    expect(enqueueSpy).not.toHaveBeenCalled();

    // Valid bot command with prefix should be enqueued
    await onMessagesUpsert(
      {
        messages: [
          {
            key: { remoteJid: '123@s.whatsapp.net', id: 'M_VALID', fromMe: false },
            message: { conversation: '.info' },
          },
        ],
        type: 'notify',
      },
      mockSock
    );
    expect(enqueueSpy).toHaveBeenCalledTimes(1);

    enqueueSpy.mockRestore();
  });

  test('onMessagesUpsert intercepts protocolMessage revoke and cancels queue', async () => {
    const revokeSpy = spyOn(MessageQueueService, 'revoke').mockImplementation(async () => {});
    const mockSock = {} as WASocket;

    const revokeMsg: WAMessage = {
      key: { remoteJid: '123456@s.whatsapp.net', id: 'PROTO_1', fromMe: false },
      message: {
        protocolMessage: {
          key: { remoteJid: '123456@s.whatsapp.net', id: 'TARGET_123' },
          type: 0,
        },
      },
    };

    await onMessagesUpsert({ messages: [revokeMsg], type: 'notify' }, mockSock);
    expect(revokeSpy).toHaveBeenCalledWith('123456@s.whatsapp.net', 'TARGET_123');

    revokeSpy.mockRestore();
  });

  test('processMessage handles valid command message', async () => {
    let responseText = '';

    const mockMsg: WAMessage = {
      key: { remoteJid: '123456@s.whatsapp.net', id: 'EV_MSG_1', fromMe: false },
      pushName: 'UserTester',
      message: { conversation: '.info' },
    };

    const mockSock = {
      user: { id: '6289999@s.whatsapp.net' },
      sendMessage: async (_jid: string, content: { text?: string }) => {
        if (content.text) responseText = content.text;
        return undefined;
      },
      sendPresenceUpdate: async () => {},
    } as unknown as WASocket;

    await processMessage(mockMsg, mockSock);
    expect(responseText).toContain('Bot Information');
  });

  test('processMessage resolves group admins and bot admins correctly', async () => {
    (PluginService as any).plugins.set('testadmin', {
      name: 'testadmin',
      adminOnly: true,
      exec: async (m: any) => {
        await m.reply(`Halo Admin Grup *${m.senderName}*`);
      },
    });

    let responseText = '';
    const groupJid = '120363000000000000@g.us';
    const adminUserJid = '628111111111@s.whatsapp.net';
    const botUserJid = '628999999999@s.whatsapp.net';

    const mockMsg: WAMessage = {
      key: {
        remoteJid: groupJid,
        participant: adminUserJid,
        id: 'GROUP_MSG_1',
        fromMe: false,
      },
      pushName: 'AdminUser',
      message: { conversation: '.testadmin' },
    };

    const mockSock = {
      user: { id: botUserJid },
      groupMetadata: async () => ({
        id: groupJid,
        subject: 'Test Group',
        participants: [
          { id: adminUserJid, admin: 'admin' },
          { id: botUserJid, admin: 'superadmin' },
          { id: '628222222222@s.whatsapp.net', admin: null },
        ],
      }),
      sendMessage: async (_jid: string, content: { text?: string }) => {
        if (content.text) responseText = content.text;
        return undefined;
      },
      sendPresenceUpdate: async () => {},
    } as unknown as WASocket;

    await processMessage(mockMsg, mockSock);
    expect(responseText).toContain('Halo Admin Grup *AdminUser*');
  });
});
