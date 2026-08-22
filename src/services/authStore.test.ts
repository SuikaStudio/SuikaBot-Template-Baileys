import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { AuthStoreService } from '@/services/authStore';
import { TestHelper } from '@/utils/testing';

describe('services/authStore', () => {
  let redis: ReturnType<typeof TestHelper.mockRedis>;

  beforeEach(() => {
    redis = TestHelper.mockRedis();
  });

  afterEach(() => {
    redis.restore();
  });

  test('useRedisState initializes AuthState and saves creds to Redis', async () => {
    const authState = await AuthStoreService.useRedisState();
    expect(authState.state).toBeDefined();
    expect(authState.state.creds).toBeDefined();
    expect(authState.state.creds.noiseKey).toBeDefined();

    // Trigger saveCreds callback
    await authState.saveCreds();

    // Verify saved creds exist in testStore
    expect(redis.testStore.size).toBeGreaterThan(0);
  });

  test('clearState removes auth credentials and signal keys from Redis', async () => {
    const authState = await AuthStoreService.useRedisState();
    await authState.saveCreds();

    await AuthStoreService.clearState();
    expect(redis.testStore.size).toBe(0);
  });
});
