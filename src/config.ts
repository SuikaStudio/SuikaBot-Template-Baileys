import 'dotenv/config';

import { Formatter } from '@/utils/formatter';

const isTest = process.env['NODE_ENV'] === 'test' || Boolean(process.env['BUN_TEST']);
const isDev = process.env['NODE_ENV'] === 'development';
const nodeEnv = isTest
  ? 'test'
  : isDev
    ? 'development'
    : 'production';

const rawBotName = process.env['BOT_NAME'] ?? 'SuikaBot';
const sanitizedBotName = Formatter.slugify(rawBotName);

const config = {
  nodeEnv,
  tz: process.env['TZ'] ?? 'Asia/Jakarta',

  bot: {
    name: rawBotName,
    prefix: process.env['BOT_PREFIX'] ?? '.',
  },

  pairing: {
    usePairingCode: process.env['USE_PAIRING_CODE'] === 'true',
    phoneNumber: (process.env['PAIRING_NUMBER'] ?? '').replace(/[^0-9]/g, ''),
  },

  redis: {
    url: process.env['REDIS_URL'] ?? 'redis://localhost:6379',
    prefix: `${sanitizedBotName}:${nodeEnv}:`,
  },

  rateLimit: {
    minDelayMs: parseInt(process.env['RATE_LIMIT_MIN_DELAY_MS'] ?? '500', 10),
    maxDelayMs: parseInt(process.env['RATE_LIMIT_MAX_DELAY_MS'] ?? '1500', 10),
    maxConcurrent: parseInt(process.env['RATE_LIMIT_MAX_CONCURRENT'] ?? '10', 10),
  },

  schedules: {
    enabled: process.env['ENABLE_SCHEDULES'] !== 'false',
  },

  webhook: {
    enabled: process.env['ENABLE_WEBHOOK'] !== 'false',
    port: Number(process.env['WEBHOOK_PORT'] ?? 3000),
  },
} as const;

export type BotConfig = typeof config;
export default config;
