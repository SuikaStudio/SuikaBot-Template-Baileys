/**
 * Centralized system-level guard and error messages.
 * Edit this file to customize global bot messages, emoji, or language.
 */
export const systemMessages = {
  guard: {
    groupOnly: '❌ Perintah ini hanya bisa digunakan di dalam grup.',
    privateOnly: '❌ Perintah ini hanya bisa digunakan di pesan pribadi (DM).',
    adminOnly: '❌ Perintah ini hanya untuk admin grup.',
    botAdminOnly: '❌ Bot harus menjadi admin grup untuk menggunakan perintah ini.',
    unauthorized: '❌ Chat ini tidak memiliki izin untuk menggunakan perintah ini.',
  },
  error: {
    executionError: '❌ Terjadi kesalahan saat menjalankan perintah ini.',
  },
} as const;

export type SystemMessages = typeof systemMessages;
