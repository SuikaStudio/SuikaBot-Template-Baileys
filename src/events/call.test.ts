import { describe, test, expect } from 'bun:test';
import type { WACallEvent, WASocket } from '@whiskeysockets/baileys';
import { onCall } from '@/events/call';

describe('events/call', () => {
  test('onCall logs incoming call offer events without throwing', async () => {
    const mockCalls: WACallEvent[] = [
      {
        id: 'CALL_1',
        from: '123456789@s.whatsapp.net',
        chatId: '123456789@s.whatsapp.net',
        status: 'offer',
        isVideo: false,
        isGroup: false,
        offline: false,
        date: new Date(),
      },
      {
        id: 'CALL_2',
        from: '987654321@s.whatsapp.net',
        chatId: '987654321@s.whatsapp.net',
        status: 'timeout',
        isVideo: true,
        isGroup: false,
        offline: false,
        date: new Date(),
      },
    ];

    const mockSock = {} as WASocket;
    await onCall(mockCalls, mockSock);
  });
});
