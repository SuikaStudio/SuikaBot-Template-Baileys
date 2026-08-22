import { serve, type Server } from 'bun';
import logger from '@/utils/logger';

export type WebhookHandler = (req: Request) => Promise<Response> | Response;

export class WebhookService {
  private static server: Server<unknown> | null = null;
  private static routes = new Map<string, WebhookHandler>();

  /**
   * Register an HTTP route endpoint for incoming webhooks or callbacks.
   */
  static registerRoute(path: string, handler: WebhookHandler): void {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    this.routes.set(normalizedPath, handler);
    logger.info({ path: normalizedPath }, '[WebhookService] Route registered');
  }

  /**
   * Start the embedded Bun HTTP server for listening to incoming webhooks.
   */
  static start(port = Number(process.env['WEBHOOK_PORT'] ?? 3000)): void {
    if (this.server) return;

    this.server = serve({
      port,
      fetch: async (req: Request) => {
        const url = new URL(req.url);
        const handler = this.routes.get(url.pathname);

        if (handler) {
          try {
            return await handler(req);
          } catch (err) {
            logger.error({ err, path: url.pathname }, '[WebhookService] Error executing webhook handler');
            return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            });
          }
        }

        return new Response(JSON.stringify({ message: 'SuikaBot Webhook Server Active', path: url.pathname }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    });

    logger.info({ port }, '[WebhookService] Embedded HTTP server started');
  }

  /**
   * Stop the embedded HTTP webhook server.
   */
  static stop(): void {
    if (this.server) {
      this.server.stop();
      this.server = null;
      logger.info('[WebhookService] Embedded HTTP server stopped');
    }
  }
}
