import logger from '@/utils/logger';
import { validateRequiredEnv } from '@/utils/env';

import { RedisService } from '@/infra/redis';
import { WebhookService } from '@/infra/webhook';
import { CronService } from '@/infra/cron';

import { MessageQueueService } from '@/services/messageQueue';

import { SocketService } from '@/core/socket';
import { PluginService } from '@/core/plugin';

import { initSchedules } from '@/schedules/index';
import { initWebhooks } from '@/webhooks/index';

export const bootstrap = async (): Promise<void> => {
  // Validate required environment variables on startup
  validateRequiredEnv();

  // Verify Redis connectivity
  await RedisService.ping();
  logger.info('[bootstrap] Redis connection verified');

  // Initialize scheduled cron jobs
  await initSchedules();

  // Initialize webhook HTTP server
  await initWebhooks();

  // Load and register all bot command plugins
  await PluginService.load();

  // Connect to WhatsApp network
  await SocketService.connect();
};

export const shutdown = async (signal: string): Promise<void> => {
  logger.info(`[bootstrap] Received ${signal}. Shutting down gracefully...`);

  // Stop incoming traffic from schedules and webhooks
  CronService.stopAll();
  WebhookService.stop();

  // Cleanly close WhatsApp socket connection
  SocketService.close();

  // Process and complete pending message queue jobs
  await MessageQueueService.shutdown();

  // Disconnect Redis storage
  await RedisService.disconnect();

  process.exit(0);
};
