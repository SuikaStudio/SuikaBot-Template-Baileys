import { describe, test, expect } from 'bun:test';
import { HttpService } from '@/infra/http';

describe('infra/http', () => {
  test('getJson fetches and parses JSON response', async () => {
    // Test using a reliable public JSON endpoint
    const data = await HttpService.getJson<{ title: string }>('https://jsonplaceholder.typicode.com/todos/1');
    expect(data).toHaveProperty('title');
  });

  test('getBuffer fetches binary buffer content', async () => {
    const buffer = await HttpService.getBuffer('https://jsonplaceholder.typicode.com/todos/1');
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(0);
  });

  test('getStream fetches ReadableStream content', async () => {
    const stream = await HttpService.getStream('https://jsonplaceholder.typicode.com/todos/1');
    expect(stream).toBeDefined();
    expect(typeof stream.getReader).toBe('function');
  });

  test('postJson posts payload and receives JSON response', async () => {
    const payload = { title: 'SuikaBot', body: 'Test', userId: 1 };
    const res = await HttpService.postJson<{ id: number }>('https://jsonplaceholder.typicode.com/posts', payload);
    expect(res).toHaveProperty('id');
  });
});
