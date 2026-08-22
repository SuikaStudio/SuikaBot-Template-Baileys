import type { Plugin } from '@/types/plugin';
import { PluginService } from '@/core/plugin';
import { Formatter } from '@/utils/formatter';
import config from '@/config';

const menuPlugin: Plugin = {
  name: 'menu',
  aliases: ['help', 'm'],
  category: 'general',
  description: 'Tampilkan daftar seluruh perintah bot.',
  usage: '[kategori]',

  async exec(m) {
    const queryCat = (m.text || '').toLowerCase().trim();
    const grouped = PluginService.getGroupedByCategory();

    const categoryLabels: Record<string, string> = {
      general: '🌐 General',
      system: '⚙️ System',
      tools: '🛠️ Tools',
    };

    let menuText = Formatter.box(config.bot.name, [`Prefix: *${config.bot.prefix}*`]) + '\n\n';

    let foundCategory = false;
    for (const [cat, pluginList] of grouped) {
      if (queryCat && cat.toLowerCase() !== queryCat) continue;
      foundCategory = true;

      const label = categoryLabels[cat] ?? `📌 ${cat.toUpperCase()}`;
      menuText += `*${label}*\n`;
      for (const p of pluginList) {
        const usage = p.usage ? ` ${p.usage}` : '';
        menuText += `├ ${config.bot.prefix}${p.name}${usage} - _${p.description}_\n`;
      }
      menuText += `\n`;
    }

    if (queryCat && !foundCategory) {
      await m.reply(
        `❌ Kategori *${queryCat}* tidak ditemukan.\n` +
          `Kategori tersedia: ${[...grouped.keys()].join(', ')}`
      );
      return;
    }

    menuText += `_Gunakan ${config.bot.prefix}menu <kategori> untuk filter per kategori._`;

    await m.reply(menuText.trim());
  },
};

export default menuPlugin;
