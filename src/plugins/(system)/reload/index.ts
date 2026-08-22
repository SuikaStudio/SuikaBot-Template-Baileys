import type { Plugin } from '@/types/plugin';
import { PluginService } from '@/core/plugin';

const reloadPlugin: Plugin = {
  name: 'reload',
  category: 'system',
  description: 'Hot-reload semua plugin tanpa restart bot.',
  allowedJids: [],

  async exec(m) {
    await m.react('🔄');
    const before = PluginService.getAll().length;
    await PluginService.load();
    const after = PluginService.getAll().length;
    await m.react('✅');
    await m.reply(
      `🔄 *Plugin berhasil di-reload!*\n` +
      `Sebelum: *${before}* plugin\n` +
      `Sesudah: *${after}* plugin`
    );
  },
};

export default reloadPlugin;
