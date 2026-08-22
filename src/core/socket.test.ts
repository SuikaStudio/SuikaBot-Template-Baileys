import { describe, test, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import type { WASocket } from '@whiskeysockets/baileys';

import { SocketService } from '@/core/socket';

import { AuthStoreService } from '@/services/authStore';

import { TestHelper } from '@/utils/testing';

describe('core/socket', () => {
  let redis: ReturnType<typeof TestHelper.mockRedis>;

  beforeEach(() => {
    redis = TestHelper.mockRedis();
    // Ensure clean state before each test
    (SocketService as any).socket = null;
  });

  afterEach(() => {
    SocketService.close();
    redis.restore();
  });

  test('getSocket returns null when not initialized', () => {
    expect(SocketService.getSocket()).toBeNull();
  });

  test('getSocket returns active socket instance when set', () => {
    const dummySocket = { user: { id: '628123456789@s.whatsapp.net' } } as unknown as WASocket;
    (SocketService as any).socket = dummySocket;

    expect(SocketService.getSocket()).toBe(dummySocket);
  });

  test('close cleanly terminates socket and resets state to null', () => {
    let endCalled = false;
    const dummySocket = {
      end: () => {
        endCalled = true;
      },
    } as unknown as WASocket;

    (SocketService as any).socket = dummySocket;
    SocketService.close();

    expect(endCalled).toBe(true);
    expect(SocketService.getSocket()).toBeNull();
  });

  test('close is safe and idempotent when no socket is active', () => {
    expect(() => SocketService.close()).not.toThrow();
    expect(SocketService.getSocket()).toBeNull();
  });

  test('close catches socket end errors gracefully without throwing', () => {
    const errorSocket = {
      end: () => {
        throw new Error('Socket already closed');
      },
    } as unknown as WASocket;

    (SocketService as any).socket = errorSocket;
    expect(() => SocketService.close()).not.toThrow();
    expect(SocketService.getSocket()).toBeNull();
  });

  test('connect initializes socket using AuthStoreService credentials', async () => {
    const mockSaveCreds = async () => {};
    const authSpy = spyOn(AuthStoreService, 'useRedisState').mockImplementation(async () => ({
      state: {
        creds: { registered: true, me: { id: '628123456@s.whatsapp.net' } } as any,
        keys: {} as any,
      },
      saveCreds: mockSaveCreds,
    }));

    const sock = await SocketService.connect();
    expect(sock).not.toBeNull();
    expect(SocketService.getSocket()).toBe(sock);

    authSpy.mockRestore();
  });
});
