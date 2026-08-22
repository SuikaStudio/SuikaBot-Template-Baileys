import { describe, test, expect } from 'bun:test';

import { sleep } from '@/utils/delay';

describe('utils/delay', () => {
  test('sleep pauses execution for specified fixed duration', async () => {
    const start = Date.now();
    await sleep(50);

    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(45);
  });

  test('sleep supports custom min and max random range', async () => {
    const start = Date.now();
    await sleep(30, 60);

    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(25);
  });
});
