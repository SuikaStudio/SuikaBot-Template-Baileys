import logger from '@/utils/logger';

const DEFAULT_TIMEOUT_MS = 15_000;

export class HttpService {
  /**
   * Safe fetch JSON from an external API with automatic timeout & error handling.
   */
  static async getJson<T>(url: string, options?: RequestInit, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
    try {
      const res = await fetch(url, {
        ...options,
        signal: this.resolveSignal(options, timeoutMs),
      });

      await this.assertResponseOk(res);
      return (await res.json()) as T;
    } catch (err) {
      logger.error({ err, url }, '[HttpService] Failed to fetch JSON');
      throw err;
    }
  }

  /**
   * Safe fetch Buffer (e.g. for media downloads, images, audio) with automatic timeout.
   */
  static async getBuffer(url: string, options?: RequestInit, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Buffer> {
    try {
      const res = await fetch(url, {
        ...options,
        signal: this.resolveSignal(options, timeoutMs),
      });

      await this.assertResponseOk(res);
      const arrayBuffer = await res.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (err) {
      logger.error({ err, url }, '[HttpService] Failed to fetch Buffer');
      throw err;
    }
  }

  /**
   * Safe fetch ReadableStream (e.g. for consuming streaming API endpoints) with automatic timeout.
   */
  static async getStream(
    url: string,
    options?: RequestInit,
    timeoutMs = DEFAULT_TIMEOUT_MS
  ): Promise<ReadableStream<Uint8Array>> {
    try {
      const res = await fetch(url, {
        ...options,
        signal: this.resolveSignal(options, timeoutMs),
      });

      await this.assertResponseOk(res);

      if (!res.body) {
        throw new Error(`HTTP Response body is null for ${url}`);
      }

      return res.body;
    } catch (err) {
      logger.error({ err, url }, '[HttpService] Failed to fetch ReadableStream');
      throw err;
    }
  }

  /**
   * Safe POST JSON payload to an external API with automatic timeout.
   */
  static async postJson<T>(url: string, body: unknown, options?: RequestInit, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
    try {
      const res = await fetch(url, {
        ...options,
        method: 'POST',
        body: JSON.stringify(body),
        headers: {
          'Content-Type': 'application/json',
          ...options?.headers,
        },
        signal: this.resolveSignal(options, timeoutMs),
      });

      await this.assertResponseOk(res);
      return (await res.json()) as T;
    } catch (err) {
      logger.error({ err, url }, '[HttpService] Failed to post JSON');
      throw err;
    }
  }

    /**
   * Compose user-provided AbortSignal with automatic timeout.
   */
  private static resolveSignal(options?: RequestInit, timeoutMs = DEFAULT_TIMEOUT_MS): AbortSignal {
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    if (!options?.signal) {
      return timeoutSignal;
    }
    return AbortSignal.any([options.signal, timeoutSignal]);
  }

  /**
   * Validate HTTP response status and extract error message detail when non-2xx.
   */
  private static async assertResponseOk(res: Response): Promise<void> {
    if (!res.ok) {
      const errorBody = await res.text().catch(() => '');
      const detail = errorBody ? ` - ${errorBody.slice(0, 300)}` : '';
      throw new Error(`HTTP Error ${res.status}: ${res.statusText}${detail}`);
    }
  }
}
