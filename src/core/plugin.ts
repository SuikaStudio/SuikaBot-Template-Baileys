import { readdirSync, type Dirent } from 'fs';
import { join, resolve } from 'path';
import {
  areJidsSameUser,
  jidNormalizedUser,
  type WASocket,
} from '@whiskeysockets/baileys';

import type { LoadedPlugin, Plugin, PluginContext } from '@/types/plugin';
import type { SerializedMessage } from '@/types/serialize';

import config from '@/config';

import logger from '@/utils/logger';
import { systemMessages } from '@/utils/messages';

export class PluginService {
  private static plugins = new Map<string, LoadedPlugin>();

  // ============================================================================
  // 1. PUBLIC PRIMARY APIS
  // ============================================================================

  /**
   * Load (or reload) all command plugins from src/plugins/ directory.
   * Every command lives in its own dedicated directory with an index.ts file.
   */
  static async load(): Promise<void> {
    // 1. Reset existing plugin registry in memory
    this.plugins.clear();

    // 2. Discover and collect all valid bot command directories
    const pluginsRootDir = resolve(import.meta.dir, '../plugins');
    const commandDirectories = this.discoverCommandDirs(pluginsRootDir);

    // 3. Load each command directory and auto-bind its subcommands
    let totalLoaded = 0;
    for (const commandDir of commandDirectories) {
      const isLoaded = await this.loadCommandDir(commandDir);
      if (isLoaded) totalLoaded++;
    }

    // 4. Log completion summary
    logger.info(
      `[PluginService] Loaded ${totalLoaded} command plugins from ${commandDirectories.length} command directories`
    );
  }

  /**
   * Main Dispatch Entry Point for incoming WhatsApp messages.
   */
  static async dispatch(m: SerializedMessage, sock: WASocket): Promise<boolean> {
    // 1. Match standard prefix command (.info, .menu, .eval)
    if (m.prefix && m.command) {
      const plugin = this.get(m.command);
      if (plugin && !plugin.noPrefix) {
        return await this.executePlugin(plugin, m, sock, m.args ?? []);
      }
    }

    // 2. Match non-prefix listener with custom matcher (RegExp or predicate function)
    const customMatcherPlugin = this.findByCustomMatcher(m.body, m);
    if (customMatcherPlugin) {
      return await this.executePlugin(customMatcherPlugin, m, sock, m.args ?? []);
    }

    return false;
  }

  /**
   * Get a loaded plugin by primary name or alias.
   */
  static get(name: string): LoadedPlugin | undefined {
    return this.plugins.get(name.toLowerCase());
  }

  /**
   * Get all deduplicated loaded plugins.
   */
  static getAll(): LoadedPlugin[] {
    return [...new Set(this.plugins.values())];
  }

  /**
   * Get all plugins belonging to a specific category.
   */
  static getByCategory(category: string): LoadedPlugin[] {
    return this.getAll().filter((p) => (p.category ?? 'general') === category);
  }

  /**
   * Get all plugins grouped by category.
   */
  static getGroupedByCategory(): Map<string, LoadedPlugin[]> {
    return Map.groupBy(this.getAll(), (plugin) => plugin.category ?? 'general');
  }

  /**
   * Fast ingress check: returns true if the text matches any loaded plugin's customMatcher.
   */
  static matchesCustomMatcher(body: string): boolean {
    return this.findByCustomMatcher(body) !== undefined;
  }

  // ============================================================================
  // 2. PRIVATE EXECUTION PIPELINE
  // ============================================================================

  /**
   * Unified Single Pipeline Execution (Guards -> before -> subcommands -> exec -> after -> onError).
   */
  private static async executePlugin(
    plugin: LoadedPlugin,
    m: SerializedMessage,
    sock: WASocket,
    rawArgs: string[],
    parentFlags: Map<string, string | true> = new Map()
  ): Promise<boolean> {
    // 1. Validate authorization and scope guards
    const guardError = this.validateGuards(plugin, m);
    if (guardError) {
      await m.reply(guardError);
      return true;
    }

    // 2. Parse CLI flags and construct execution context
    const { flags: subFlags, cleanArgs } = this.parseFlags(rawArgs);
    const combinedFlags = new Map([...parentFlags, ...subFlags]);
    const ctx = this.createContext(m, sock, cleanArgs, combinedFlags);

    // 3. Run pre-execution before() hook
    if (plugin.before) {
      const shouldProceed = await plugin.before(m, ctx);
      if (shouldProceed === false) return true;
    }

    // 4. Resolve and execute subcommands recursively (O(1) Map lookup)
    if (plugin.subcommands && cleanArgs.length > 0) {
      const subcommandKey = cleanArgs[0]?.toLowerCase();
      const subcommand = subcommandKey ? plugin.subcommands[subcommandKey] : undefined;

      if (subcommand) {
        return await this.executePlugin(subcommand, m, sock, cleanArgs.slice(1), combinedFlags);
      }
    }

    // 5. Run main execution handler with local error boundary
    let result: unknown;
    try {
      result = await plugin.exec(m, ctx);
    } catch (err) {
      const errorObject = err instanceof Error ? err : new Error(String(err));
      if (plugin.onError) {
        await plugin.onError(errorObject, m, ctx);
      } else {
        logger.error({ err: errorObject, command: m.command || plugin.name }, '[PluginService] Execution error');
        await m.reply(systemMessages.error.executionError);
      }
      return true;
    }

    // 6. Run post-execution after() hook
    if (plugin.after) {
      await plugin.after(m, ctx, result).catch((err) =>
        logger.error({ err, command: m.command || plugin.name }, '[PluginService] after() hook error')
      );
    }

    return true;
  }

  /**
   * Validate authorization guards for a plugin or subcommand.
   */
  private static validateGuards(plugin: Plugin, m: SerializedMessage): string | null {
    // 1. Check chat whitelist authorization guard
    if (plugin.allowedJids && !m.fromBot && !this.isChatAllowed(plugin.allowedJids, m)) {
      return systemMessages.guard.unauthorized;
    }

    // 2. Check chat scope guards (groupOnly vs privateOnly)
    if (plugin.groupOnly && !m.isGroup) return systemMessages.guard.groupOnly;
    if (plugin.privateOnly && m.isGroup) return systemMessages.guard.privateOnly;

    // 3. Check admin role guards (adminOnly vs botAdminOnly)
    if (plugin.adminOnly && !m.isAdmin) return systemMessages.guard.adminOnly;
    if (plugin.botAdminOnly && !m.isBotAdmin) return systemMessages.guard.botAdminOnly;

    return null;
  }

  /**
   * Check if the message chat is allowed based on the plugin's allowedJids whitelist.
   */
  private static isChatAllowed(allowedJids: string[], m: SerializedMessage): boolean {
    // 1. Collect candidate identifiers for current chat
    const candidateJids = m.isGroup
      ? [m.chatJid, m.key.remoteJid]
      : [
          m.chatJid,
          m.senderJid,
          m.senderLid,
          m.key.remoteJid,
          m.key.remoteJidAlt,
          m.key.participantAlt,
        ];

    const rawCandidates: string[] = candidateJids.filter(
      (c): c is string => typeof c === 'string' && c.length > 0
    );

    const candidates = rawCandidates.map((cand) => ({
      raw: cand,
      number: jidNormalizedUser(cand).replace(/[^0-9]/g, ''),
    }));

    // 2. Match whitelist entries against candidate JIDs, phone numbers, and LIDs
    return allowedJids.some((entry) => {
      const trimmed = entry.trim();
      if (!trimmed) return false;

      const targetJid = trimmed.includes('@') ? trimmed : `${trimmed.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
      const targetNumber = trimmed.replace(/[^0-9]/g, '');

      return candidates.some((cand) => {
        return (
          areJidsSameUser(cand.raw, trimmed) ||
          areJidsSameUser(cand.raw, targetJid) ||
          (targetNumber.length > 0 && cand.number === targetNumber)
        );
      });
    });
  }

  /**
   * Find matching plugin by custom matcher (RegExp pattern or predicate function).
   */
  private static findByCustomMatcher(body: string, m?: SerializedMessage): LoadedPlugin | undefined {
    return this.getAll().find((plugin) => {
      if (!plugin.customMatcher) return false;
      if (plugin.customMatcher instanceof RegExp) return plugin.customMatcher.test(body);
      if (typeof plugin.customMatcher === 'function') {
        return m ? plugin.customMatcher(body, m) : true;
      }
      return false;
    });
  }

  /**
   * Build execution context for a plugin/subcommand handler.
   */
  private static createContext(
    m: SerializedMessage,
    sock: WASocket,
    args: string[],
    flags: Map<string, string | true>
  ): PluginContext {
    const text = args.join(' ');
    return {
      sock,
      config,
      usedPrefix: m.prefix,
      command: m.command,
      args,
      text,
      query: text.trim(),
      flags,
    };
  }

  /**
   * Parse CLI-style flags from an arguments array.
   */
  private static parseFlags(args: string[]): { flags: Map<string, string | true>; cleanArgs: string[] } {
    if (args.length === 0) return { flags: new Map(), cleanArgs: [] };
    if (!args.some((arg) => arg.startsWith('-'))) return { flags: new Map(), cleanArgs: args };

    const flags = new Map<string, string | true>();
    const cleanArgs: string[] = [];
    let i = 0;
    while (i < args.length) {
      const arg = args[i]!;
      if (arg.startsWith('--')) {
        const key = arg.slice(2);
        const next = args[i + 1];
        if (next && !next.startsWith('-')) {
          flags.set(key, next);
          i += 2;
        } else {
          flags.set(key, true);
          i++;
        }
      } else if (arg.startsWith('-') && arg.length === 2) {
        flags.set(arg.slice(1), true);
        i++;
      } else {
        cleanArgs.push(arg);
        i++;
      }
    }
    return { flags, cleanArgs };
  }

  // ============================================================================
  // 3. PRIVATE LOADER & REGISTRY HELPERS
  // ============================================================================

  /**
   * Load a command directory containing index.ts and any sibling subcommand files or nested subcommand directories.
   */
  private static async loadCommandDir(dir: string): Promise<boolean> {
    try {
      const dirEntries = readdirSync(dir, { withFileTypes: true });
      const entryFile = dirEntries.find((e) => e.isFile() && /^(index|_index|main)\.ts$/.test(e.name));
      if (!entryFile) return false;

      // 1. Dynamically import root plugin entry point
      const entryFilePath = join(dir, entryFile.name);
      const moduleExports = (await import(`${entryFilePath}?t=${Date.now()}`)) as { default?: Plugin };
      const rootPlugin = moduleExports.default as LoadedPlugin | undefined;

      if (!rootPlugin?.name || typeof rootPlugin.exec !== 'function') return false;
      if (rootPlugin.enabled === false) {
        logger.debug({ name: rootPlugin.name, file: entryFilePath }, '[PluginService] Skipping disabled command plugin');
        return false;
      }

      // 2. Check for conflicting scope definitions
      const pluginName = rootPlugin.name;
      const rawPlugin = rootPlugin as { groupOnly?: boolean; privateOnly?: boolean };
      if (rawPlugin.groupOnly && rawPlugin.privateOnly) {
        logger.warn({ dir, name: pluginName }, '[PluginService] Skipping: conflicting scopes');
        return false;
      }

      // 3. Auto-bind sibling subcommand files and Pure Next.js nested subcommand directories
      rootPlugin.subcommands = rootPlugin.subcommands || {};
      await this.loadSubcommands(rootPlugin, dir, dirEntries, entryFile.name);

      // 4. Register root command into memory map
      this.register(rootPlugin);
      return true;
    } catch (err) {
      logger.error({ err, dir }, '[PluginService] Failed to load command directory');
      return false;
    }
  }

  /**
   * Auto-bind sibling .ts files and Pure Next.js nested subcommand directories recursively.
   */
  private static async loadSubcommands(
    root: LoadedPlugin,
    dir: string,
    dirEntries: Dirent[],
    entryFileName: string
  ): Promise<void> {
    for (const entry of dirEntries) {
      if (entry.name === entryFileName) continue;
      if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue;

      // Case 1: Sibling subcommand file (e.g. open.ts)
      if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') && !entry.name.endsWith('.spec.ts')) {
        const subcommandFilePath = join(dir, entry.name);
        try {
          const subModuleExports = (await import(`${subcommandFilePath}?t=${Date.now()}`)) as { default?: Plugin };
          const subcommandPlugin = subModuleExports.default as LoadedPlugin | undefined;
          this.attachSubcommand(root, subcommandPlugin);
        } catch (err) {
          logger.error({ err, file: subcommandFilePath }, '[PluginService] Failed to load subcommand file');
        }
      }

      // Case 2: Pure Next.js Nested Subcommand Directory (e.g. database/index.ts)
      if (entry.isDirectory()) {
        const subDir = join(dir, entry.name);
        try {
          const subDirEntries = readdirSync(subDir, { withFileTypes: true });
          const subEntryFile = subDirEntries.find((e) => e.isFile() && /^(index|_index|main)\.ts$/.test(e.name));

          if (subEntryFile) {
            const subEntryFilePath = join(subDir, subEntryFile.name);
            const subModuleExports = (await import(`${subEntryFilePath}?t=${Date.now()}`)) as { default?: Plugin };
            const subPlugin = subModuleExports.default as LoadedPlugin | undefined;

            if (subPlugin?.name && typeof subPlugin.exec === 'function' && subPlugin.enabled !== false) {
              subPlugin.subcommands = subPlugin.subcommands || {};
              // Recursively load deeper nested subcommands inside this directory!
              await this.loadSubcommands(subPlugin, subDir, subDirEntries, subEntryFile.name);
              this.attachSubcommand(root, subPlugin);
            }
          }
        } catch (err) {
          logger.error({ err, subDir }, '[PluginService] Failed to load nested subcommand directory');
        }
      }
    }
  }

  /**
   * Helper to attach and bind a subcommand to its parent plugin.
   */
  private static attachSubcommand(parent: LoadedPlugin, subPlugin: LoadedPlugin | undefined): void {
    if (!subPlugin?.name || typeof subPlugin.exec !== 'function' || subPlugin.enabled === false) return;
    if (!subPlugin.category && parent.category) subPlugin.category = parent.category;

    parent.subcommands = parent.subcommands || {};
    parent.subcommands[subPlugin.name.toLowerCase()] = subPlugin;
    (subPlugin.aliases ?? []).forEach((alias) => {
      parent.subcommands![alias.toLowerCase()] = subPlugin;
    });
  }

  /**
   * Recursively locate all command directories containing an index.ts file.
   * Skips private folders starting with '_' or '.' (Next.js route convention).
   */
  private static discoverCommandDirs(dir: string): string[] {
    const directoryPaths: string[] = [];
    try {
      const dirEntries = readdirSync(dir, { withFileTypes: true });

      // 1. Check if current directory is a command directory (contains index.ts)
      const hasEntryPoint = dirEntries.some((e) => e.isFile() && /^(index|_index|main)\.ts$/.test(e.name));
      if (hasEntryPoint) {
        directoryPaths.push(dir);
        return directoryPaths;
      }

      // 2. Recurse into subdirectories (skipping private folders/files starting with '_')
      for (const entry of dirEntries) {
        if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
        if (entry.isDirectory()) {
          directoryPaths.push(...this.discoverCommandDirs(join(dir, entry.name)));
        }
      }
    } catch (err) {
      logger.error({ err, dir }, '[PluginService] Failed to read directory');
    }
    return directoryPaths;
  }

  /**
   * Register a plugin under its primary name and all aliases.
   */
  private static register(plugin: LoadedPlugin): void {
    if (plugin.enabled === false) return;
    this.plugins.set(plugin.name.toLowerCase(), plugin);
    (plugin.aliases ?? []).forEach((alias) => this.plugins.set(alias.toLowerCase(), plugin));
  }
}
