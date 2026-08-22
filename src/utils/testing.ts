import { spyOn } from 'bun:test';
import type { WASocket } from '@whiskeysockets/baileys';

import { RedisService } from '@/infra/redis';

import type { SerializedMessage } from '@/types/serialize';

export class TestHelper {
  /**
   * Setup an in-memory Map mock store for RedisService during unit testing.
   * Automatically mocks get(), set(), del(), scan() methods.
   * Call `restore()` in `afterEach()` to clean up mocks.
   */
  static mockRedis() {
    const testStore = new Map<string, string>();

    const getSpy = spyOn(RedisService, 'get').mockImplementation(async (key) => testStore.get(key) ?? null);
    const setSpy = spyOn(RedisService, 'set').mockImplementation(async (key, val) => {
      testStore.set(key, val);
    });
    const delSpy = spyOn(RedisService, 'del').mockImplementation(async (key) => {
      const keys = Array.isArray(key) ? key : [key];
      for (const k of keys) testStore.delete(k);
    });
    const scanSpy = spyOn(RedisService, 'scan').mockImplementation(async () => Array.from(testStore.keys()));
    const pingSpy = spyOn(RedisService, 'ping').mockImplementation(async () => 'PONG');

    const restore = () => {
      getSpy.mockRestore();
      setSpy.mockRestore();
      delSpy.mockRestore();
      scanSpy.mockRestore();
      pingSpy.mockRestore();
    };

    return { testStore, restore };
  }

  /**
   * Create a lightweight mock WASocket instance for unit testing.
   */
  static createMockSocket(overrides?: Partial<WASocket>): WASocket {
    return {
      user: { id: '6289999999999@s.whatsapp.net' },
      sendMessage: async () => ({}),
      sendPresenceUpdate: async () => {},
      updateMediaMessage: async () => ({}),
      ...overrides,
    } as unknown as WASocket;
  }

  /**
   * Create a rich SerializedMessage mock instance with sensible defaults for unit testing.
   */
  static createMockMessage(overrides?: Partial<SerializedMessage>): SerializedMessage {
    const mockSock = this.createMockSocket();
    const defaultMsg: SerializedMessage = {
      key: { remoteJid: '123456789@s.whatsapp.net', id: 'TEST_MSG_1', fromMe: false },
      messageId: 'TEST_MSG_1',
      senderJid: '123456789@s.whatsapp.net',
      senderLid: null,
      senderName: 'TestUser',
      chatJid: '123456789@s.whatsapp.net',
      timestamp: Date.now(),
      fromBot: false,
      isGroup: false,
      isAdmin: false,
      isBotAdmin: false,
      isMedia: false,
      isQuotedMedia: false,
      mediaType: null,
      mimetype: null,
      fileName: null,
      quoted: null,
      mentionedJids: [],
      body: '',
      command: '',
      prefix: '',
      text: '',
      query: '',
      args: [],
      split: (delimiter?: string | RegExp) => (delimiter ? [].slice() : []),
      sock: mockSock,
      raw: {} as any,
      reply: async () => undefined,
      react: async () => undefined,
      edit: async () => undefined,
      delete: async () => undefined,
      showTyping: async () => undefined,
      showRecording: async () => undefined,
      replyMedia: async () => undefined,
      downloadMedia: async () => Buffer.from(''),
      ...overrides,
    };
    return defaultMsg;
  }
}
