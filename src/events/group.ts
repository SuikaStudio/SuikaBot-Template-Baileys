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
    // If bot itself was removed/left, evict cache and skip warming metadata
    const isBotRemoved = participants.some((p) => {
      const jid = typeof p === 'string' ? p : p.id;
      const lid = typeof p === 'string' ? undefined : p.lid;
      const pn = typeof p === 'string' ? undefined : p.phoneNumber;

      return (
        areJidsSameUser(jid, sock.user?.id) ||
        areJidsSameUser(jid, sock.user?.lid) ||
        (lid ? areJidsSameUser(lid, sock.user?.lid) : false) ||
        (pn ? areJidsSameUser(pn, sock.user?.id) : false)
      );
    });

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

    const groupJid = jidNormalizedUser(group.id);

    // Only warm cache if group is already tracked in cache.
    // If bot was removed or group was evicted, skip blind network fetch to prevent 403 Forbidden.
    const cached = await MessageStoreService.getCachedGroupMetadata(groupJid);
    if (!cached) continue;

    await MessageStoreService.warmGroupCache(sock, groupJid);

    logger.debug({ groupJid }, '[group] Group metadata updated');
  }
};