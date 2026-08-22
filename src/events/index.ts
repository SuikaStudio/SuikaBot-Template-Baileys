import type { WASocket } from '@whiskeysockets/baileys';

import { onConnectionUpdate } from '@/events/connection';
import {
  onMessagesUpsert,
  onMessagesUpdate,
  processMessage
} from '@/events/message';
import {
  onGroupParticipantsUpdate,
  onGroupsUpdate
} from '@/events/group';
import { onCall } from '@/events/call';

import { MessageQueueService } from '@/services/messageQueue';

import logger from '@/utils/logger';

export const registerEvents = (
  sock: WASocket,
  saveCreds: () => Promise<void>,
  reconnect: () => Promise<void>
): void => {
  // Bridge GCRA message pacer with Baileys message execution engine
  MessageQueueService.setQueueProcessor((message) => processMessage(message, sock));

  // Setup socket event handlers
  sock.ev.process(async (events) => {
    if (events['creds.update']) {
      await saveCreds();
    }

    if (events['connection.update']) {
      await onConnectionUpdate(events['connection.update'], sock, reconnect);
    }

    if (events['messages.upsert']) {
      await onMessagesUpsert(events['messages.upsert'], sock).catch((err) =>
        logger.error({ err }, '[events] messages.upsert error')
      );
    }

    if (events['messages.update']) {
      await onMessagesUpdate(events['messages.update']).catch((err) =>
        logger.error({ err }, '[events] messages.update error')
      );
    }

    if (events['group-participants.update']) {
      await onGroupParticipantsUpdate(events['group-participants.update'], sock).catch((err) =>
        logger.error({ err }, '[events] group-participants.update error')
      );
    }

    if (events['groups.update']) {
      await onGroupsUpdate(events['groups.update'], sock).catch((err) =>
        logger.error({ err }, '[events] groups.update error')
      );
    }

    if (events['call']) {
      await onCall(events['call'], sock).catch((err) =>
        logger.error({ err }, '[events] call error')
      );
    }
  });

  logger.info('[events] All event handlers registered via sock.ev.process()');
};
