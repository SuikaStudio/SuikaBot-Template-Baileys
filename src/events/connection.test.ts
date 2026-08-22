import { describe, test, expect } from 'bun:test';
import type { ConnectionState, WASocket } from '@whiskeysockets/baileys';

import { onConnectionUpdate } from '@/events/connection';

import { sleep } from '@/utils/delay';

import config from '@/config';

describe('events/connection', () => {
  test('onConnectionUpdate handles open state without reconnecting', async () => {
    let reconnectCalled = false;

    const state: Partial<ConnectionState> = { connection: 'open' };
    const mockSock = {} as WASocket;
    const mockReconnect = async () => {
      reconnectCalled = true;
    };

    await onConnectionUpdate(state, mockSock, mockReconnect);
    expect(reconnectCalled).toBe(false);
  });

  test('onConnectionUpdate handles QR code event without throwing', async () => {
    (config.pairing as any).usePairingCode = false;
    const state: Partial<ConnectionState> = { qr: 'mock_qr_code_string' };
    const mockSock = {} as WASocket;

    await onConnectionUpdate(state, mockSock, async () => {});
  });

  test('onConnectionUpdate requests pairing code when configured and QR is emitted', async () => {
    (config.pairing as any).usePairingCode = true;
    (config.pairing as any).phoneNumber = '6281234567890';

    let requestedPhone = '';
    const mockSock = {
      authState: {
        creds: { registered: false },
      },
      requestPairingCode: async (phone: string) => {
        requestedPhone = phone;
        return '12345678';
      },
    } as unknown as WASocket;

    const state: Partial<ConnectionState> = { connection: 'connecting', qr: 'mock_qr_ref' };
    await onConnectionUpdate(state, mockSock, async () => {});

    expect(requestedPhone).toBe('6281234567890');

    // Restore default config
    (config.pairing as any).usePairingCode = false;
  });

  test('onConnectionUpdate handles close state and schedules reconnect', async () => {
    let reconnectCalled = false;

    const state: Partial<ConnectionState> = {
      connection: 'close',
      lastDisconnect: {
        error: new Error('Temporary disconnect'),
        date: new Date(),
      },
    };
    const mockSock = {} as WASocket;
    const mockReconnect = async () => {
      reconnectCalled = true;
    };

    await onConnectionUpdate(state, mockSock, mockReconnect);

    await sleep(3100);
    expect(reconnectCalled).toBe(true);
  });
});
