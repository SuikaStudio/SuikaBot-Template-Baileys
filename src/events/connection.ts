import {
  DisconnectReason,
  type ConnectionState,
  type WASocket,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';

import config from '@/config';
import logger from '@/utils/logger';
import { AuthStoreService } from '@/services/authStore';

type ReconnectFn = () => Promise<void>;

let _pairingCodeRequested = false;

export const onConnectionUpdate = async (
  update: Partial<ConnectionState>,
  sock: WASocket,
  reconnect: ReconnectFn
): Promise<void> => {
  const { connection, lastDisconnect, qr } = update;

  // Generate terminal QR code if using QR mode
  if (qr && !config.pairing.usePairingCode) {
    logger.info('[connection] QR code generated — scan with WhatsApp');
    qrcode.generate(qr, { small: true });
  }

  // Request 8-digit Pairing Code when QR reference is emitted
  if (
    qr &&
    config.pairing.usePairingCode &&
    !_pairingCodeRequested &&
    !sock.authState?.creds?.registered
  ) {
    _pairingCodeRequested = true;

    try {
      const code = await sock.requestPairingCode(config.pairing.phoneNumber);
      const formatted = (code ?? '').replace(/(.{4})/g, '$1-').trimEnd().replace(/-$/, '');
      logger.info(
        `\n┌────────────────────────────────┐\n` +
        `│  WhatsApp Pairing Code         │\n` +
        `│                                │\n` +
        `│  ${formatted.padEnd(30)}│\n` +
        `│                                │\n` +
        `│  Enter this code on your phone │\n` +
        `│  Settings → Linked Devices     │\n` +
        `└────────────────────────────────┘\n`
      );
    } catch (err) {
      logger.error({ err }, '[connection] Failed to request pairing code');
      _pairingCodeRequested = false;
    }
  }

  // Connected - Reset pairing flag and log success
  if (connection === 'open') {
    _pairingCodeRequested = false;
    logger.info('[connection] ✅ WhatsApp connection opened');
  }

  // Connection closed - Handle logout and reconnections
  if (connection === 'close') {
    const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
    const isLoggedOut = statusCode === DisconnectReason.loggedOut;

    logger.warn(
      { statusCode, error: lastDisconnect?.error?.message },
      '[connection] Connection closed'
    );

    if (isLoggedOut && sock.authState?.creds?.registered) {
      logger.error(
        '[connection] ❌ Logged out (401). Clearing auth state from Redis. Restart required.'
      );
      await AuthStoreService.clearState();
      process.exit(0);
    } else if (isLoggedOut) {
      logger.warn('[connection] Unregistered session timed out. Retrying pairing...');
      await AuthStoreService.clearState();
      _pairingCodeRequested = false;
      setTimeout(() => void reconnect(), 3_000);
    } else {
      logger.warn('[connection] Reconnecting in 3 seconds...');
      setTimeout(() => void reconnect(), 3_000);
    }
  }
};
