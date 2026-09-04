import type { WASocket } from '@whiskeysockets/baileys';

import type { BotConfig } from '@/config';

import type { SerializedMessage } from '@/types/serialize';

export interface PluginContext {
  sock: WASocket;
  config: BotConfig;
  usedPrefix: string;
  command: string;
  args: string[];
  text: string;
  query: string;
  /** 
   * Parsed flags from args. 
   * e.g. '--silent' -> flags.has('silent') === true, 
   *      '--name foo' -> flags.get('name') === 'foo'
   */
  flags: Map<string, string | true>;
}

// Minimal starter categories - extend this union as your bot features grow
export type PluginCategory = 'general' | 'system' | 'tools';

interface BasePlugin {
  /** Explicit name of the command (e.g. 'ping', 'menu', 'open') */
  name: string;
  /** Alternative alias names */
  aliases?: string[];
  /** Category for grouping in menu. Defaults to parent category or 'general' */
  category?: PluginCategory;
  /** Short description of what the command does */
  description?: string;
  /** Argument usage instructions e.g. '<argument>' or '[--flag]' */
  usage?: string;
  /** Set to false to disable this command/subcommand without deleting the file. Defaults to true. */
  enabled?: boolean;

  // Access Control Role Guards
  /** Requires user to be group admin */
  adminOnly?: boolean;
  /** Requires bot to be group admin */
  botAdminOnly?: boolean;

  // Dynamic Matcher Support (Regex pattern or predicate function)
  customMatcher?: RegExp | ((text: string, m: SerializedMessage) => boolean);
  /** If true, disables triggering this plugin via standard prefix (.command), allowing only customMatcher */
  noPrefix?: boolean;

  /**
   * Optional pre-execution hook. Return `false` to cancel execution silently,
   * or reply inside the hook and return `false` to cancel with a message.
   */
  before?: (m: SerializedMessage, ctx: PluginContext) => Promise<boolean | void>;

  /** Main handler executed when the command or sub-command runs */
  exec: (m: SerializedMessage, ctx: PluginContext) => Promise<unknown>;

  /** Optional post-execution hook, called after exec completes successfully */
  after?: (m: SerializedMessage, ctx: PluginContext, result: unknown) => Promise<void>;

  /** Optional error boundary. If defined, errors are routed here instead of global logger */
  onError?: (err: Error, m: SerializedMessage, ctx: PluginContext) => Promise<void>;
}

/**
 * Access Control Guards with TypeScript Mutual Exclusivity:
 * - If `allowedJids` is set (Whitelist Mode), it overrides chat-type scope (`groupOnly` & `privateOnly`).
 * - Otherwise (Public Mode), you can specify `groupOnly` or `privateOnly` exclusively.
 */
export type Plugin = BasePlugin &
  (
    | { allowedJids: string[]; groupOnly?: never; privateOnly?: never }
    | { allowedJids?: never; groupOnly?: true; privateOnly?: never }
    | { allowedJids?: never; privateOnly?: true; groupOnly?: never }
    | { allowedJids?: never; groupOnly?: false; privateOnly?: false }
    | { allowedJids?: never; groupOnly?: undefined; privateOnly?: undefined }
  );

/**
 * Internal runtime structure of a loaded plugin, containing subcommands
 * populated automatically by the directory-based loader in PluginService.
 */
export type LoadedPlugin = Plugin & {
  subcommands?: Record<string, LoadedPlugin>;
};

