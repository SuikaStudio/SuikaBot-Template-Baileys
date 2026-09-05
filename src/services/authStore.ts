import {
  BufferJSON,
  initAuthCreds,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
  proto,
  type AuthenticationState,
  type SignalDataTypeMap,
} from '@whiskeysockets/baileys';
import { RedisService } from '@/infra/redis';
import logger from '@/utils/logger';
import config from '@/config';

type AuthState = Awaited<ReturnType<typeof useMultiFileAuthState>>;

const credsKey = (): string => `${config.redis.prefix}auth:creds`;
const keyKey = (type: string, id: string): string =>
  `${config.redis.prefix}auth:keys:${type}:${id}`;

export class AuthStoreService {
  /**
   * Production Redis-backed AuthenticationState for Baileys.
   */
  static async useRedisState(): Promise<AuthState> {
    const creds = await this.loadCreds();

    const keys = makeCacheableSignalKeyStore(
      {
        get: (type, ids) => this.fetchKeys(type, ids),
        set: (data) => this.saveKeys(data),
        clear: () => this.clearKeys(),
      },
      logger
    );

    const state: AuthenticationState = { creds, keys };

    return {
      state,
      saveCreds: () => this.saveCreds(state.creds),
    };
  }

  /**
   * Clear all stored credentials and signal keys on logout.
   */
  static async clearState(): Promise<void> {
    await RedisService.del(credsKey());
    await this.clearKeys();
    logger.info('[AuthStoreService] Auth state cleared from Redis');
  }

  private static async loadCreds(): Promise<AuthenticationState['creds']> {
    const raw = await RedisService.get(credsKey());
    return raw
      ? (JSON.parse(raw, BufferJSON.reviver) as AuthenticationState['creds'])
      : initAuthCreds();
  }

  private static async saveCreds(creds: AuthenticationState['creds']): Promise<void> {
    await RedisService.set(credsKey(), JSON.stringify(creds, BufferJSON.replacer));
  }

  private static async fetchKeys<T extends keyof SignalDataTypeMap>(
    type: T,
    ids: string[]
  ): Promise<{ [id: string]: SignalDataTypeMap[T] }> {
    if (ids.length === 0) return {};

    const redis = await RedisService.getClient();
    const multi = redis.multi();
    for (const id of ids) {
      multi.get(keyKey(type, id));
    }

    const results = (await multi.exec()) as Array<string | null>;
    const data: { [id: string]: SignalDataTypeMap[T] } = {};

    results.forEach((value, index) => {
      if (value) {
        const id = ids[index];
        if (id !== undefined) {
          const parsed = JSON.parse(value, BufferJSON.reviver) as unknown;
          const item =
            type === 'app-state-sync-key' && parsed && typeof parsed === 'object'
              ? (proto.Message.AppStateSyncKeyData.fromObject(
                  parsed as Record<string, unknown>
                ) as unknown as SignalDataTypeMap[T])
              : (parsed as SignalDataTypeMap[T]);
          data[id] = item;
        }
      }
    });

    return data;
  }

  private static async saveKeys(data: Record<string, Record<string, unknown>>): Promise<void> {
    const redis = await RedisService.getClient();
    const multi = redis.multi();
    let count = 0;

    for (const [type, items] of Object.entries(data)) {
      for (const [id, value] of Object.entries(items)) {
        count++;
        if (value != null) {
          multi.set(keyKey(type, id), JSON.stringify(value, BufferJSON.replacer));
        } else {
          multi.del(keyKey(type, id));
        }
      }
    }

    if (count > 0) {
      await multi.exec();
    }
  }

  private static async clearKeys(): Promise<void> {
    const pattern = `${config.redis.prefix}auth:keys:*`;

    const matchingKeys = await RedisService.scan(pattern);
    if (matchingKeys.length > 0) {
      await RedisService.del(matchingKeys);
    }

    logger.info('[AuthStoreService] Cleared all Signal keys');
  }
}
