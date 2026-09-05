import {
  jidNormalizedUser,
  isJidGroup,
  type WAMessage,
  type WAMessageUpdate,
  type WASocket,
} from '@whiskeysockets/baileys';

import { MessageStoreService } from '@/services/messageStore';
import { MessageQueueService } from '@/services/messageQueue';

import { SerializeService } from '@/core/serialize';
import { PluginService } from '@/core/plugin';

import config from '@/config';

const shouldProcessMessage = (message: WAMessage): boolean => {
  // ignore if message has no content or key
  if (!message.message || !message.key) return false;
  
  // ignore if message is from status@broadcast
  const jid = message.key.remoteJid ?? '';
  if (jid === 'status@broadcast') return false;
  
  return true;
};

const handleProtocolMessage = async (message: WAMessage): Promise<boolean> => {
  const protoMsg = message.message?.protocolMessage;
  if (!protoMsg) return false;

  // Type 0 => Revoke Message.
  if (protoMsg.type === 0) {
    // Cancel queued message if this is a message revocation (Delete for Everyone / Type.REVOKE = 0)
    const targetId = protoMsg.key?.id;
    if (targetId) {
      const targetChat = jidNormalizedUser(protoMsg.key?.remoteJid || message.key.remoteJid || '');
      await MessageQueueService.revoke(targetChat, targetId);
    }
  }

  return true;
};

const buildAdminMap = async (sock: WASocket, jid: string): Promise<Map<string, boolean>> => {
  const adminMap = new Map<string, boolean>();

  let metadata = await MessageStoreService.getCachedGroupMetadata(jid);

  // If cache miss, fetch live group metadata and warm Redis cache
  if (!metadata?.participants) {
    metadata = await MessageStoreService.warmGroupCache(sock, jid);
  }

  // If group metadata is unavailable, return empty map
  if (!metadata?.participants) return adminMap;

  // Map all admin identifiers (PN JID, LID, and Phone Number) for multi-device resolution
  for (const p of metadata.participants) {
    if (!p.admin) continue;

    const adminIds = [p.id, p.lid, p.phoneNumber].filter(Boolean) as string[];
    for (const id of adminIds) {
      adminMap.set(jidNormalizedUser(id), true);
    }
  }

  return adminMap;
};

/**
 * Main command processing loop executed per-message.
 */
export const processMessage = async (message: WAMessage, sock: WASocket): Promise<void> => {
  const chatJid = message.key.remoteJid ?? '';
  const isGroup = isJidGroup(chatJid);

  // If group, fetch cached/live admin map for authorization guards
  const adminMap = isGroup ? await buildAdminMap(sock, chatJid) : new Map<string, boolean>();

  // Parse raw WAMessage into SerializedMessage helper object
  const m = await SerializeService.parse(message, sock, adminMap);
  if (!m) return;

  // Dispatch command to matching plugin
  await PluginService.dispatch(m, sock);
};

/**
 * Handle incoming messages, routing to command processor.
 */
export const onMessagesUpsert = async (
  { messages, type }: { messages: WAMessage[]; type: string },
  _sock: WASocket
): Promise<void> => {
  for (const message of messages) {
    // Ignore empty packets, missing keys, or status/broadcast stories
    if (!shouldProcessMessage(message)) continue;

    // Handle protocol signals (e.g. revoke) and skip non-chat technical packets
    if (await handleProtocolMessage(message)) continue;

    // Store in Redis for retry delivery, poll vote decryption, and quoted media lookups
    await MessageStoreService.saveMessage(message);

    // Only process live, real-time messages ('notify') and ignore offline/history sync backlog ('append')
    if (type !== 'notify') continue;

    // Extract message text across all formats (conversation, captions, ephemeral, viewOnce)
    const body = SerializeService.extractBody(message);
    const trimmedBody = body.trim();

    // Ignore casual chat: only enqueue if message starts with bot prefix or matches a plugin's customMatcher
    const hasPrefix = trimmedBody.startsWith(config.bot.prefix);
    if (!hasPrefix && !PluginService.matchesCustomMatcher(trimmedBody)) continue;

    await MessageQueueService.enqueue(message);
  }
};

/**
 * Event handler for message updates (read receipts, delivery status, poll updates, edits).
 */
export const onMessagesUpdate = async (
  messages: WAMessageUpdate[]
): Promise<void> => {
  // Hook for message status updates, edits, or anti-delete logging
};
