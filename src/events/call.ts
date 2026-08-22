import type { WACallEvent, WASocket } from '@whiskeysockets/baileys';

import logger from '@/utils/logger';

export const onCall = async (
  calls: WACallEvent[],
  sock: WASocket
): Promise<void> => {
  for (const call of calls) {
    /* Only handle initial incoming call offer (ringing start)
     * And ignore other lifecycle states (ringing, timeout, terminate)
     */
    if (call.status !== 'offer') continue;

    logger.info(
      { callId: call.id, from: call.from, isVideo: call.isVideo },
      '[call] Incoming call'
    );
  }
};
