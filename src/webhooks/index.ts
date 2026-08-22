import { readdirSync } from 'fs';
import { join } from 'path';

import { WebhookService } from '@/infra/webhook';

import type { WebhookRoute } from '@/types/webhook';

import config from '@/config';

import logger from '@/utils/logger';

export const initWebhooks = async (customPort?: number): Promise<void> => {
  if (!config.webhook.enabled) {
    logger.info('[Webhooks] Webhook server is disabled (ENABLE_WEBHOOK=false)');
    return;
  }

  const webhooksDir = import.meta.dir;
  const entries = readdirSync(webhooksDir);

  let loadedCount = 0;

  for (const entry of entries) {
    if (
      entry.endsWith('.ts') &&
      !entry.endsWith('.test.ts') &&
      !entry.endsWith('.spec.ts') &&
      entry !== 'index.ts'
    ) {
      const fullPath = join(webhooksDir, entry);

      try {
        const module = await import(fullPath);
        const route = (module.default ?? module) as WebhookRoute;

        if (route && route.path && typeof route.handler === 'function') {
          WebhookService.registerRoute(route.path, route.handler);
          loadedCount += 1;
        }
      } catch (err) {
        logger.error({ err, file: entry }, '[Webhooks] Failed to load webhook module');
      }
    }
  }

  // Start embedded HTTP server after all routes are registered
  const port = customPort ?? (process.env['NODE_ENV'] === 'test' || Boolean(process.env['BUN_TEST']) ? 3098 : config.webhook.port);
  WebhookService.start(port);
  logger.info({ count: loadedCount, port }, '[Webhooks] Webhook server and routes ready');
};
