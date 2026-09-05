import {
  getContentType,
  isJidGroup,
  jidNormalizedUser,
  jidDecode,
  isLidUser,
  areJidsSameUser,
  downloadMediaMessage,
  type WAMessage,
  type WAMessageKey,
  type WASocket,
  type proto,
  type AnyMessageContent,
  type MiscMessageGenerationOptions,
} from '@whiskeysockets/baileys';

import type { SerializedMessage, QuotedMessage } from '@/types/serialize';

import { MessageStoreService } from '@/services/messageStore';

import logger from '@/utils/logger';

import config from '@/config';

const MEDIA_TYPES = new Set([
  'imageMessage',
  'videoMessage',
  'audioMessage',
  'documentMessage',
  'stickerMessage',
  'documentWithCaptionMessage',
  'ptvMessage',
]);

export class SerializeService {
  // ============================================================================
  // 1. PUBLIC PRIMARY APIS
  // ============================================================================

  /**
   * Parse raw Baileys WAMessage into a clean, rich SerializedMessage helper object.
   */
  static async parse(
    message: WAMessage,
    sock: WASocket,
    adminMap: Map<string, boolean> = new Map()
  ): Promise<SerializedMessage | null> {
    if (!message.key.remoteJid || !message.message) return null;

    // 1. Message Unwrapping & Media Metadata Extraction
    // Unwrap nested protobuf containers (ephemeral, view-once, document) to access the real payload,
    // then extract contentType, MIME type, and optional contextInfo in a single pass.
    const rawMsg = this.unwrapMessage(message.message);
    const mediaType = getContentType(rawMsg ?? undefined) ?? null;
    const { mimetype, fileName } = this.extractMediaMeta(rawMsg, mediaType ?? undefined);
    const ctxInfo = this.extractContextInfo(rawMsg, mediaType ?? undefined);

    // 2. Identity Resolution & Group Access Permissions
    // Extract normalized chat and sender identifiers (supporting both Phone Number and LID formats),
    // then resolve group admin privileges for both the sender and the bot.
    const { chatJid, senderJid, senderLid, fromBot } = this.resolveSender(message.key, sock);
    const isGroup = Boolean(isJidGroup(chatJid));
    const { isAdmin, isBotAdmin } = this.resolvePermissions(adminMap, isGroup, senderJid, senderLid, sock);
    const senderName = message.pushName || jidDecode(senderJid)?.user || 'User';

    // 3. Command Tokenization & Arguments Parsing
    // Extract text body, enforce strict prefix rules (e.g. '.s' valid, '. s' rejected),
    // and extract lowercase command names alongside positional arguments.
    const { body, prefix, command, args, text, query } = this.parseCommand(rawMsg);

    // 4. Mentions & Quoted Context Resolution
    // Deduplicate mentioned user JIDs and resolve any referenced/quoted parent message,
    // including its media, author identity, and bound action primitives.
    const mentionedJids = [...new Set((ctxInfo?.mentionedJid ?? []).map((j) => jidNormalizedUser(j)))];
    const quoted = this.extractQuoted(message, sock, rawMsg);

    // 5. Bound Action Primitives
    // Construct pre-bound action helpers (reply, react, edit, delete, typing, downloadMedia)
    // pinned to this message and chat context with automatic persistence.
    const actions = this.createActions(message, sock, chatJid, rawMsg, text);

    // 6. Final Serialized Payload Assembly
    // Assemble all normalized identities, parsed command data, metadata, and bound actions
    // into an immutable, unified SerializedMessage contract.
    const timestamp = typeof message.messageTimestamp === 'number'
      ? message.messageTimestamp
      : Number(message.messageTimestamp?.low ?? Date.now() / 1000);

    return {
      raw: message,
      sock,
      key: message.key,
      messageId: message.key.id ?? '',
      chatJid,
      senderJid,
      senderLid,
      senderName,
      timestamp,
      fromBot,
      body,
      prefix,
      command,
      args,
      text,
      query,
      isGroup,
      isAdmin,
      isBotAdmin,
      isMedia: Boolean(mediaType && MEDIA_TYPES.has(mediaType)),
      isQuotedMedia: Boolean(quoted?.isMedia),
      mediaType,
      mimetype,
      fileName,
      quoted,
      mentionedJids,
      ...actions,
    };
  }

  /**
   * Comprehensive message body extractor with automatic wrapper unwrapping.
   */
  static extractBody(message: WAMessage): string {
    const msg = this.unwrapMessage(message.message);
    return this.extractBodyFromUnwrapped(msg);
  }

  /**
   * Unwrap Ephemeral, ViewOnce, and Document wrapper messages to inner content.
   * Uses an iterative O(1) auxiliary space loop to prevent recursion stack overhead.
   */
  static unwrapMessage(msg?: proto.IMessage | null): proto.IMessage | null | undefined {
    while (msg) {
      if (msg.ephemeralMessage) {
        msg = msg.ephemeralMessage.message;
      } else if (msg.viewOnceMessage) {
        msg = msg.viewOnceMessage.message;
      } else if (msg.viewOnceMessageV2) {
        msg = msg.viewOnceMessageV2.message;
      } else if (msg.viewOnceMessageV2Extension) {
        msg = msg.viewOnceMessageV2Extension.message;
      } else if (msg.documentWithCaptionMessage) {
        msg = msg.documentWithCaptionMessage.message;
      } else {
        break;
      }
    }
    return msg;
  }

  // ============================================================================
  // 2. ACTION HELPERS BUILDER
  // ============================================================================

  /**
   * Create bound action methods (reply, react, edit, delete, media, typing) for the message.
   */
  private static createActions(
    message: WAMessage,
    sock: WASocket,
    chatJid: string,
    rawMsg: proto.IMessage | null | undefined,
    text: string
  ) {
    const reply = async (
      content: string | AnyMessageContent,
      options?: MiscMessageGenerationOptions
    ): Promise<WAMessage | undefined> => {
      const msgContent: AnyMessageContent = typeof content === 'string' ? { text: content } : content;
      const sent = await sock.sendMessage(chatJid, msgContent, { quoted: message, ...options });
      if (sent) {
        await MessageStoreService.saveMessage(sent);
      }
      return sent;
    };

    const react = async (emoji: string): Promise<WAMessage | undefined> => {
      return await sock.sendMessage(chatJid, { react: { text: emoji, key: message.key } });
    };

    const edit = async (keyToEdit: proto.IMessageKey, newText: string): Promise<WAMessage | undefined> => {
      const sent = await sock.sendMessage(chatJid, { text: newText, edit: keyToEdit });
      if (sent) {
        await MessageStoreService.saveMessage(sent);
      }
      return sent;
    };

    const deleteMsg = async (keyToDelete?: proto.IMessageKey): Promise<WAMessage | undefined> => {
      return await sock.sendMessage(chatJid, { delete: keyToDelete ?? message.key });
    };

    const showTyping = async (): Promise<void> => {
      await sock.sendPresenceUpdate('composing', chatJid);
    };

    const showRecording = async (): Promise<void> => {
      await sock.sendPresenceUpdate('recording', chatJid);
    };

    const replyMedia = async (
      type: 'image' | 'video' | 'audio' | 'sticker' | 'document' | 'ptv',
      content: Buffer | string,
      caption?: string,
      options?: { mimetype?: string; fileName?: string; ptt?: boolean }
    ): Promise<WAMessage | undefined> => {
      const mediaContent = typeof content === 'string' ? { url: content } : content;
      let msgContent: AnyMessageContent;

      switch (type) {
        case 'image':
          msgContent = { image: mediaContent, caption, ...options };
          break;
        case 'video':
          msgContent = { video: mediaContent, caption, ...options };
          break;
        case 'audio': {
          const isPtt = Boolean(options?.ptt);
          const defaultMimetype = isPtt ? 'audio/ogg; codecs=opus' : 'audio/mp4';
          msgContent = {
            audio: mediaContent,
            mimetype: options?.mimetype || defaultMimetype,
            ptt: isPtt,
            ...options,
          };
          break;
        }
        case 'sticker':
          msgContent = { sticker: mediaContent, ...options };
          break;
        case 'document':
          msgContent = {
            document: mediaContent,
            caption,
            mimetype: options?.mimetype || 'application/octet-stream',
            fileName: options?.fileName || 'document',
            ...options,
          };
          break;
        case 'ptv':
          msgContent = { video: mediaContent, ptv: true, ...options };
          break;
      }

      const sent = await sock.sendMessage(chatJid, msgContent, { quoted: message });
      if (sent) {
        await MessageStoreService.saveMessage(sent);
      }
      return sent;
    };

    const downloadMedia = async (): Promise<Buffer> => {
      const msgToDownload: WAMessage = rawMsg ? { key: message.key, message: rawMsg } : message;
      const buffer = await downloadMediaMessage(
        msgToDownload,
        'buffer',
        {},
        { logger, reuploadRequest: sock.updateMediaMessage }
      );
      return buffer as Buffer;
    };

    const split = (delimiter?: string | RegExp): string[] => {
      return delimiter ? text.split(delimiter) : text.split(/\s+/);
    };

    return {
      reply,
      react,
      edit,
      delete: deleteMsg,
      showTyping,
      showRecording,
      replyMedia,
      downloadMedia,
      split,
    };
  }

  /**
   * Create bound action methods (react, delete, downloadMedia) for quoted messages.
   */
  private static createQuotedActions(
    sock: WASocket,
    chatJid: string,
    quotedKey: proto.IMessageKey,
    quotedMsg: proto.IMessage,
    ctx: proto.IContextInfo
  ) {
    const react = (emoji: string) => sock.sendMessage(chatJid, { react: { text: emoji, key: quotedKey } });
    const deleteMsg = () => sock.sendMessage(chatJid, { delete: quotedKey });

    const downloadMedia = async (): Promise<Buffer> => {
      const originalMsg = ctx.stanzaId
        ? await MessageStoreService.getMessage({ remoteJid: chatJid, id: ctx.stanzaId, participant: ctx.participant })
        : null;
      const unwrappedOriginal = originalMsg?.message ? this.unwrapMessage(originalMsg.message) : null;
      const targetMsg: WAMessage = unwrappedOriginal
        ? { key: originalMsg!.key, message: unwrappedOriginal }
        : originalMsg ?? { key: quotedKey, message: quotedMsg };
      return (await downloadMediaMessage(targetMsg, 'buffer', {}, { logger, reuploadRequest: sock.updateMediaMessage })) as Buffer;
    };

    return { react, delete: deleteMsg, downloadMedia };
  }

  // ============================================================================
  // 3. CONTEXT & UNWRAPPING ENGINE
  // ============================================================================

  /**
   * Safely extract media MIME type and filename from unwrapped message structure.
   */
  private static extractMediaMeta(
    msg?: proto.IMessage | null,
    type?: string
  ): { mimetype: string | null; fileName: string | null } {
    if (!msg) return { mimetype: null, fileName: null };

    const mediaType = type ?? getContentType(msg);
    if (!mediaType || !MEDIA_TYPES.has(mediaType)) return { mimetype: null, fileName: null };

    const inner = (msg as unknown as Record<string, { mimetype?: string; fileName?: string }>)[mediaType];
    return {
      mimetype: typeof inner?.mimetype === 'string' ? inner.mimetype : null,
      fileName: typeof inner?.fileName === 'string' ? inner.fileName : null,
    };
  }

  /**
   * Safely extract ContextInfo from unwrapped message structure.
   */
  private static extractContextInfo(
    msg?: proto.IMessage | null,
    type?: string
  ): (proto.IContextInfo & { participantAlt?: string; remoteJidAlt?: string }) | undefined {
    if (!msg) return undefined;

    const messageType = type ?? getContentType(msg);
    if (!messageType) return undefined;

    const inner = (msg as unknown as Record<string, { contextInfo?: proto.IContextInfo }>)[messageType];
    return inner?.contextInfo ?? undefined;
  }

  /**
   * Extract text body from already unwrapped proto.IMessage.
   */
  private static extractBodyFromUnwrapped(msg?: proto.IMessage | null): string {
    if (!msg) return '';

    return (
      msg.conversation ||
      msg.extendedTextMessage?.text ||
      msg.imageMessage?.caption ||
      msg.videoMessage?.caption ||
      msg.documentMessage?.caption ||
      msg.ptvMessage?.caption ||
      msg.buttonsResponseMessage?.selectedButtonId ||
      msg.buttonsResponseMessage?.selectedDisplayText ||
      msg.listResponseMessage?.singleSelectReply?.selectedRowId ||
      msg.listResponseMessage?.title ||
      msg.templateButtonReplyMessage?.selectedId ||
      msg.templateButtonReplyMessage?.selectedDisplayText ||
      msg.interactiveResponseMessage?.body?.text ||
      msg.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson ||
      msg.pollCreationMessage?.name ||
      msg.pollCreationMessageV2?.name ||
      msg.pollCreationMessageV3?.name ||
      msg.locationMessage?.name ||
      msg.locationMessage?.address ||
      msg.contactMessage?.displayName ||
      msg.contactsArrayMessage?.displayName ||
      ''
    );
  }

  /**
   * Helper to find and normalize first valid LID from a list of candidate strings.
   */
  private static findLid(...candidates: (string | null | undefined)[]): string | null {
    for (const j of candidates) {
      if (typeof j === 'string' && isLidUser(j)) {
        return jidNormalizedUser(j);
      }
    }
    return null;
  }

  /**
   * Extract quoted message context if present, including quoted action primitives.
   */
  private static extractQuoted(
    message: WAMessage,
    sock: WASocket,
    rawMsg?: proto.IMessage | null
  ): QuotedMessage | null {
    const unwrapMsg = rawMsg ?? this.unwrapMessage(message.message);
    const ctx = this.extractContextInfo(unwrapMsg);
    if (!ctx?.quotedMessage) return null;

    const chatJid = jidNormalizedUser(message.key.remoteJid!);
    const rawSender = ctx.participantAlt || ctx.participant || ctx.remoteJidAlt || message.key.remoteJid!;
    const senderJid = jidNormalizedUser(rawSender);
    const senderLid = this.findLid(ctx.participant, ctx.participantAlt, ctx.remoteJid, ctx.remoteJidAlt, message.key.remoteJid);

    const quotedMsg = this.unwrapMessage(ctx.quotedMessage as proto.IMessage) ?? (ctx.quotedMessage as proto.IMessage);
    const mediaType = getContentType(quotedMsg) ?? null;
    const { mimetype, fileName } = this.extractMediaMeta(quotedMsg, mediaType ?? undefined);
    const text = this.extractBodyFromUnwrapped(quotedMsg);

    const botJid = jidNormalizedUser(sock.user?.id ?? '');
    const botLid = sock.user?.lid ? jidNormalizedUser(sock.user.lid) : null;
    const fromMe = Boolean(
      (botJid && areJidsSameUser(senderJid, botJid)) ||
      (botLid && senderLid && areJidsSameUser(senderLid, botLid))
    );

    const quotedKey: proto.IMessageKey = {
      remoteJid: message.key.remoteJid!,
      fromMe,
      id: ctx.stanzaId,
      participant: ctx.participant,
    };

    const actions = this.createQuotedActions(sock, chatJid, quotedKey, quotedMsg, ctx);

    return {
      key: quotedKey,
      message: quotedMsg,
      text,
      senderJid,
      senderLid,
      isMedia: Boolean(mediaType && MEDIA_TYPES.has(mediaType)),
      mediaType,
      mimetype,
      fileName,
      ...actions,
    };
  }

  // ============================================================================
  // 4. IDENTITY & PERMISSION HELPERS
  // ============================================================================

  /**
   * Resolve sender JID, LID, and chat details using dual PN & LID Baileys v7 resolution.
   */
  private static resolveSender(
    key: WAMessageKey,
    sock: WASocket
  ): { chatJid: string; senderJid: string; senderLid: string | null; fromBot: boolean } {
    const fromBot = Boolean(key.fromMe);
    const chatJid = jidNormalizedUser(key.remoteJid!);

    const rawSender = key.participantAlt || key.remoteJidAlt || key.participant || key.remoteJid!;
    const senderJid = fromBot ? jidNormalizedUser(sock.user?.id ?? '') : jidNormalizedUser(rawSender);
    const senderLid = fromBot
      ? (sock.user?.lid ? jidNormalizedUser(sock.user.lid) : null)
      : this.findLid(key.participant, key.participantAlt, key.remoteJid, key.remoteJidAlt);

    return { chatJid, senderJid, senderLid, fromBot };
  }

  /**
   * Resolve admin permissions for both sender and bot within group chats.
   */
  private static resolvePermissions(
    adminMap: Map<string, boolean>,
    isGroup: boolean,
    senderJid: string,
    senderLid: string | null,
    sock: WASocket
  ): { isAdmin: boolean; isBotAdmin: boolean } {
    if (!isGroup) {
      return { isAdmin: false, isBotAdmin: false };
    }

    const botJid = jidNormalizedUser(sock.user?.id ?? '');
    const botLid = sock.user?.lid ? jidNormalizedUser(sock.user.lid) : null;

    return {
      isAdmin: this.resolveIsAdmin(adminMap, senderJid, senderLid),
      isBotAdmin: this.resolveIsAdmin(adminMap, botJid, botLid),
    };
  }

  /**
   * Fast O(1) Admin Resolution with safe iterator fallback (no array allocation).
   */
  private static resolveIsAdmin(
    adminMap: Map<string, boolean>,
    jid: string,
    lid: string | null
  ): boolean {
    if (adminMap.size === 0) return false;
    if (adminMap.get(jid) || (lid && adminMap.get(lid))) return true;

    // Fallback comparison loop without allocating [...adminMap.keys()]
    for (const adminJid of adminMap.keys()) {
      if (areJidsSameUser(adminJid, jid) || (lid && areJidsSameUser(adminJid, lid))) {
        return true;
      }
    }
    return false;
  }

  /**
   * Parse command name, prefix, arguments, and text payload from unwrapped message.
   */
  private static parseCommand(rawMsg: proto.IMessage | null | undefined): {
    body: string;
    prefix: string;
    command: string;
    args: string[];
    text: string;
    query: string;
  } {
    const body = this.extractBodyFromUnwrapped(rawMsg);
    const afterPrefix = body.startsWith(config.bot.prefix) ? body.slice(config.bot.prefix.length) : '';
    const hasPrefix = Boolean(afterPrefix && !afterPrefix.startsWith(' '));

    const cleanBody = hasPrefix ? afterPrefix.trim() : body.trim();
    const parts = cleanBody ? cleanBody.split(/\s+/) : [];
    const command = hasPrefix ? (parts[0] ?? '').toLowerCase() : '';
    const args = hasPrefix ? parts.slice(1) : parts;
    const text = args.join(' ');
    const query = text.trim();

    return {
      body,
      prefix: hasPrefix ? config.bot.prefix : '',
      command,
      args,
      text,
      query,
    };
  }
}