import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { ChatStateService } from '@/services/chatState';
import { TestHelper } from '@/utils/testing';

describe('services/chatState', () => {
  const chatJid = '123456789@s.whatsapp.net';
  const stateKey = 'registration_step';
  let redis: ReturnType<typeof TestHelper.mockRedis>;

  beforeEach(() => {
    redis = TestHelper.mockRedis();
  });

  afterEach(() => {
    redis.restore();
  });

  test('set() stores JSON serialized chat state in Redis', async () => {
    await ChatStateService.set(chatJid, stateKey, { step: 1, name: 'Alice' }, 60);

    const stored = await ChatStateService.get<{ step: number; name: string }>(chatJid, stateKey);
    expect(stored).toEqual({ step: 1, name: 'Alice' });
  });

  test('has() returns true if state exists and false if missing', async () => {
    expect(await ChatStateService.has(chatJid, stateKey)).toBe(false);

    await ChatStateService.set(chatJid, stateKey, { active: true });
    expect(await ChatStateService.has(chatJid, stateKey)).toBe(true);
  });

  test('get() returns null for non-existent state keys', async () => {
    const data = await ChatStateService.get(chatJid, 'unknown_key');
    expect(data).toBeNull();
  });

  test('del() removes stored chat state from Redis', async () => {
    await ChatStateService.set(chatJid, stateKey, { step: 2 });
    expect(await ChatStateService.has(chatJid, stateKey)).toBe(true);

    await ChatStateService.del(chatJid, stateKey);
    expect(await ChatStateService.has(chatJid, stateKey)).toBe(false);
    expect(await ChatStateService.get(chatJid, stateKey)).toBeNull();
  });
});
