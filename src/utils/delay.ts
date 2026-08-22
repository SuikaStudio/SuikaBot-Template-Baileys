import config from '@/config';

/**
 * Async sleep promise for specified duration in milliseconds.
 * - `await sleep()` ➔ Random human-like delay (config.rateLimit.minDelayMs - maxDelayMs).
 * - `await sleep(1000)` ➔ Fixed delay in milliseconds.
 * - `await sleep(500, 1500)` ➔ Random delay within custom range [min, max].
 */
export const sleep = (minMs?: number, maxMs?: number): Promise<void> => {
  let delay: number;

  if (typeof minMs === 'number' && typeof maxMs === 'number') {
    const min = Math.min(minMs, maxMs);
    const max = Math.max(minMs, maxMs);
    delay = Math.floor(Math.random() * (max - min + 1)) + min;
  } else if (typeof minMs === 'number') {
    delay = minMs;
  } else {
    // Default: random human-like delay (anti-ban)
    const min = config.rateLimit.minDelayMs;
    const max = config.rateLimit.maxDelayMs;
    delay = Math.floor(Math.random() * (max - min + 1)) + min;
  }

  return new Promise((resolve) => setTimeout(resolve, delay));
};
