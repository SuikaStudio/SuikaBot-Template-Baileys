import { describe, test, expect, afterAll } from 'bun:test';
import { WebhookService } from '@/infra/webhook';

describe('infra/webhook', () => {
  afterAll(() => {
    WebhookService.stop();
  });

  test('WebhookService registers route and handles HTTP request', async () => {
    const testPort = 3099;
    
    WebhookService.registerRoute('/webhook/test', async (req) => {
      const data = await req.json();
      return new Response(JSON.stringify({ status: 'ok', received: data }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    WebhookService.start(testPort);

    const res = await fetch(`http://localhost:${testPort}/webhook/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ping: 'pong' }),
    });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json).toEqual({ status: 'ok', received: { ping: 'pong' } });
  });

  test('WebhookService returns 404 for unregistered routes', async () => {
    const testPort = 3099;
    const res = await fetch(`http://localhost:${testPort}/unknown-route`);
    expect(res.status).toBe(404);
  });
});
