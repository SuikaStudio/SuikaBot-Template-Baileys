import { describe, test, expect } from 'bun:test';
import type { WAMessage } from '@whiskeysockets/baileys';

import { SerializeService } from '@/core/serialize';
import { MessageStoreService } from '@/services/messageStore';
import { TestHelper } from '@/utils/testing';

describe('core/serialize', () => {
  describe('extractBody', () => {
    test('extracts plain conversation text', () => {
      const msg: WAMessage = {
        key: { remoteJid: '123@s.whatsapp.net', id: 'M1' },
        message: { conversation: '.ping' },
      };
      expect(SerializeService.extractBody(msg)).toBe('.ping');
    });

    test('extracts extendedTextMessage text', () => {
      const msg: WAMessage = {
        key: { remoteJid: '123@s.whatsapp.net', id: 'M2' },
        message: { extendedTextMessage: { text: '.menu' } },
      };
      expect(SerializeService.extractBody(msg)).toBe('.menu');
    });

    test('unwraps viewOnceMessage wrappers', () => {
      const viewOnceMsg: WAMessage = {
        key: { remoteJid: '123@s.whatsapp.net', id: 'M3' },
        message: {
          viewOnceMessage: {
            message: {
              imageMessage: { caption: '.stiker' },
            },
          },
        },
      };
      expect(SerializeService.extractBody(viewOnceMsg)).toBe('.stiker');
    });

    test('unwraps ephemeralMessage wrappers', () => {
      const ephemeralMsg: WAMessage = {
        key: { remoteJid: '123@s.whatsapp.net', id: 'M4' },
        message: {
          ephemeralMessage: {
            message: {
              conversation: '.info',
            },
          },
        },
      };
      expect(SerializeService.extractBody(ephemeralMsg)).toBe('.info');
    });

    test('extracts buttonsResponseMessage selectedButtonId', () => {
      const btnMsg: WAMessage = {
        key: { remoteJid: '123@s.whatsapp.net', id: 'B1' },
        message: { buttonsResponseMessage: { selectedButtonId: '.pilihan1' } },
      };
      expect(SerializeService.extractBody(btnMsg)).toBe('.pilihan1');
    });

    test('extracts listResponseMessage selectedRowId', () => {
      const listMsg: WAMessage = {
        key: { remoteJid: '123@s.whatsapp.net', id: 'L1' },
        message: { listResponseMessage: { singleSelectReply: { selectedRowId: '.menu' } } },
      };
      expect(SerializeService.extractBody(listMsg)).toBe('.menu');
    });

    test('extracts templateButtonReplyMessage selectedId', () => {
      const tplMsg: WAMessage = {
        key: { remoteJid: '123@s.whatsapp.net', id: 'T1' },
        message: { templateButtonReplyMessage: { selectedId: '.template_btn' } },
      };
      expect(SerializeService.extractBody(tplMsg)).toBe('.template_btn');
    });

    test('extracts interactiveResponseMessage body text', () => {
      const flowMsg: WAMessage = {
        key: { remoteJid: '123@s.whatsapp.net', id: 'I1' },
        message: { interactiveResponseMessage: { body: { text: '.flow_cmd' } } },
      };
      expect(SerializeService.extractBody(flowMsg)).toBe('.flow_cmd');
    });

    test('extracts pollCreationMessage name', () => {
      const pollMsg: WAMessage = {
        key: { remoteJid: '123@s.whatsapp.net', id: 'P1' },
        message: { pollCreationMessage: { name: 'Pilih warna favorit' } },
      };
      expect(SerializeService.extractBody(pollMsg)).toBe('Pilih warna favorit');
    });

    test('extracts ptvMessage caption', () => {
      const ptvMsg: WAMessage = {
        key: { remoteJid: '123@s.whatsapp.net', id: 'PTV1' },
        message: { ptvMessage: { caption: '.videonote' } },
      };
      expect(SerializeService.extractBody(ptvMsg)).toBe('.videonote');
    });

    test('extracts contactMessage and contactsArrayMessage displayName', () => {
      const contactMsg: WAMessage = {
        key: { remoteJid: '123@s.whatsapp.net', id: 'C1' },
        message: { contactMessage: { displayName: 'John Doe' } },
      };
      expect(SerializeService.extractBody(contactMsg)).toBe('John Doe');

      const contactsArrMsg: WAMessage = {
        key: { remoteJid: '123@s.whatsapp.net', id: 'C2' },
        message: { contactsArrayMessage: { displayName: 'Jane Doe' } },
      };
      expect(SerializeService.extractBody(contactsArrMsg)).toBe('Jane Doe');
    });
  });

  describe('parse', () => {
    test('serializes raw WAMessage into SerializedMessage helper object', async () => {
      const rawMsg: WAMessage = {
        key: { remoteJid: '1234567890@s.whatsapp.net', id: 'MSG100', fromMe: false },
        pushName: 'Tester',
        messageTimestamp: 1600000000,
        message: { conversation: '.ping hello world' },
      };

      const mockSock = TestHelper.createMockSocket();

      const m = await SerializeService.parse(rawMsg, mockSock);
      expect(m).not.toBeNull();
      if (!m) return;

      expect(m.chatJid).toBe('1234567890@s.whatsapp.net');
      expect(m.senderName).toBe('Tester');
      expect(m.body).toBe('.ping hello world');
      expect(m.prefix).toBe('.');
      expect(m.command).toBe('ping');
      expect(m.text).toBe('hello world');
      expect(m.query).toBe('hello world');
      expect(m.args).toEqual(['hello', 'world']);
      expect(m.split()).toEqual(['hello', 'world']);
      expect(m.isGroup).toBe(false);
      expect(m.fromBot).toBe(false);
      expect(m.mimetype).toBeNull();
      expect(m.fileName).toBeNull();
    });

    test('extracts mimetype and fileName for media messages including ptvMessage', async () => {
      const docMsg: WAMessage = {
        key: { remoteJid: '1234567890@s.whatsapp.net', id: 'DOC100', fromMe: false },
        pushName: 'Tester',
        message: {
          documentMessage: {
            mimetype: 'application/pdf',
            fileName: 'report.pdf',
            caption: '.testmedia',
          },
        },
      };

      const mockSock = TestHelper.createMockSocket();

      const m = await SerializeService.parse(docMsg, mockSock);
      expect(m).not.toBeNull();
      if (!m) return;

      expect(m.isMedia).toBe(true);
      expect(m.mediaType).toBe('documentMessage');
      expect(m.mimetype).toBe('application/pdf');
      expect(m.fileName).toBe('report.pdf');

      const ptvMsg: WAMessage = {
        key: { remoteJid: '1234567890@s.whatsapp.net', id: 'PTV100', fromMe: false },
        message: { ptvMessage: { caption: '.ptv' } },
      };
      const ptvParsed = await SerializeService.parse(ptvMsg, mockSock);
      expect(ptvParsed?.isMedia).toBe(true);
      expect(ptvParsed?.mediaType).toBe('ptvMessage');
    });

    test('resolves Dual-Identity PN and LID sender identifiers', async () => {
      const lidMsg: WAMessage = {
        key: {
          remoteJid: '120363000000000000@g.us',
          participant: '100000000000000@lid',
          participantAlt: '628123456789@s.whatsapp.net',
          id: 'LID_MSG_1',
          fromMe: false,
        },
        message: { conversation: '.info' },
      };

      const mockSock = TestHelper.createMockSocket();

      const m = await SerializeService.parse(lidMsg, mockSock);
      expect(m).not.toBeNull();
      if (!m) return;

      expect(m.senderJid).toBe('628123456789@s.whatsapp.net');
      expect(m.senderLid).toBe('100000000000000@lid');
      expect(m.isGroup).toBe(true);
    });

    test('extracts quoted message context correctly', async () => {
      const quotedMsg: WAMessage = {
        key: { remoteJid: '1234567890@s.whatsapp.net', id: 'MSG_MAIN', fromMe: false },
        message: {
          extendedTextMessage: {
            text: '.reply',
            contextInfo: {
              stanzaId: 'QUOTED_ID_999',
              participant: '628111111111@s.whatsapp.net',
              quotedMessage: {
                conversation: 'pesan yang dibalas',
              },
            },
          },
        },
      };

      let sentReact = false;
      let sentDelete = false;

      const mockSock = TestHelper.createMockSocket({
        sendMessage: async (_jid: string, content: any) => {
          if (content.react) sentReact = true;
          if (content.delete) sentDelete = true;
          return undefined;
        },
      });

      const m = await SerializeService.parse(quotedMsg, mockSock);
      expect(m?.quoted).not.toBeNull();
      expect(m?.quoted?.text).toBe('pesan yang dibalas');
      expect(m?.quoted?.senderJid).toBe('628111111111@s.whatsapp.net');
      expect(m?.quoted?.key.id).toBe('QUOTED_ID_999');

      await m?.quoted?.react('👍');
      expect(sentReact).toBe(true);

      await m?.quoted?.delete();
      expect(sentDelete).toBe(true);
    });

    test('resolves group admins and bot admin flags via adminMap', async () => {
      const groupJid = '120363000000000000@g.us';
      const adminUser = '628111111111@s.whatsapp.net';
      const botUser = '628999999999@s.whatsapp.net';

      const adminMap = new Map<string, boolean>([
        [adminUser, true],
        [botUser, true],
      ]);

      const msg: WAMessage = {
        key: {
          remoteJid: groupJid,
          participant: adminUser,
          id: 'ADM_1',
          fromMe: false,
        },
        message: { conversation: '.admincheck' },
      };

      const mockSock = TestHelper.createMockSocket({
        user: { id: botUser },
      });

      const m = await SerializeService.parse(msg, mockSock, adminMap);
      expect(m?.isAdmin).toBe(true);
      expect(m?.isBotAdmin).toBe(true);
    });

    test('executes action helpers successfully including ptt voice notes and ptv', async () => {
      let replyText = '';
      let presenceStatus = '';
      let sentMediaPayload: any = null;

      const msg: WAMessage = {
        key: { remoteJid: '123456@s.whatsapp.net', id: 'ACT_1', fromMe: false },
        message: { conversation: '.ping' },
      };

      const mockSock = TestHelper.createMockSocket({
        user: { id: '628999999999@s.whatsapp.net' },
        sendMessage: async (_jid: string, content: any) => {
          if (content.text) replyText = content.text;
          if (content.audio || content.video) sentMediaPayload = content;
          return undefined;
        },
        sendPresenceUpdate: async (type: string) => {
          presenceStatus = type;
        },
      });

      const m = await SerializeService.parse(msg, mockSock);
      expect(m).not.toBeNull();
      if (!m) return;

      await m.reply('pong');
      expect(replyText).toBe('pong');

      await m.showTyping();
      expect(presenceStatus).toBe('composing');

      await m.showRecording();
      expect(presenceStatus).toBe('recording');

      // Test replyMedia audio with ptt: true
      await m.replyMedia('audio', Buffer.from('audio-data'), undefined, { ptt: true });
      expect(sentMediaPayload?.ptt).toBe(true);
      expect(sentMediaPayload?.mimetype).toBe('audio/ogg; codecs=opus');

      // Test replyMedia ptv video note
      await m.replyMedia('ptv', Buffer.from('ptv-data'));
      expect(sentMediaPayload?.ptv).toBe(true);
    });

    test('reply, replyMedia, and edit automatically save sent messages to MessageStoreService', async () => {
      const redis = TestHelper.mockRedis();
      try {
        const msg: WAMessage = {
          key: { remoteJid: '123456@s.whatsapp.net', id: 'ACT_RETRY_1', fromMe: false },
          message: { conversation: '.ping' },
        };

        const mockSock = TestHelper.createMockSocket({
          user: { id: '628999999999@s.whatsapp.net' },
          sendMessage: async (jid: string, content: unknown) => {
            return {
              key: { remoteJid: jid, id: 'SENT_ID_101', fromMe: true },
              message: content,
            } as unknown as WAMessage;
          },
        });

        const m = await SerializeService.parse(msg, mockSock);
        expect(m).not.toBeNull();
        if (!m) return;

        await m.reply('Hello retry world');

        // Check if sent message was stored in MessageStoreService
        const saved = await MessageStoreService.getMessage({
          remoteJid: '123456@s.whatsapp.net',
          id: 'SENT_ID_101',
        });
        expect(saved).toBeDefined();
        expect((saved?.message as Record<string, unknown> | undefined)?.['text']).toBe('Hello retry world');
      } finally {
        redis.restore();
      }
    });
  });
});
