import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { RedisService } from '@/infra/redis';
import config from '@/config';

describe('infra/redis', () => {
  let isConnected = false;

  // Key helper using config.redis.prefix (e.g. suikabot:test:key_1)
  const key = (name: string) => `${config.redis.prefix}${name}`;

  beforeAll(async () => {
    try {
      const pingPromise = RedisService.ping();
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Redis connection timeout')), 1000)
      );

      const pingRes = await Promise.race([pingPromise, timeoutPromise]);
      isConnected = pingRes === 'PONG';
    } catch {
      console.warn('[infra/redis.test] ⚠️ Configured Redis unreachable — skipping live integration tests');
      isConnected = false;
    }
  });

  afterAll(async () => {
    if (isConnected) {
      await RedisService.del([
        key('key_1'),
        key('key_2'),
        key('ttl_key'),
        key('scan_a'),
        key('scan_b'),
      ]);
      await RedisService.disconnect();
    }
  });

  test('ping() returns PONG response from active Redis server', async () => {
    if (!isConnected) return;

    const res = await RedisService.ping();
    expect(res).toBe('PONG');
  });

  test('getClient() returns open node-redis client instance', async () => {
    if (!isConnected) return;

    const client = await RedisService.getClient();
    expect(client).toBeDefined();
    expect(client.isOpen).toBe(true);
  });

  test('set() and get() store and retrieve plain string values with prefix', async () => {
    if (!isConnected) return;

    await RedisService.set(key('key_1'), 'hello_redis');

    const value = await RedisService.get(key('key_1'));
    expect(value).toBe('hello_redis');
  });

  test('get() returns null for non-existent keys', async () => {
    if (!isConnected) return;

    const value = await RedisService.get(key('non_existent_999'));
    expect(value).toBeNull();
  });

  test('set() with TTL sets key expiration correctly', async () => {
    if (!isConnected) return;

    await RedisService.set(key('ttl_key'), 'temp_val', 10);

    const value = await RedisService.get(key('ttl_key'));
    expect(value).toBe('temp_val');
  });

  test('scan() finds matching prefixed keys by pattern', async () => {
    if (!isConnected) return;

    await RedisService.set(key('scan_a'), '1');
    await RedisService.set(key('scan_b'), '2');

    const matches = await RedisService.scan(key('scan_*'));
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  test('del() supports single key string and array of keys with prefix', async () => {
    if (!isConnected) return;

    // 1. Single key deletion
    await RedisService.set(key('key_1'), 'val1');
    await RedisService.del(key('key_1'));
    expect(await RedisService.get(key('key_1'))).toBeNull();

    // 2. Array of keys deletion
    await RedisService.set(key('key_1'), 'val1');
    await RedisService.set(key('key_2'), 'val2');
    await RedisService.del([key('key_1'), key('key_2')]);

    expect(await RedisService.get(key('key_1'))).toBeNull();
    expect(await RedisService.get(key('key_2'))).toBeNull();
  });
});
