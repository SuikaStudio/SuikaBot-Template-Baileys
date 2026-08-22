import type {
  WAMessage,
  WAMessageKey,
  proto,
  AnyMessageContent,
  MiscMessageGenerationOptions,
  WASocket
} from '@whiskeysockets/baileys';

// ── Quoted Message ─────────────────────────────────────────────────────────────
export interface QuotedMessage {
  key: proto.IMessageKey;
  message: proto.IMessage;
  /** Text content or media caption of the quoted message */
  text: string;
  /** Normalized sender JID (always PN @s.whatsapp.net or group @g.us) */
  senderJid: string;
  /** LID-format sender JID (@lid), available if WhatsApp sends it in-group */
  senderLid: string | null;
  isMedia: boolean;
  mediaType: string | null;
  /** MIME type of media (e.g. 'image/jpeg', 'application/pdf'), if present */
  mimetype: string | null;
  /** Original file name of document, if present */
  fileName: string | null;

  // ── Quoted Action Primitives ──────────────────────────────────────────────────
  /** React to the quoted message */
  react: (emoji: string) => Promise<WAMessage | undefined>;
  /** Delete the quoted message */
  delete: () => Promise<WAMessage | undefined>;
  /** Download media from the quoted message */
  downloadMedia: () => Promise<Buffer>;
}

// ── Serialized Message ─────────────────────────────────────────────────────────
export interface SerializedMessage {
  // Raw Baileys data
  raw: WAMessage;
  sock: WASocket;

  // Message identity
  key: WAMessageKey;
  messageId: string;
  chatJid: string;          // Normalized via jidNormalizedUser() — always PN or group format
  senderJid: string;        // Normalized sender JID (always PN @s.whatsapp.net)
  senderLid: string | null; // LID-format sender JID (@lid), if present in-group
  senderName: string;
  timestamp: number;
  fromBot: boolean;         // True if message was sent by this bot instance itself

  // Chat context
  isGroup: boolean;
  isAdmin: boolean;         // Is sender an admin in this group?
  isBotAdmin: boolean;      // Is bot an admin in this group?

  // Media flags
  isMedia: boolean;
  isQuotedMedia: boolean;
  mediaType: string | null; // e.g. 'imageMessage', 'videoMessage', etc.
  /** MIME type of media (e.g. 'image/jpeg', 'application/pdf'), if present */
  mimetype: string | null;
  /** Original file name of document, if present */
  fileName: string | null;

  // Quoted message (if any)
  quoted: QuotedMessage | null;

  // Mentioned users (JID list, normalized)
  mentionedJids: string[];

  // ── Command & Argument Parsing ────────────────────────────────────────────────
  body: string;             // Full raw text body of the message
  prefix: string;           // The prefix used (e.g. '.')
  command: string;          // The command name (e.g. 'ping' from '.ping hello')
  text: string;             // Everything after the command (e.g. 'hello world')
  query: string;            // Alias for text, trimmed
  args: string[];           // text split by whitespace (e.g. ['hello', 'world'])

  /** Split text by a custom delimiter. Default splits by whitespace. */
  split: (delimiter?: string | RegExp) => string[];

  // ── Built-in Action Primitives ────────────────────────────────────────────────
  /** Reply with text or rich media content (image, video, etc.), quoted by default */
  reply: (
    content: string | AnyMessageContent,
    options?: MiscMessageGenerationOptions
  ) => Promise<WAMessage | undefined>;

  /** Send an emoji reaction to this message */
  react: (emoji: string) => Promise<WAMessage | undefined>;

  /**
   * Edit a previously sent bot message.
   * @param keyToEdit - The message key of the bot message to edit
   * @param newText   - The new text content
   */
  edit: (keyToEdit: proto.IMessageKey, newText: string) => Promise<WAMessage | undefined>;

  /** Delete a message (defaults to this message's key) */
  delete: (keyToDelete?: proto.IMessageKey) => Promise<WAMessage | undefined>;

  /** Broadcast "typing..." presence indicator to this chat */
  showTyping: () => Promise<void>;

  /** Broadcast "recording audio..." presence indicator to this chat */
  showRecording: () => Promise<void>;

  /**
   * Reply with a media message (image, video, audio, sticker, document).
   * @param type    - Media type string
   * @param content - Buffer or URL string
   * @param caption - Optional caption text
   */
  replyMedia: (
    type: 'image' | 'video' | 'audio' | 'sticker' | 'document' | 'ptv',
    content: Buffer | string,
    caption?: string,
    options?: { mimetype?: string; fileName?: string; ptt?: boolean }
  ) => Promise<WAMessage | undefined>;

  /**
   * Download media from this message.
   * Uses reuploadRequest for expired media URLs (404 recovery).
   */
  downloadMedia: () => Promise<Buffer>;
}
