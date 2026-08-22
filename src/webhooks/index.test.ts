import { describe, it, expect, afterEach } from 'bun:test';
import { initWebhooks } from '@/webhooks/index';
import { WebhookService } from '@/infra/webhook';

describe('webhooks/index', () => {
  afterEach(() => {
    WebhookService.stop();
  });

  it('initWebhooks auto-loads webhook routes from src/webhooks/ folder', async () => {
    await initWebhooks(3098);

    const res = await fetch('http://localhost:3098/webhook/ping', {
      method: 'GET',
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as any;
    expect(body.status).toBe('ok');
    expect(body.message).toBe('pong');
  });
});
