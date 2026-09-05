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
  mimetype: string | null;
  fileName: string | null;

  // Text & routing context
  body: string;             // Normalized message body text
  prefix: string;           // Matched prefix (e.g. '.') or empty string
  command: string;          // Extracted command name without prefix
  args: string[];           // Array of space-separated arguments
  text: string;             // Everything after the command name as a string
  query: string;            // Trimmed alias of `text`
  mentionedJids: string[];  // Normalized mentioned user JIDs

  // Quoted context
  quoted: QuotedMessage | null;

  // ── Bound Action Primitives ──────────────────────────────────────────────────
  /** Reply to this message in current chat */
  reply: (content: string | AnyMessageContent, options?: MiscMessageGenerationOptions) => Promise<WAMessage | undefined>;
  /** React with an emoji to this message */
  react: (emoji: string) => Promise<WAMessage | undefined>;
  /** Edit a previously sent bot message */
  edit: (keyToEdit: proto.IMessageKey, newText: string) => Promise<WAMessage | undefined>;
  /** Delete this message (works on bot's own messages or in groups if bot is admin) */
  delete: (keyToDelete?: proto.IMessageKey) => Promise<WAMessage | undefined>;
  /** Show typing presence indicator in current chat */
  showTyping: () => Promise<void>;
  /** Show recording presence indicator in current chat */
  showRecording: () => Promise<void>;
  /** Send media (image, video, document, audio, sticker, ptv) to current chat */
  replyMedia: (
    type: 'image' | 'video' | 'audio' | 'sticker' | 'document' | 'ptv',
    content: Buffer | string,
    caption?: string,
    options?: { mimetype?: string; fileName?: string; ptt?: boolean }
  ) => Promise<WAMessage | undefined>;
  /** Download media buffer attached directly to this message */
  downloadMedia: () => Promise<Buffer>;
  /** Helper to split message text cleanly */
  split: (delimiter?: string | RegExp) => string[];
}
