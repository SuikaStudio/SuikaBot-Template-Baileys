import type { Plugin } from '@/types/plugin';
import { Formatter } from '@/utils/formatter';
import { RedisService } from '@/infra/redis';

const infoPlugin: Plugin = {
  name: 'info',
  aliases: [],
  category: 'general',
  description: 'Tampilkan informasi sistem dan status bot.',
  usage: '',

  async exec(m) {
    await m.showTyping();

    const uptime = Formatter.uptime();
    const memUsage = process.memoryUsage();
    const heapUsed = Formatter.bytes(memUsage.heapUsed);
    const heapTotal = Formatter.bytes(memUsage.heapTotal);
    const rss = Formatter.bytes(memUsage.rss);

    let redisStatus = '❌ Disconnected';
    try {
      await RedisService.ping();
      redisStatus = '✅ Connected';
    } catch {
      redisStatus = '❌ Disconnected';
    }

    const runtime = `Bun ${Bun.version}`;
    const platform = process.platform;
    const arch = process.arch;

    await m.reply(
      `🤖 *Bot Information*\n\n` +
      `*Runtime*\n` +
      `├ Engine  : ${runtime}\n` +
      `├ Platform: ${platform} (${arch})\n` +
      `└ Uptime  : ${uptime}\n\n` +
      `*Memory*\n` +
      `├ Heap    : ${heapUsed} / ${heapTotal}\n` +
      `└ RSS     : ${rss}\n\n` +
      `*Infrastructure*\n` +
      `└ Redis   : ${redisStatus}`
    );
  },
};

export default infoPlugin;
