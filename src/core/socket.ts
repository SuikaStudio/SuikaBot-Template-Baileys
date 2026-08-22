import makeWASocket, {
  Browsers,
  type CacheStore,
  type WASocket,
} from '@whiskeysockets/baileys';
import NodeCache from 'node-cache';

import config from '@/config';

import logger from '@/utils/logger';

import { AuthStoreService } from '@/services/authStore';
import { MessageStoreService } from '@/services/messageStore';

import { registerEvents } from '@/events/index';

const msgRetryCounterCache = new NodeCache() as unknown as CacheStore;
const userDevicesCache = new NodeCache({ stdTTL: 300, useClones: false }) as unknown as CacheStore;

export class SocketService {
  private static socket: WASocket | null = null;

  /**
   * Get the active WASocket instance, or null if not yet connected.
   */
  static getSocket(): WASocket | null {
    return this.socket;
  }

  /**
   * Initialize Baileys WASocket connection and bind atomic event handlers.
   */
  static async connect(): Promise<WASocket> {
    logger.info(`[SocketService] Starting ${config.bot.name}...`);

    // Load authentication state & credential saver callback from Redis
    const { state, saveCreds } = await AuthStoreService.useRedisState();

    // Instantiate Baileys WASocket connection with optimized configuration
    this.socket = makeWASocket({
      auth: {
        creds: state.creds, // WhatsApp credentials (keys, tokens, phone registration)
        keys: state.keys,   // Signal protocol encryption key store
      },
      browser: Browsers.ubuntu('Chrome'),
      // Callback to retrieve stored messages from Redis for retries & poll vote decryption
      getMessage: async (key) => {
        const msg = await MessageStoreService.getMessage(key);
        return msg?.message ?? undefined;
      },
      // In-memory caches for fast multi-device encryption & retry counter tracking
      msgRetryCounterCache,
      userDevicesCache,
      // Callback to fetch cached group metadata from Redis (prevents API rate-limiting)
      cachedGroupMetadata: async (jid) => MessageStoreService.getCachedGroupMetadata(jid),
      // Fast startup & minimal memory footprint (bypass past history sync)
      syncFullHistory: false,
      shouldSyncHistoryMessage: () => false,
      // Do not force 24/7 online presence, show presence dynamically on activity
      markOnlineOnConnect: false,
      // Network stability for cloud & Docker deployments
      keepAliveIntervalMs: 30_000,
      defaultQueryTimeoutMs: 60_000,
      // High quality link preview generation
      generateHighQualityLinkPreview: true,
      // Scoped logger child instance for Baileys internal logs
      logger: logger.child({ module: 'baileys' }),
    });

    // Register all atomic event listeners, credential auto-saver, and auto-reconnect trigger
    registerEvents(
      this.socket,
      saveCreds,
      async () => {
        await this.connect();
      }
    );

    logger.info('[SocketService] Socket created, waiting for connection...');
    return this.socket;
  }

  /**
   * Gracefully close the active WhatsApp socket connection.
   */
  static close(): void {
    if (this.socket) {
      try {
        if (typeof this.socket.end === 'function') {
          this.socket.end(undefined);
        }
      } catch (err) {
        logger.warn({ err }, '[SocketService] Error while closing socket');
      }
      this.socket = null;
    }
  }
}
