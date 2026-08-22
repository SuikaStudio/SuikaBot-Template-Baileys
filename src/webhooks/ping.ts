import type { WebhookRoute } from '@/types/webhook';

import logger from '@/utils/logger';

const pingWebhook: WebhookRoute = {
  path: '/webhook/ping',
  async handler(req: Request) {
    try {
      const url = new URL(req.url);
      logger.info({ path: url.pathname, method: req.method }, '[Webhooks] Ping webhook received');

      return new Response(
        JSON.stringify({
          status: 'ok',
          message: 'pong',
          timestamp: Date.now(),
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    } catch (err) {
      logger.error({ err }, '[Webhooks] Failed to process ping webhook');
      return new Response(
        JSON.stringify({
          status: 'error',
          message: 'Internal server error',
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
  },
};

export default pingWebhook;
