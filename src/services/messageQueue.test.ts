import { describe, test, expect, spyOn, beforeEach, afterEach, mock } from 'bun:test';
import { MessageQueueService } from '@/services/messageQueue';
import type { WAMessage } from '@whiskeysockets/baileys';

import * as delayModule from '@/utils/delay';

describe('services/messageQueue', () => {
  const mockChatJid1 = '123456789@s.whatsapp.net';
  const mockChatJid2 = '987654321@s.whatsapp.net';

  const createMockMsg = (chatJid: string, id: string, text: string = '.ping'): WAMessage => ({
    key: { remoteJid: chatJid, id, fromMe: false },
    message: { conversation: text },
  });

  beforeEach(() => {
    // Reset state before each test
    (MessageQueueService as any).lastChatScheduledTimestamp.clear();
    (MessageQueueService as any).revokedMessages.clear();
    (MessageQueueService as any).isShuttingDown = false;

    // Fast sleep mock for tests
    spyOn(delayModule, 'sleep').mockImplementation(async () => {});
  });

  afterEach(async () => {
    await MessageQueueService.shutdown();
    mock.restore();
  });

  test('setQueueProcessor() and enqueue() execute processor callback', async () => {
    let executedMsg: any = null;
    MessageQueueService.setQueueProcessor(async (msg) => {
      executedMsg = msg;
    });

    const msg = createMockMsg(mockChatJid1, 'MSG_1');
    await MessageQueueService.enqueue(msg);

    expect(executedMsg).toEqual(msg);
  });

  test('enqueue() ignores invalid messages without remoteJid or id', async () => {
    let executed = false;
    MessageQueueService.setQueueProcessor(async () => {
      executed = true;
    });

    const invalidMsg: WAMessage = { key: {}, message: {} };
    await MessageQueueService.enqueue(invalidMsg);

    expect(executed).toBe(false);
  });

  test('enqueue() calculates sequential pacing timestamps for messages in the same chat', async () => {
    const executedTimes: number[] = [];
    MessageQueueService.setQueueProcessor(async () => {
      executedTimes.push(Date.now());
    });

    const msg1 = createMockMsg(mockChatJid1, 'MSG_A');
    const msg2 = createMockMsg(mockChatJid1, 'MSG_B');

    // Enqueue both messages
    const p1 = MessageQueueService.enqueue(msg1);
    const p2 = MessageQueueService.enqueue(msg2);

    await Promise.all([p1, p2]);

    expect(executedTimes.length).toBe(2);
    // Second message should be executed at or after first message
    expect(executedTimes[1]).toBeGreaterThanOrEqual(executedTimes[0]!);
  });

  test('revoke() prevents execution of cancelled messages', async () => {
    const executedIds: string[] = [];
    MessageQueueService.setQueueProcessor(async (msg) => {
      executedIds.push(msg.key.id!);
    });

    const msg = createMockMsg(mockChatJid1, 'REVOKE_TEST');

    // Revoke before enqueue finishes
    await MessageQueueService.revoke(mockChatJid1, 'REVOKE_TEST');
    await MessageQueueService.enqueue(msg);

    expect(executedIds).not.toContain('REVOKE_TEST');
  });

  test('shutdown() clears internal state gracefully', async () => {
    (MessageQueueService as any).lastChatScheduledTimestamp.set(mockChatJid1, Date.now());
    (MessageQueueService as any).revokedMessages.add(`${mockChatJid1}:MSG_X`);

    await MessageQueueService.shutdown();

    expect((MessageQueueService as any).isShuttingDown).toBe(true);
    expect((MessageQueueService as any).lastChatScheduledTimestamp.size).toBe(0);
    expect((MessageQueueService as any).revokedMessages.size).toBe(0);
  });
});

