import { jidNormalizedUser, type WAMessage } from '@whiskeysockets/baileys';
import config from '@/config';
import logger from '@/utils/logger';
import { sleep } from '@/utils/delay';

export class MessageQueueService {
  private static queueProcessor: ((message: WAMessage) => Promise<void>) | null = null;
  private static lastChatScheduledTimestamp = new Map<string, number>();
  private static revokedMessages = new Set<string>();
  private static isShuttingDown = false;

  // ============================================================================
  // 1. PUBLIC PACING & DISPATCH APIS
  // ============================================================================

  /**
   * Set the callback handler that executes dequeued command messages.
   * This bridges the message pacing loop with the Baileys message execution engine.
   */
  static setQueueProcessor(fn: (message: WAMessage) => Promise<void>): void {
    this.queueProcessor = fn;
  }

  /**
   * Enqueue a validated message with per-chat GCRA Theoretical Arrival Time (TAT) pacing.
   * Execution is dispatched asynchronously (non-blocking) so long-running tasks never block quick commands.
   */
  static async enqueue(message: WAMessage): Promise<void> {
    const rawChatJid = message.key.remoteJid;
    const messageId = message.key.id;
    if (!rawChatJid || !messageId) return;

    const chatJid = jidNormalizedUser(rawChatJid);
    const jobKey = `${chatJid}:${messageId}`;
    const now = Date.now();

    // Auto-prune old chats if map grows
    this.pruneIdleChats(now);

    // 1. Calculate GCRA Theoretical Arrival Time (TAT) with randomized human jitter
    const lastScheduled = this.lastChatScheduledTimestamp.get(chatJid) ?? now;
    const baseTime = Math.max(now, lastScheduled);

    const min = config.rateLimit.minDelayMs;
    const max = config.rateLimit.maxDelayMs;
    const delayMs = Math.floor(Math.random() * (max - min + 1)) + min;

    const nextScheduledTime = baseTime + delayMs;
    this.lastChatScheduledTimestamp.set(chatJid, nextScheduledTime);

    // 2. Wait until our scheduled human typing window arrives
    const waitDuration = nextScheduledTime - Date.now();
    if (waitDuration > 0) {
      await sleep(waitDuration);
    }

    // 3. Check if shutdown was triggered or message was revoked (deleted by sender)
    if (this.isShuttingDown) return;
    if (this.revokedMessages.has(messageId) || this.revokedMessages.has(jobKey)) {
      this.revokedMessages.delete(messageId);
      this.revokedMessages.delete(jobKey);
      logger.info({ chatJid, messageId }, '[MessageQueueService] Message revoked before execution');
      return;
    }

    // 4. Non-Blocking Async Dispatch (Anti-HoL Blocking)
    if (!this.queueProcessor) return;
    this.queueProcessor(message).catch((err) => {
      logger.error(
        { err, chatJid, messageId },
        '[MessageQueueService] Plugin execution error'
      );
    });
  }

  /**
   * Revoke a scheduled message when a user deletes their message before execution.
   */
  static async revoke(chatJid: string, messageId: string): Promise<void> {
    const normalizedChat = jidNormalizedUser(chatJid);
    const jobKey = `${normalizedChat}:${messageId}`;
    this.revokedMessages.add(messageId);
    this.revokedMessages.add(jobKey);
    logger.info({ chatJid: normalizedChat, messageId }, '[MessageQueueService] Marked message as revoked');
  }

  /**
   * Gracefully shutdown the queue service and clear state.
   */
  static async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    this.lastChatScheduledTimestamp.clear();
    this.revokedMessages.clear();
    logger.info('[MessageQueueService] Queue service shutdown complete');
  }

  // ============================================================================
  // 2. PRIVATE MEMORY MANAGEMENT HELPERS
  // ============================================================================

  /**
   * Prune idle chat entries from memory to prevent memory leaks.
   */
  private static pruneIdleChats(now: number): void {
    if (this.lastChatScheduledTimestamp.size < 100) return;
    for (const [chatJid, lastTime] of this.lastChatScheduledTimestamp.entries()) {
      if (now - lastTime > 60_000) {
        this.lastChatScheduledTimestamp.delete(chatJid);
      }
    }
  }
}
