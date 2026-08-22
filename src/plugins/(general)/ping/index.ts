import type { Plugin } from '@/types/plugin';
import { Formatter } from '@/utils/formatter';

const pingPlugin: Plugin = {
  name: 'ping',
  aliases: ['p', 'speed'],
  category: 'general',
  description: 'Cek kecepatan respon dan status runtime bot.',
  usage: '',

  async exec(m) {
    const latency = Date.now() - m.timestamp;
    const uptime = Formatter.uptime();
    const runtime = `Bun ${Bun.version}`;

    await m.react('⚡');

    await m.reply(
      `⚡ *Pong!*\n\n` +
      `├ Respon : *${latency}ms*\n` +
      `├ Uptime : *${uptime}*\n` +
      `└ Runtime: *${runtime}*`
    );
  },
};

export default pingPlugin;
