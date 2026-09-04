import { describe, test, expect, spyOn, afterEach } from 'bun:test';
import { HttpService } from '@/infra/http';

describe('infra/http', () => {
  let fetchSpy: ReturnType<typeof spyOn>;

  afterEach(() => {
    fetchSpy?.mockRestore();
  });

  describe('getJson', () => {
    test('fetches and parses JSON response successfully', async () => {
      const mockData = { id: 1, title: 'Test Todo' };
      fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify(mockData), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const result = await HttpService.getJson<typeof mockData>('https://api.example.com/item');

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.example.com/item');
      expect(init?.signal).toBeDefined();
      expect(result).toEqual(mockData);
    });

    test('throws informative error on non-ok HTTP status with response body', async () => {
      fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ error: 'Item not found' }), {
          status: 404,
          statusText: 'Not Found',
        })
      );

      await expect(HttpService.getJson('https://api.example.com/item')).rejects.toThrow(
        /HTTP Error 404: Not Found - \{"error":"Item not found"\}/
      );
    });

    test('re-throws when fetch network call fails', async () => {
      fetchSpy = spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Connection refused'));

      await expect(HttpService.getJson('https://api.example.com/item')).rejects.toThrow(
        'Connection refused'
      );
    });
  });

  describe('getBuffer', () => {
    test('fetches binary buffer content successfully', async () => {
      const binaryData = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // PNG signature
      fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(binaryData, { status: 200 })
      );

      const buffer = await HttpService.getBuffer('https://api.example.com/image.png');

      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBe(4);
      expect(buffer[0]).toBe(0x89);
    });

    test('throws error on non-ok HTTP status for getBuffer', async () => {
      fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('Forbidden', { status: 403, statusText: 'Forbidden' })
      );

      await expect(HttpService.getBuffer('https://api.example.com/image.png')).rejects.toThrow(
        /HTTP Error 403: Forbidden - Forbidden/
      );
    });
  });

  describe('getStream', () => {
    test('fetches ReadableStream content successfully', async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('chunk 1'));
          controller.close();
        },
      });

      fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(stream, { status: 200 })
      );

      const resultStream = await HttpService.getStream('https://api.example.com/stream');

      expect(resultStream).toBeDefined();
      expect(typeof resultStream.getReader).toBe('function');
    });

    test('throws error when response body is null', async () => {
      const nullBodyResponse = new Response(null, { status: 200 });
      Object.defineProperty(nullBodyResponse, 'body', { value: null });

      fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(nullBodyResponse);

      await expect(HttpService.getStream('https://api.example.com/stream')).rejects.toThrow(
        /HTTP Response body is null/
      );
    });
  });

  describe('postJson', () => {
    test('posts JSON payload and returns response', async () => {
      const payload = { title: 'SuikaBot', userId: 1 };
      const responseData = { id: 101, ...payload };

      fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify(responseData), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const result = await HttpService.postJson<typeof responseData>(
        'https://api.example.com/posts',
        payload
      );

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.example.com/posts');
      expect(init.method).toBe('POST');
      expect(init.body).toBe(JSON.stringify(payload));
      expect(result).toEqual(responseData);
    });

    test('merges custom headers while preserving Content-Type', async () => {
      fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 })
      );

      await HttpService.postJson(
        'https://api.example.com/posts',
        { test: true },
        {
          headers: {
            Authorization: 'Bearer secret_token',
            'X-Custom-Header': 'custom-value',
          },
        }
      );

      const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers.Authorization).toBe('Bearer secret_token');
      expect(headers['X-Custom-Header']).toBe('custom-value');
    });

    test('throws error when server responds with 400 Bad Request', async () => {
      fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ detail: 'Missing required field' }), {
          status: 400,
          statusText: 'Bad Request',
        })
      );

      await expect(
        HttpService.postJson('https://api.example.com/posts', {})
      ).rejects.toThrow(/HTTP Error 400: Bad Request - \{"detail":"Missing required field"\}/);
    });
  });

  describe('Signal handling', () => {
    test('supports user-provided AbortSignal composed with timeout', async () => {
      const controller = new AbortController();
      fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ status: 'ok' }), { status: 200 })
      );

      await HttpService.getJson('https://api.example.com/status', {
        signal: controller.signal,
      });

      const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(init?.signal).toBeDefined();
      expect(init?.signal?.aborted).toBe(false);
    });
  });
});
