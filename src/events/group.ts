import {
  jidNormalizedUser,
  areJidsSameUser,
  type GroupMetadata,
  type WASocket,
  type BaileysEventMap,
} from '@whiskeysockets/baileys';

import { MessageStoreService } from '@/services/messageStore';

import logger from '@/utils/logger';

type GroupParticipantsUpdateEvent = BaileysEventMap['group-participants.update'];

export const onGroupParticipantsUpdate = async (
  event: GroupParticipantsUpdateEvent,
  sock: WASocket
): Promise<void> => {
  const { id, participants, action } = event;

  const groupJid = jidNormalizedUser(id);
  const participantJids = participants.map((p) =>
    typeof p === 'string' ? jidNormalizedUser(p) : jidNormalizedUser(p.id)
  );

  if (action === 'remove') {
    // Evict group cache if the bot itself is removed from the group
    const botJid = jidNormalizedUser(sock.user?.id ?? '');
    const isBotRemoved = participantJids.some((pJid) =>
      areJidsSameUser(pJid, botJid)
    );

    if (isBotRemoved) {
      await MessageStoreService.evictGroupCache(groupJid);
      return;
    }
  }

  // Warm up group cache on participant update
  await MessageStoreService.warmGroupCache(sock, groupJid);
  logger.debug({ groupJid, action, participants: participantJids }, '[group] Participants updated');
};

export const onGroupsUpdate = async (
  groups: Partial<GroupMetadata>[],
  sock: WASocket
): Promise<void> => {
  for (const group of groups) {
    if (!group.id) continue;

    // Warm up group cache on group update
    const groupJid = jidNormalizedUser(group.id);
    await MessageStoreService.warmGroupCache(sock, groupJid);

    logger.debug({ groupJid }, '[group] Group metadata updated');
  }
};
