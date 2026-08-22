# AGENTS.md — Universal AI Agent Guidelines for SuikaBot Starter

This document defines the **primary guidelines, architectural standards, and strict rules** for all AI Coding Assistants (Antigravity, Cursor, Windsurf, Claude Code, GitHub Copilot, etc.) working on this codebase.

---

## 1. Project Overview & Tech Stack

**SuikaBot Starter** is a high-performance, power-loss resilient, anti-ban multipurpose WhatsApp bot framework.

- **Runtime & Package Manager**: Full Bun Runtime (`bun run dev`, `bun test`, `bun install`)
- **Language**: TypeScript 7 (Strict Type Safety, `tsconfig.json`)
- **WhatsApp Engine**: `@whiskeysockets/baileys` (v7)
- **Infrastructure**: Redis (`redis` node-redis v4) & Keyed GCRA Ingress Pacer Engine
- **Logger**: Pino + Pino-Pretty

---

## 2. Codebase Knowledge Graph (`codebase-memory-mcp`)

This project uses **`codebase-memory-mcp`** to maintain a knowledge graph of the entire codebase structure.

### Tool Usage Priority Order:
1. `search_graph` — Search for functions, classes, handlers, or variables by pattern.
2. `trace_path` — Trace callers and execution flows of functions.
3. `get_code_snippet` — Read specific function/class source code.
4. `get_architecture` — Retrieve high-level project architectural summary.
5. *Fall back to grep/glob* only when searching for string literals, `.env` variables, or non-code files.

---

## 3. Golden Rules & Best Practices (Strict Rules)

### ⛔ STRICT RULE 1: Never Use String Operations on JIDs
* **STRICTLY FORBIDDEN** to split JID strings with `.split('@')` or compare JIDs using `===`.
* **RATIONALE**: WhatsApp uses multi-device suffixes (`:2@s.whatsapp.net`) and LID formats (`@lid`) that break plain string comparisons.
* **MANDATORY REQUIREMENT**: Always use official Baileys JID helpers:
  - `jidNormalizedUser(jid)` — Strip device/agent suffixes.
  - `isJidGroup(jid)` — Check if JID is a group (`@g.us`).
  - `areJidsSameUser(jid1, jid2)` — Compare 2 user JIDs precisely.
  - `jidDecode(jid)` — Decode JID structures.

### ⚡ STRICT RULE 2: Never Use Multiple Separate `sock.ev.on()`
* **FORBIDDEN** to register separate event handlers with `sock.ev.on()` throughout the codebase.
* **MANDATORY REQUIREMENT**: Use **`sock.ev.process(async (events) => { ... })`** inside `src/events/index.ts` to ensure atomic event batch processing in a single WebSocket tick (prevents race conditions).

### 🔌 RULE 3: Modern Clean Static Service Classes (`src/infra/`, `src/services/` & `src/core/`)
* Pure I/O Drivers, Bot Domain Services, and Core Engines are organized into explicit **Modern Clean Static Service Classes**:
  - **Infrastructure Drivers (`src/infra/`)**:
    - `RedisService` (`src/infra/redis.ts`) — `RedisService.get()`, `RedisService.set()`, `RedisService.del()`, `RedisService.scan()`, `RedisService.ping()`
    - `HttpService` (`src/infra/http.ts`) — `await HttpService.getJson()`, `await HttpService.getBuffer()`, `await HttpService.getStream()`, `await HttpService.postJson()`
    - `WebhookService` (`src/infra/webhook.ts`) — `WebhookService.registerRoute()`, `WebhookService.start()`, `WebhookService.stop()`
    - `CronService` (`src/infra/cron.ts`) — `CronService.schedule()`, `CronService.cancel()`, `CronService.stopAll()`
  - **Bot Domain Services (`src/services/`)**:
    - `AuthStoreService` (`src/services/authStore.ts`) — `await AuthStoreService.useRedisState()`, `AuthStoreService.clearState()`
    - `MessageQueueService` (`src/services/messageQueue.ts`) — `MessageQueueService.enqueue()`, `MessageQueueService.revoke()`, `MessageQueueService.setQueueProcessor()`
    - `MessageStoreService` (`src/services/messageStore.ts`) — `MessageStoreService.saveMessage()`, `MessageStoreService.getMessage()`, `MessageStoreService.warmGroupCache()`
    - `ChatStateService` (`src/services/chatState.ts`) — `await ChatStateService.set()`, `await ChatStateService.get()`, `await ChatStateService.del()`, `await ChatStateService.has()`
  - **Core Domain Engines (`src/core/`)**:
    - `SocketService` (`src/core/socket.ts`) — `await SocketService.connect()`, `SocketService.getSocket()`, `SocketService.close()`
    - `PluginService` (`src/core/plugin.ts`) — `await PluginService.load()`, `PluginService.get()`, `PluginService.dispatch()`
    - `SerializeService` (`src/core/serialize.ts`) — `await SerializeService.parse()`, `SerializeService.extractBody()`

### 🔑 RULE 4: Redis Key Prefixing (Staging & Production Isolation)
* **ALL** Redis keys without exception MUST prefix key strings with `${config.redis.prefix}`.
* NEVER hardcode plain key strings without prefix (e.g. `auth:creds`).
* `config.redis.prefix` is automatically derived from `BOT_NAME` (sanitized lowercase with hyphens) + `:${nodeEnv}:` (e.g. `suikabot:development:`, `suikabot:production:`, `suikabot:test:`).
* Enables Staging, Dev, and Production environments to run safely on the exact same Redis instance without key collisions.

### 🎯 RULE 5: Path Aliases (`@/*` Imports)
* **ALWAYS** use `@/*` (pointing to `src/*`, including `@/config`) for all internal project imports.
* **FORBIDDEN** to use deep relative paths like `../../infra/redis` or `../../utils/logger`.
  - Example: `import logger from '@/utils/logger';`
  - Example: `import config from '@/config';`

---

## 4. Project Layering Structure (`src/`)

```
src/
├── config.ts              # Central Environment & Config Validation
├── bootstrap.ts           # Core Lifecycle, Socket Initialization & Graceful Shutdown Engine
├── index.ts               # Pure Entry Point, Global Exception Boundary & OS Signal Handlers
├── types/                 # Interfaces & Type Definitions (serialize, plugin, schedule, webhook)
├── utils/                 # Pure Stateless Utilities (formatter, delay, logger, env, testing — NO DB/Socket dependency)
├── infra/                 # Low-Level I/O Drivers (RedisService, HttpService, WebhookService, CronService)
├── services/              # High-Level Bot Domain Services (AuthStoreService, MessageStoreService, ChatStateService, MessageQueueService)
├── core/                  # Core Domain Engines (SerializeService, PluginService)
├── schedules/             # Modular Scheduled Periodic Tasks (index.ts auto-loader, healthCheck.ts)
├── webhooks/              # Modular HTTP Webhook Routes (index.ts auto-loader, ping.ts)
├── events/                # Modular Event Registry (index.ts via sock.ev.process, connection, message, group, call)
└── plugins/               # Modular Command Plugins (general/, system/, tools/)
```

---

## 5. Plugin Authoring Conventions (`src/plugins/`)

Every plugin and sub-command file under `src/plugins/` **must export a default object** satisfying the unified `Plugin` interface:

```typescript
import type { Plugin } from '@/types/plugin';

const myPlugin: Plugin = {
  name: 'commandname',
  aliases: ['alias1', 'alias2'],
  category: 'general', // 'general' | 'system' | 'tools'
  description: 'Short command description',
  usage: '<argument>',
  enabled: true,       // Set false to disable without deleting the file

  // Access Control Guards (Optional)
  allowedJids: ['628123456789'], // Whitelist of phone numbers, user JIDs, LID JIDs, or group JIDs
  groupOnly: false,              // Restrict to group chats only (mutually exclusive with privateOnly)
  privateOnly: false,            // Restrict to private (1-on-1) chats only (mutually exclusive with groupOnly)
  adminOnly: false,              // Requires sender to be group admin
  botAdminOnly: false,           // Requires bot to be group admin

  // Dynamic Pattern Matcher (Optional RegExp or predicate function)
  customMatcher: /https?:\/\/(www\.)?tiktok\.com/i,

  // Main Handler
  async exec(m, ctx) {
    await m.react('⚡');
    await m.showTyping();
    await m.reply(`Hello ${m.senderName}!`);
  }
};

export default myPlugin;
```

### Strict Directory-Based Plugin Model & Next.js Conventions:
Every command lives in its own dedicated directory with an `index.ts` file:
```text
src/plugins/
├── _shared/                # Private folder: Ignored by plugin loader (shared helpers)
├── (admin)/                # Route group: Organizational folder without affecting command names
│   └── group/              # Command directory (.group)
│       ├── index.ts        # Main command router & entry point (.group)
│       ├── open.ts         # Sub-command (.group open)
│       ├── close.ts        # Sub-command (.group close)
│       └── _helper.ts      # Private helper: Ignored by sub-command auto-binder
└── general/
    └── ping/               # Command directory (.ping)
        └── index.ts        # Main command entry point (.ping)
```
- **Index Entry Point**: `index.ts` (or `main.ts`) in each command directory exports the root `Plugin`.
- **Auto-Bound Subcommands**: Sibling `.ts` files (excluding `index.ts`, `*.test.ts`, and `_*`) automatically bind as subcommands.
- **Private Opt-Out**: Folders and files starting with `_` or `.` are completely ignored by the loader.
- **Route Groups**: Folders wrapped in parentheses `(groupName)` are purely organizational.

---

## 6. Code Verification Commands

- **Typecheck**: `bun run typecheck` (`bunx tsc --noEmit`)
- **Unit Tests**: `bun test`
- **Dev Mode**: `bun run dev` (`bun --watch src/index.ts`)
- **Production Start**: `bun run start` (`bun src/index.ts`)
