import { describe, test, expect, spyOn } from 'bun:test';

import infoPlugin from '@/plugins/(general)/info/index';

import { RedisService } from '@/infra/redis';

import { TestHelper } from '@/utils/testing';

describe('plugins/general/info', () => {
  test('infoPlugin replies with system status and memory info', async () => {
    spyOn(RedisService, 'ping').mockImplementation(async () => 'PONG');
    let replyText = '';

    const mockMessage = TestHelper.createMockMessage({
      prefix: '.',
      command: 'info',
      body: '.info',
      reply: async (content: any) => {
        replyText = typeof content === 'string' ? content : JSON.stringify(content);
        return undefined;
      },
    });

    await infoPlugin.exec(mockMessage, {} as any);
    expect(replyText).toContain('Bot Information');
    expect(replyText).toContain('Runtime');
    expect(replyText).toContain('Bun');
  });
});
