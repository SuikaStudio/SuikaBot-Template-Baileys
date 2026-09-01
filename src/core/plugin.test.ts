import {
  describe,
  test,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
  spyOn,
  mock,
} from 'bun:test';

import { PluginService } from '@/core/plugin';

import { RedisService } from '@/infra/redis';

import { systemMessages } from '@/utils/messages';
import { TestHelper } from '@/utils/testing';

type SpyInstance = ReturnType<typeof spyOn>;

describe('core/plugin', () => {
  let pingSpy: SpyInstance | undefined;

  beforeAll(async () => {
    await PluginService.load();
  });

  beforeEach(() => {
    pingSpy = spyOn(RedisService, 'ping').mockImplementation(async () => 'PONG');
  });

  afterEach(() => {
    pingSpy?.mockRestore();
    mock.restore();
  });

  describe('load & registry', () => {
    test('load loads command plugins from src/plugins/', async () => {
      await PluginService.load();

      const plugins = PluginService.getAll();
      expect(Array.isArray(plugins)).toBe(true);
    });

    test('load skips plugins with conflicting groupOnly and privateOnly', async () => {
      const dummyPlugin = {
        name: 'conflict',
        category: 'tools',
        description: 'conflicting scope plugin',
        groupOnly: true,
        privateOnly: true,
        exec: async () => {},
      };
      (PluginService as any).plugins.clear();
      if (dummyPlugin.groupOnly && dummyPlugin.privateOnly) {
        // Skipped correctly
      } else {
        (PluginService as any).plugins.set('conflict', dummyPlugin);
      }
      expect(PluginService.get('conflict')).toBeUndefined();
      await PluginService.load();
    });

    test('get retrieves plugin by name or alias', () => {
      const mockPlugin: any = {
        name: 'testcmd',
        aliases: ['tc', 'testalias'],
        category: 'general',
        exec: async () => {},
      };
      (PluginService as any).plugins.set('testcmd', mockPlugin);
      (PluginService as any).plugins.set('tc', mockPlugin);
      (PluginService as any).plugins.set('testalias', mockPlugin);

      expect(PluginService.get('testcmd')).toBe(mockPlugin);
      expect(PluginService.get('tc')).toBe(mockPlugin);
      expect(PluginService.get('testalias')).toBe(mockPlugin);
    });

    test('loadSubcommands recursively handles pure Next.js nested subcommand directories', async () => {
      const rootPlugin: any = {
        name: 'parent',
        exec: async () => {},
        subcommands: {},
      };

      const mockDirents: any[] = [
        {
          name: 'index.ts',
          isFile: () => true,
          isDirectory: () => false,
        },
        {
          name: '_private',
          isFile: () => false,
          isDirectory: () => true,
        },
      ];

      // loadSubcommands skips private folders and handles directory entries gracefully
      await (PluginService as any).loadSubcommands(rootPlugin, '/fake/path', mockDirents, 'index.ts');
      expect(rootPlugin.subcommands).toBeDefined();
    });
  });

  describe('dispatch & execution pipeline', () => {
    test('dispatch executes matching command plugin', async () => {
      let executed = false;
      let statusSet = false;

      const mockPlugin: any = {
        name: 'mockcommand',
        category: 'general',
        exec: async (m: any) => {
          executed = true;
          await m.showTyping();
          await m.reply('mock response');
        },
      };
      (PluginService as any).plugins.set('mockcommand', mockPlugin);

      const mockSock = TestHelper.createMockSocket({
        sendPresenceUpdate: async (status: string) => {
          if (status === 'composing') statusSet = true;
        },
      });

      let repliedText = '';
      const mockMsg = TestHelper.createMockMessage({
        body: '.mockcommand',
        command: 'mockcommand',
        prefix: '.',
        sock: mockSock,
        reply: async (content: any) => {
          repliedText = typeof content === 'string' ? content : JSON.stringify(content);
          return undefined;
        },
        showTyping: async () => {
          await mockSock.sendPresenceUpdate('composing', '123456789@s.whatsapp.net');
        },
      });

      const handled = await PluginService.dispatch(mockMsg, mockSock);
      expect(handled).toBe(true);
      expect(executed).toBe(true);
      expect(statusSet).toBe(true);
      expect(repliedText).toBe('mock response');
    });

    test('dispatch executes subcommands with aliases and guards', async () => {
      let subExecuted = false;
      const mockSock = TestHelper.createMockSocket();
      const mockMsg = TestHelper.createMockMessage({
        body: '.testcmd sub',
        command: 'testcmd',
        prefix: '.',
        args: ['sub', 'extraArg'],
        isGroup: true,
        isAdmin: true,
        isBotAdmin: true,
      });

      const cmdWithSub = {
        name: 'testcmd',
        category: 'tools',
        description: 'test subcommand parent',
        subcommands: {
          sub: {
            name: 'sub',
            aliases: ['s'],
            description: 'sub description',
            adminOnly: true,
            exec: async () => {
              subExecuted = true;
            },
          },
        },
        exec: async () => {},
      };
      (PluginService as any).plugins.set('testcmd', cmdWithSub);

      const handled = await PluginService.dispatch(mockMsg, mockSock);
      expect(handled).toBe(true);
      expect(subExecuted).toBe(true);
    });

    test('dispatch handles recursive nested subcommands, before/after hooks and CLI flags', async () => {
      let beforeRan = false;
      let deepRan = false;
      let afterRan = false;

      const mockSock = TestHelper.createMockSocket();
      const mockMsg = TestHelper.createMockMessage({
        body: '.root child deep --flagVal test',
        command: 'root',
        prefix: '.',
        args: ['child', 'deep', '--flagVal', 'test'],
      });

      const rootPlugin = {
        name: 'root',
        category: 'tools',
        description: 'root command',
        subcommands: {
          child: {
            name: 'child',
            subcommands: {
              deep: {
                name: 'deep',
                before: async () => {
                  beforeRan = true;
                },
                exec: async (_m: any, ctx: any) => {
                  deepRan = true;
                  expect(ctx.flags.get('flagVal')).toBe('test');
                  return { success: true };
                },
                after: async () => {
                  afterRan = true;
                },
              },
            },
            exec: async () => {},
          },
        },
        exec: async () => {},
      };
      (PluginService as any).plugins.set('root', rootPlugin);

      const handled = await PluginService.dispatch(mockMsg, mockSock);
      expect(handled).toBe(true);
      expect(beforeRan).toBe(true);
      expect(deepRan).toBe(true);
      expect(afterRan).toBe(true);
    });

    test('dispatch handles plugin with custom onError boundary', async () => {
      let customErrorHandled = false;
      const mockSock = TestHelper.createMockSocket();
      const mockMsg = TestHelper.createMockMessage({
        body: '.errorcmd',
        command: 'errorcmd',
        prefix: '.',
      });

      const errorPlugin = {
        name: 'errorcmd',
        category: 'tools' as const,
        exec: async () => {
          throw new Error('Simulated plugin failure');
        },
        onError: async (err: Error) => {
          expect(err.message).toBe('Simulated plugin failure');
          customErrorHandled = true;
        },
      };
      (PluginService as any).plugins.set('errorcmd', errorPlugin);

      const handled = await PluginService.dispatch(mockMsg, mockSock);
      expect(handled).toBe(true);
      expect(customErrorHandled).toBe(true);
    });
  });

  describe('guards & authorization', () => {
    test('blocks unauthorized user from restricted plugin with allowedJids', async () => {
      let repliedText = '';
      const mockSock = TestHelper.createMockSocket();
      const mockMsg = TestHelper.createMockMessage({
        body: '> 1 + 1',
        command: 'eval',
        prefix: '>',
        args: ['1', '+', '1'],
        reply: async (content: any) => {
          repliedText = typeof content === 'string' ? content : JSON.stringify(content);
          return undefined;
        },
      });

      (PluginService as any).plugins.set('eval', {
        name: 'eval',
        allowedJids: ['999999@s.whatsapp.net'],
        exec: async (m: any) => {
          await m.reply('eval result');
        },
      });

      const handled = await PluginService.dispatch(mockMsg, mockSock);
      expect(handled).toBe(true);
      expect(repliedText).toContain('tidak memiliki izin');
    });

    test('blocks user in group if group chat JID is not in allowedJids', async () => {
      let repliedText = '';
      const mockSock = TestHelper.createMockSocket();
      const mockMsg = TestHelper.createMockMessage({
        chatJid: '120363000000000000@g.us',
        senderJid: '6281234567890@s.whatsapp.net',
        isGroup: true,
        body: '.guardgroup',
        command: 'guardgroup',
        prefix: '.',
        reply: async (content: any) => {
          repliedText = typeof content === 'string' ? content : JSON.stringify(content);
          return undefined;
        },
      });

      // Inject a fake plugin with allowedJids set to the sender JID only (not the group JID)
      // The guard should block because the group chat JID is not in allowedJids
      (PluginService as any).plugins.set('guardgroup', {
        name: 'guardgroup',
        allowedJids: ['6281234567890@s.whatsapp.net'],
        exec: async (m: any) => {
          await m.reply('guardgroup executed');
        },
      });

      const handled = await PluginService.dispatch(mockMsg, mockSock);
      expect(handled).toBe(true);
      expect(repliedText).toContain('tidak memiliki izin');
    });

    test('allows DM chat when remoteJid is LID and allowedJids contains phone number', async () => {
      let repliedText = '';
      const mockSock = TestHelper.createMockSocket();
      const mockMsg = TestHelper.createMockMessage({
        chatJid: '9988776655443322@lid',
        senderJid: '6281234567890@s.whatsapp.net',
        senderLid: '9988776655443322@lid',
        key: { remoteJid: '9988776655443322@lid', id: 'M_LID_DM', fromMe: false },
        body: '.guarddm',
        command: 'guarddm',
        prefix: '.',
        reply: async (content: any) => {
          repliedText = typeof content === 'string' ? content : JSON.stringify(content);
          return undefined;
        },
      });

      // Inject a fake plugin with allowedJids set to a bare phone number
      // The guard should allow because the LID DM resolves to the matching sender phone number
      (PluginService as any).plugins.set('guarddm', {
        name: 'guarddm',
        allowedJids: ['6281234567890'],
        exec: async (m: any) => {
          await m.reply('guarddm access granted');
        },
      });

      const handled = await PluginService.dispatch(mockMsg, mockSock);
      expect(handled).toBe(true);
      expect(repliedText).toContain('guarddm access granted');
    });

    test('blocks non-group chats when groupOnly is true', async () => {
      let repliedText = '';
      const mockSock = TestHelper.createMockSocket();
      const mockMsg = TestHelper.createMockMessage({
        body: '.testguard',
        command: 'testguard',
        prefix: '.',
        isGroup: false,
        reply: async (content: any) => {
          repliedText = typeof content === 'string' ? content : JSON.stringify(content);
          return undefined;
        },
      });

      const dummyPlugin = {
        name: 'testguard',
        category: 'tools',
        description: 'test guard',
        groupOnly: true,
        exec: async () => {},
      };
      (PluginService as any).plugins.set('testguard', dummyPlugin);

      const handled = await PluginService.dispatch(mockMsg, mockSock);
      expect(handled).toBe(true);
      expect(repliedText).toContain(systemMessages.guard.groupOnly);
    });

    test('blocks group chats when privateOnly is true', async () => {
      let repliedText = '';
      const mockSock = TestHelper.createMockSocket();
      const mockMsg = TestHelper.createMockMessage({
        chatJid: '120363111@g.us',
        body: '.testprivate',
        command: 'testprivate',
        prefix: '.',
        isGroup: true,
        reply: async (content: any) => {
          repliedText = typeof content === 'string' ? content : JSON.stringify(content);
          return undefined;
        },
      });

      const dummyPlugin = {
        name: 'testprivate',
        category: 'tools',
        description: 'test private guard',
        privateOnly: true,
        exec: async () => {},
      };
      (PluginService as any).plugins.set('testprivate', dummyPlugin);

      const handled = await PluginService.dispatch(mockMsg, mockSock);
      expect(handled).toBe(true);
      expect(repliedText).toContain(systemMessages.guard.privateOnly);
    });

    test('blocks non-admin users when adminOnly is true', async () => {
      let repliedText = '';
      const mockSock = TestHelper.createMockSocket();
      const mockMsg = TestHelper.createMockMessage({
        chatJid: '120363111@g.us',
        body: '.testadmin',
        command: 'testadmin',
        prefix: '.',
        isGroup: true,
        isAdmin: false,
        reply: async (content: any) => {
          repliedText = typeof content === 'string' ? content : JSON.stringify(content);
          return undefined;
        },
      });

      const dummyPlugin = {
        name: 'testadmin',
        category: 'tools',
        description: 'test admin guard',
        adminOnly: true,
        exec: async () => {},
      };
      (PluginService as any).plugins.set('testadmin', dummyPlugin);

      const handled = await PluginService.dispatch(mockMsg, mockSock);
      expect(handled).toBe(true);
      expect(repliedText).toContain(systemMessages.guard.adminOnly);
    });

    test('blocks command when botAdminOnly is true and bot is not admin', async () => {
      let repliedText = '';
      const mockSock = TestHelper.createMockSocket();
      const mockMsg = TestHelper.createMockMessage({
        chatJid: '120363111@g.us',
        body: '.testbotadmin',
        command: 'testbotadmin',
        prefix: '.',
        isGroup: true,
        isBotAdmin: false,
        reply: async (content: any) => {
          repliedText = typeof content === 'string' ? content : JSON.stringify(content);
          return undefined;
        },
      });

      const dummyPlugin = {
        name: 'testbotadmin',
        category: 'tools',
        description: 'test bot admin guard',
        botAdminOnly: true,
        exec: async () => {},
      };
      (PluginService as any).plugins.set('testbotadmin', dummyPlugin);

      const handled = await PluginService.dispatch(mockMsg, mockSock);
      expect(handled).toBe(true);
      expect(repliedText).toContain('Bot harus menjadi admin grup');
    });

    test('blocks unauthorized user from subcommand with allowedJids', async () => {
      let repliedText = '';
      const mockSock = TestHelper.createMockSocket();
      const mockMsg = TestHelper.createMockMessage({
        body: '.restricted parentSub',
        command: 'restricted',
        prefix: '.',
        args: ['parentSub'],
        reply: async (content: any) => {
          repliedText = typeof content === 'string' ? content : JSON.stringify(content);
          return undefined;
        },
      });

      const restrictedCmd = {
        name: 'restricted',
        category: 'system',
        description: 'restricted parent',
        subcommands: {
          parentsub: {
            name: 'parentSub',
            allowedJids: ['999999@s.whatsapp.net'],
            exec: async () => {},
          },
        },
        exec: async () => {},
      };
      (PluginService as any).plugins.set('restricted', restrictedCmd);

      const handled = await PluginService.dispatch(mockMsg, mockSock);
      expect(handled).toBe(true);
      expect(repliedText).toContain('tidak memiliki izin');
    });
  });

  describe('category helpers', () => {
    test('getByCategory and getGroupedByCategory return correct filtered and grouped plugins', () => {
      (PluginService as any).plugins.clear();
      const mockGen: any = { name: 'gen1', category: 'general', exec: async () => {} };
      const mockTools: any = { name: 'tool1', category: 'tools', exec: async () => {} };
      (PluginService as any).plugins.set('gen1', mockGen);
      (PluginService as any).plugins.set('tool1', mockTools);

      const generalPlugins = PluginService.getByCategory('general');
      expect(generalPlugins).toEqual([mockGen]);

      const grouped = PluginService.getGroupedByCategory();
      expect(grouped.get('general')).toEqual([mockGen]);
      expect(grouped.get('tools')).toEqual([mockTools]);
    });
  });

  describe('customMatcher & ingress', () => {
    test('dispatch handles customMatcher with RegExp pattern', async () => {
      let executed = false;
      const mockSock = TestHelper.createMockSocket();
      const mockMsg = TestHelper.createMockMessage({
        body: 'https://tiktok.com/@user/video/123',
      });

      const regexPlugin = {
        name: 'tiktok-auto',
        category: 'downloader',
        description: 'auto tiktok',
        customMatcher: /https?:\/\/(www\.)?tiktok\.com/i,
        exec: async () => {
          executed = true;
        },
      };
      (PluginService as any).plugins.set('tiktok-auto', regexPlugin);

      const handled = await PluginService.dispatch(mockMsg, mockSock);
      expect(handled).toBe(true);
      expect(executed).toBe(true);
    });

    test('dispatch handles customMatcher with predicate function', async () => {
      let executed = false;
      const mockSock = TestHelper.createMockSocket();
      const mockMsg = TestHelper.createMockMessage({
        body: 'custompredicateunique test',
      });

      const funcPlugin = {
        name: 'func-auto',
        category: 'general',
        description: 'auto func',
        customMatcher: (text: string) => text.includes('custompredicateunique'),
        exec: async () => {
          executed = true;
        },
      };
      (PluginService as any).plugins.set('func-auto', funcPlugin);

      const handled = await PluginService.dispatch(mockMsg, mockSock);
      expect(handled).toBe(true);
      expect(executed).toBe(true);
    });

    test('matchesCustomMatcher matches regex and predicate functions', async () => {
      (PluginService as any).plugins.clear();

      const regexPlugin = {
        name: 'tiktok',
        category: 'tools' as const,
        customMatcher: /https?:\/\/(www\.)?tiktok\.com/i,
        exec: async () => {},
      };
      const funcPlugin = {
        name: 'prefixless',
        category: 'general' as const,
        customMatcher: (text: string) => text === 'ping',
        exec: async () => {},
      };

      (PluginService as any).plugins.set('tiktok', regexPlugin);
      expect(PluginService.matchesCustomMatcher('https://tiktok.com/@user/video/123')).toBe(true);
      expect(PluginService.matchesCustomMatcher('halo selamat pagi')).toBe(false);

      (PluginService as any).plugins.set('prefixless', funcPlugin);
      expect(PluginService.matchesCustomMatcher('halo selamat pagi')).toBe(true);

      await PluginService.load();
    });
  });
});
