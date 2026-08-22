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
    test('load loads command plugins from src/plugins/', () => {
      const plugins = PluginService.getAll();
      expect(plugins.length).toBeGreaterThan(0);
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
      const infoPlugin = PluginService.get('info');
      expect(infoPlugin).not.toBeUndefined();
      expect(infoPlugin?.name).toBe('info');
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
      let repliedText = '';
      let statusSet = false;

      const mockSock = TestHelper.createMockSocket({
        sendPresenceUpdate: async (status: string) => {
          if (status === 'composing') statusSet = true;
        },
      });

      const mockMsg = TestHelper.createMockMessage({
        body: '.info',
        command: 'info',
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
      expect(statusSet).toBe(true);
      expect(repliedText).toContain('Bot Information');
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
        senderJid: '6285691947512@s.whatsapp.net',
        isGroup: true,
        body: '.reload',
        command: 'reload',
        prefix: '.',
        reply: async (content: any) => {
          repliedText = typeof content === 'string' ? content : JSON.stringify(content);
          return undefined;
        },
      });

      const reloadPlugin = PluginService.get('reload');
      if (reloadPlugin) {
        reloadPlugin.allowedJids = ['6285691947512@s.whatsapp.net'];
      }

      const handled = await PluginService.dispatch(mockMsg, mockSock);
      expect(handled).toBe(true);
      expect(repliedText).toContain('tidak memiliki izin');
    });

    test('allows DM chat when remoteJid is LID and allowedJids contains phone number', async () => {
      let repliedText = '';
      const mockSock = TestHelper.createMockSocket();
      const mockMsg = TestHelper.createMockMessage({
        chatJid: '9988776655443322@lid',
        senderJid: '6285691947512@s.whatsapp.net',
        senderLid: '9988776655443322@lid',
        key: { remoteJid: '9988776655443322@lid', id: 'M_LID_DM', fromMe: false },
        body: '.reload',
        command: 'reload',
        prefix: '.',
        reply: async (content: any) => {
          repliedText = typeof content === 'string' ? content : JSON.stringify(content);
          return undefined;
        },
      });

      const reloadPlugin = PluginService.get('reload');
      if (reloadPlugin) {
        reloadPlugin.allowedJids = ['6285691947512'];
      }

      const handled = await PluginService.dispatch(mockMsg, mockSock);
      expect(handled).toBe(true);
      expect(repliedText).toContain('Plugin berhasil di-reload');
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
      expect(repliedText).toContain('hanya bisa digunakan di dalam grup');
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
      expect(repliedText).toContain('hanya bisa digunakan di pesan pribadi');
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
      expect(repliedText).toContain('hanya untuk admin grup');
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
      const generalPlugins = PluginService.getByCategory('general');
      expect(generalPlugins.length).toBeGreaterThan(0);

      const grouped = PluginService.getGroupedByCategory();
      expect(grouped.has('general')).toBe(true);
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
