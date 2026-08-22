import { describe, test, expect } from 'bun:test';
import menuPlugin from '@/plugins/(general)/menu/index';

import { PluginService } from '@/core/plugin';

import { TestHelper } from '@/utils/testing';

describe('plugins/general/menu', () => {
  test('menuPlugin generates and replies with structured menu string', async () => {
    await PluginService.load();

    let repliedText = '';
    const mockMessage = TestHelper.createMockMessage({
      text: '',
      reply: async (content: any) => {
        repliedText = typeof content === 'string' ? content : JSON.stringify(content);
        return undefined;
      },
    });

    await menuPlugin.exec(mockMessage, {} as any);

    expect(repliedText).toContain('Prefix:');
    expect(repliedText).toContain('menu');
  });

  test('menuPlugin filters commands by category query if provided', async () => {
    await PluginService.load();

    let repliedText = '';
    const mockMessage = TestHelper.createMockMessage({
      text: 'general',
      query: 'general',
      reply: async (content: any) => {
        repliedText = typeof content === 'string' ? content : JSON.stringify(content);
        return undefined;
      },
    });

    await menuPlugin.exec(mockMessage, {} as any);

    expect(repliedText).toContain('General');
  });
});
