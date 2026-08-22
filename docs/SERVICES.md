# Panduan Domain Services & Utility SDK

SuikaBot menyediakan kumpulan **Domain Services** dan **Infrastructure Drivers** siap pakai untuk mempermudah pembuatan fitur bot yang kompleks tanpa harus menulis ulang logika database atau HTTP request dari nol.

---

## 📑 Daftar Isi
1. [ChatStateService (Percakapan Interaktif Multi-Step)](#1-chatstateservice-percakapan-interaktif-multi-step)
2. [HttpService (HTTP Request Aman & Cepat)](#2-httpservice-http-request-aman--cepat)
3. [MessageStoreService (Cache Grup & Retries)](#3-messagestoreservice-cache-grup--retries)
4. [RedisService (Database I/O dengan Auto-Prefix)](#4-redisservice-database-io-dengan-auto-prefix)
5. [Formatter Utility (Format Tanggal, Ukuran, & Teks)](#5-formatter-utility-format-tanggal-ukuran--teks)

---

## 1. ChatStateService (Percakapan Interaktif Multi-Step)

`ChatStateService` digunakan untuk menyimpan state/tahapan percakapan pengguna secara sementara di Redis (misal: pendaftaran formulir, kuis interaktif, konfirmasi transaksi).

### 🛠️ API Reference:
* `await ChatStateService.set(chatJid, key, value, ttlSeconds?)` — Simpan state (Default TTL: 10 menit).
* `await ChatStateService.get<T>(chatJid, key)` — Ambil data state.
* `await ChatStateService.has(chatJid, key)` — Cek apakah state sedang aktif.
* `await ChatStateService.del(chatJid, key)` — Hapus state setelah percakapan selesai.

---

### 💡 Contoh Nyata: Form Pendaftaran Pengguna 2 Tahap

```typescript
import type { Plugin } from '@/types/plugin';
import { ChatStateService } from '@/services/chatState';

const registerPlugin: Plugin = {
  name: 'register',
  category: 'general',
  description: 'Pendaftaran member baru',

  async exec(m) {
    const stateKey = 'registration_step';

    // Tahap 1: Jika user belum memulai, tanyakan nama
    if (!(await ChatStateService.has(m.chatJid, stateKey))) {
      await ChatStateService.set(m.chatJid, stateKey, { step: 1 });
      await m.reply('Silakan masukkan *Nama Lengkap* Anda:');
      return;
    }

    // Tahap 2: Ambil state sebelumnya dan simpan data
    const currentState = await ChatStateService.get<{ step: number; name?: string }>(
      m.chatJid,
      stateKey
    );

    if (currentState?.step === 1) {
      const name = m.text.trim();
      await ChatStateService.set(m.chatJid, stateKey, { step: 2, name });
      await m.reply(`Halo ${name}, sekarang masukkan *Alamat Email* Anda:`);
      return;
    }

    if (currentState?.step === 2) {
      const email = m.text.trim();
      const name = currentState.name;

      // Selesaikan pendaftaran & hapus state
      await ChatStateService.del(m.chatJid, stateKey);
      await m.reply(`✅ Pendaftaran Berhasil!\n\nNama: *${name}*\nEmail: *${email}*`);
    }
  },
};

export default registerPlugin;
```

---

## 2. HttpService (HTTP Request Aman & Cepat)

`HttpService` adalah wrapper native `fetch` yang dilengkapi **Auto-Timeout** (mencegah bot hang jika API pihak ketiga down) dan penanganan error terpusat.

### 🛠️ API Reference:
* `await HttpService.getJson<T>(url, options?, timeoutMs?)` — Fetch & parse JSON otomatis.
* `await HttpService.getBuffer(url, options?, timeoutMs?)` — Download binary Buffer (gambar, audio, PDF).
* `await HttpService.postJson<T>(url, body, options?, timeoutMs?)` — Kirim payload POST JSON.
* `await HttpService.getStream(url, options?, timeoutMs?)` — Dapatkan ReadableStream untuk data streaming.

### 💡 Contoh: Mengambil Data Cuaca & Mengunduh Gambar
```typescript
import { HttpService } from '@/infra/http';

// 1. Ambil data JSON cuaca
interface WeatherResponse {
  temp: number;
  condition: string;
}
const weather = await HttpService.getJson<WeatherResponse>('https://api.example.com/weather');

// 2. Download gambar menjadi buffer untuk dikirim via WhatsApp
const imageBuffer = await HttpService.getBuffer('https://example.com/photo.jpg');
await m.replyMedia('image', imageBuffer, `Suhu saat ini: ${weather.temp}°C`);
```

---

## 3. MessageStoreService (Cache Grup & Retries)

`MessageStoreService` bertugas menjaga kestabilan bot di grup-grup besar:
* **Group Metadata Cache**: Menyimpan data peserta dan admin grup di Redis (TTL 24 jam) agar bot tidak di-*rate-limit* oleh server WhatsApp saat memeriksa status admin.
* **Message Store**: Menyimpan pesan selama 48 jam untuk mendukung dekripsi polling dan pengiriman ulang (*delivery retries*).

### 🛠️ API Reference:
* `await MessageStoreService.getCachedGroupMetadata(groupJid)` — Ambil data grup dari Redis.
* `await MessageStoreService.warmGroupCache(sock, groupJid)` — Perbarui cache grup.
* `await MessageStoreService.evictGroupCache(groupJid)` — Hapus cache saat bot keluar grup.

---

## 4. RedisService (Database I/O dengan Auto-Prefix)

Seluruh key yang disimpan melalui `RedisService` otomatis diawali dengan prefix environment (misal `suikabot:development:` atau `suikabot:production:`), sehingga staging dan production dapat berbagi server Redis yang sama tanpa tabrakan data.

### 🛠️ API Reference:
* `await RedisService.get(key)` — Ambil nilai string.
* `await RedisService.set(key, value, ttlSeconds?)` — Simpan string dengan TTL opsional.
* `await RedisService.del(key | key[])` — Hapus satu atau banyak key.
* `await RedisService.scan(pattern)` — Cari key berdasarkan pola (*pattern matching*).
* `await RedisService.ping()` — Uji konektivitas Redis.

---

## 5. Formatter Utility (Format Tanggal, Ukuran, & Teks)

Kumpulan helper murni (*stateless utilities*) di `src/utils/formatter.ts`:

```typescript
import { Formatter } from '@/utils/formatter';

// Format ukuran memori / file
Formatter.bytes(1048576);          // -> "1 MB"
Formatter.bytes(1073741824);       // -> "1 GB"

// Format durasi aktif bot
Formatter.uptime();                // -> "2d 4h 15m 30s"

// Format tanggal & jam lokal
Formatter.date(new Date());        // -> "16 Agustus 2026 19:30 WIB"

// Format teks string
Formatter.capitalize('suikabot');  // -> "Suikabot"
Formatter.truncate('Teks panjang sekali...', 10); // -> "Teks panj..."
Formatter.slugify('Halo Dunia 2026!');            // -> "halo-dunia-2026"

// WhatsApp UI Card & Layout Formatters
Formatter.box('SUIKABOT STATUS', ['• OS: Linux', '• Memory: 45 MB']);
// -> Menghasilkan card berbingkai rapi untuk menu & status bot

Formatter.list(['Item 1', 'Item 2', 'Item 3']);
// -> Menghasilkan bulleted list WhatsApp

Formatter.quote('Pesan peringatan penting');
// -> Menghasilkan teks blockquote WhatsApp (>)

Formatter.mono('bun test');
// -> Menghasilkan inline monospace code
```

---

## 6. System Messages (`src/utils/messages.ts`)

Kumpulan pesan notifikasi sistem terpusat untuk guard dan error handling yang konsisten di seluruh bot:

```typescript
import { systemMessages } from '@/utils/messages';

systemMessages.groupOnly;         // -> "⚠️ Fitur ini hanya dapat digunakan di dalam grup!"
systemMessages.privateOnly;       // -> "⚠️ Fitur ini hanya dapat digunakan di pesan pribadi (DM)!"
systemMessages.adminOnly;         // -> "⛔ Akses Ditolak: Perintah ini hanya untuk Admin Grup!"
systemMessages.botAdminOnly;      // -> "⚠️ Bot harus menjadi Admin grup untuk menjalankan perintah ini!"
systemMessages.unauthorized;      // -> "⛔ Akses Ditolak: Anda tidak memiliki izin untuk perintah ini!"
systemMessages.executionError;     // -> "❌ Terjadi kesalahan saat memproses perintah ini."
```

