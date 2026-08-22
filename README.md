# 🍉 SuikaBot Starter Framework (Baileys v7)

Selamat datang di **SuikaBot Starter**! 🚀
Ini adalah kerangka kerja (*framework*) bot WhatsApp masa kini yang dirancang **sangat tangguh, super cepat, hemat memori, dan sangat mudah digunakan** — bahkan untuk Anda yang baru pertama kali belajar membuat bot WhatsApp!

---

## 🌟 Mengapa Memilih SuikaBot Starter?

- **⚡ Super Cepat & Hemat Memori**: Ditenagai oleh **Bun Runtime** dan **TypeScript**, membuat bot merespons pesan dalam hitungan milidetik.
- **🛡️ Sistem Anti-Ban & Anti-Crash**: Dilengkapi **Keyed GCRA Ingress Pacer (Non-Blocking)**. Bot memberikan jeda alami (seperti ketikan manusia) per-chat tanpa memblokir perintah lain. [Baca Dokumentasi Queue](docs/QUEUE.md).
- **📦 Sangat Mudah Menambah Fitur Baru**: Cukup buat satu berkas baru di dalam folder `src/plugins/`, dan fitur tersebut **otomatis terdeteksi dan muncul di menu bot** tanpa perlu pengkodean yang rumit!
- **📱 Dukungan Login QR Code & Kode Pairing**: Bisa login dengan cara scan QR Code atau memasukkan 8 digit Kode Pairing langsung di WhatsApp HP Anda.
- **💾 Sesi Login Aman di Redis**: Sesi WhatsApp disimpan dengan aman di database Redis, sehingga bot tetap login meskipun komputer/server Anda direstart.

---

## 🛠️ Persiapan Sebelum Memulai

Sebelum menjalankan bot, pastikan komputer/server Anda sudah memiliki:

1. **Bun Runtime** (Versi 1.0 atau terbaru)  
   👉 Download & Install di: [https://bun.sh](https://bun.sh)
2. **Database Redis** (Berjalan di `localhost:6379` atau gunakan Redis Cloud)  
   👉 Download Redis di: [https://redis.io](https://redis.io)

---

## 🚀 Langkah Cara Menjalankan Bot (Panduan Pemula)

Ikuti 5 langkah mudah berikut untuk menjalankan bot WhatsApp Anda:

### Langkah 1: Buka Terminal / Command Prompt
Buka terminal (atau PowerShell) di folder proyek ini.

### Langkah 2: Install Dependencies
Jalankan perintah berikut untuk mengunduh semua pustaka yang dibutuhkan:
```bash
bun install
```

### Langkah 3: Atur File Konfigurasi (`.env`)
Salin file `.env.example` menjadi `.env` (atau buat file baru bernama `.env`), lalu isi konfigurasinya:

```env
# Nama Bot Anda
BOT_NAME="SuikaBot"

# Prefix / Simbol Perintah (Contoh: .info, .menu)
BOT_PREFIX="."

# Nomor WhatsApp Owner/Pemilik Bot (Gunakan format internasional tanpa tanda +, contoh: 628123456789)
OWNER_NUMBER="628123456789"

# Metode Login (Pilih: false untuk Scan QR Code, true untuk Kode Pairing HP)
USE_PAIRING_CODE=false

# Nomor HP Bot jika menggunakan Kode Pairing (Format: 628999999999)
PAIRING_NUMBER="628999999999"

# Alamat Server Redis
REDIS_URL="redis://localhost:6379"

# Kecepatan Jeda Balas Pesan (Anti-Ban Rate Limit dalam milidetik)
RATE_LIMIT_MIN_DELAY_MS=500
RATE_LIMIT_MAX_DELAY_MS=1500
RATE_LIMIT_MAX_CONCURRENT=10
```

### Langkah 4: Jalankan Bot!
Jalankan perintah berikut untuk memulai bot:

- **Mode Pengembangan (Auto-Reload saat edit kode)**:
  ```bash
  bun run dev
  ```
- **Mode Produksi**:
  ```bash
  bun start
  ```

### Langkah 5: Hubungkan ke WhatsApp
- **Jika `USE_PAIRING_CODE=false`**: Terminal akan menampilkan **QR Code**. Buka WhatsApp di HP Anda $\rightarrow$ **Perangkat Tertaut (*Linked Devices*)** $\rightarrow$ **Tautkan Perangkat** $\rightarrow$ Scan QR Code tersebut.
- **Jika `USE_PAIRING_CODE=true`**: Terminal akan menampilkan **8 Digit Kode Pairing** (contoh: `ABCD-1234`). Buka WhatsApp di HP Anda $\rightarrow$ **Perangkat Tertaut** $\rightarrow$ **Tautkan dengan Nomor Telepon** $\rightarrow$ Masukkan kode tersebut.

🎉 **Selamat! Bot WhatsApp Anda sudah aktif dan siap digunakan!**

---

## 📑 Perintah Bawaan (*Built-in Commands*)

Bot ini sudah dilengkapi dengan beberapa perintah dasar yang siap pakai:

| Perintah | Deskripsi | Akses |
| :--- | :--- | :--- |
| **`.menu`** atau **`.help`** | Menampilkan daftar seluruh perintah bot secara rapi & terkelompok | Publik |
| **`.info`** atau **`.status`** | Menampilkan status kesehatan bot (Memory, Runtime, Redis, Uptime) | Publik |
| **`.ping`** | Mengecek kecepatan waktu respon (*latency*) bot | Publik |
| **`.eval <code>`** | Mengevaluasi & menjalankan kode JavaScript secara langsung | Khusus Owner |

---

## 🎨 Panduan Membuat Fitur / Perintah Baru

Untuk membuat perintah baru (misalnya perintah **`.halo`**), Anda **cukup membuat 1 folder dan berkas `index.ts`** di dalam `src/plugins/(general)/halo/index.ts`:

```typescript
import type { Plugin } from '@/types/plugin';

const haloPlugin: Plugin = {
  name: 'halo',                      // Nama perintah (.halo)
  aliases: ['hi', 'helo'],            // Alias perintah (.hi, .helo)
  category: 'general',               // Kategori menu ('general' | 'system' | 'tools')
  description: 'Menyapa pengguna bot', // Deskripsi perintah

  // Fungsi utama yang dieksekusi saat user mengetik .halo
  async exec(m) {
    await m.react('👋');
    await m.reply(`Halo Kak ${m.senderName}! Ada yang bisa SuikaBot bantu?`);
  },
};

export default haloPlugin;
```

Begitu berkas disimpan, perintah **`.halo`** akan **langsung otomatis aktif dan terdaftar di `.menu`**! ✨

> 📖 **Pelajari panduan lengkap plugin, lifecycle (`before`/`after`/`onError`), sub-commands, custom matcher, CLI flags, dan whitelist di:**  
> 👉 **[Dokumentasi Lengkap Plugin (`docs/PLUGIN.md`)](docs/PLUGIN.md)**

---

## 🛡️ Hak Akses Penggunaan Perintah (Guards)

Anda dapat membatasi siapa yang boleh menggunakan perintah cukup dengan menambahkan opsi guard sederhana:

```typescript
const adminPlugin: Plugin = {
  name: 'kick',
  category: 'group',
  description: 'Mengeluarkan anggota dari grup',

  // Pembatasan Hak Akses (Guards):
  groupOnly: true,     // Hanya bisa dipakai di dalam grup
  adminOnly: true,     // Hanya bisa dipakai oleh Admin Grup
  botAdminOnly: true,  // Bot harus jadi Admin Grup dulu
  allowedJids: ['6285691947512'], // Whitelist khusus JID/nomor tertentu

  async exec(m) {
    await m.reply('Mengeluarkan anggota...');
  }
};
```

---

## 📚 Pusat Dokumentasi (*Documentation Hub*)

SuikaBot dilengkapi dengan dokumentasi mendalam untuk setiap bagian framework:

| Dokumen | Deskripsi |
| :--- | :--- |
| 🔌 **[Panduan Plugin (`docs/PLUGIN.md`)](docs/PLUGIN.md)** | Arsitektur plugin, lifecycle (`before`/`after`/`onError`), sub-commands direktori, CLI flags, dan guards. |
| 💬 **[Kamus Objek Pesan `m` (`docs/SERIALIZE.md`)](docs/SERIALIZE.md)** | Cheat-sheet lengkap properti identitas, role admin, unduh media, quoted message, dan action helpers. |
| 🛡️ **[Sistem Antrean Anti-Ban (`docs/QUEUE.md`)](docs/QUEUE.md)** | Penjelasan arsitektur *Keyed GCRA Ingress Pacer* dan human-like randomized rate limiting. |
| ⏰ **[Schedules & Webhooks (`docs/SCHEDULES_AND_WEBHOOKS.md`)](docs/SCHEDULES_AND_WEBHOOKS.md)** | Panduan auto-loader tugas berkala (cron) dan endpoint HTTP (payment gateway callback). |
| 🧰 **[Domain Services & SDK (`docs/SERVICES.md`)](docs/SERVICES.md)** | Panduan `ChatStateService` (multi-step wizard), `HttpService`, `MessageStoreService`, dan `RedisService`. |
| 🧪 **[Skenario Pengujian E2E QA (`docs/E2E_QA_SCENARIOS.md`)](docs/E2E_QA_SCENARIOS.md)** | Panduan langkah demi langkah pengujian manual langsung di aplikasi WhatsApp sebelum rilis. |

---

## 🧪 Perintah Pengujian Kode (Untuk Developer)

Kerangka kerja ini dilengkapi dengan **100 Unit Test Otomatis** untuk memastikan seluruh fitur berjalan 100% tanpa bug:

- **Jalankan Seluruh Test Suite**:
  ```bash
  bun test
  ```
- **Jalankan Pemeriksaan Tipe TypeScript**:
  ```bash
  bun run typecheck
  ```

---

## 📁 Struktur Folder Proyek

```text
SuikaBot/
├── src/
│   ├── config.ts              # Konfigurasi aplikasi & validasi .env
│   ├── bootstrap.ts           # Mesin inisialisasi koneksi & shutdown
│   ├── index.ts               # Entry point utama aplikasi
│   ├── core/                  # Mesin Utama (SocketService, SerializeService, PluginService)
│   ├── infra/                 # Driver I/O (Redis, HTTP, Webhook, Cron)
│   ├── services/              # Layanan Bot (AuthStore, MessageStore, ChatState, MessageQueue GCRA)
│   ├── events/                # Penanganan Event WhatsApp (Message, Group, Call, Connection)
│   ├── plugins/               # Tempat Anda menambah perintah bot baru!
│   │   ├── (general)/         # Route group perintah umum
│   │   │   ├── ping/          # Command .ping
│   │   │   │   └── index.ts
│   │   │   ├── info/          # Command .info
│   │   │   │   ├── index.ts
│   │   │   │   └── index.test.ts
│   │   │   └── menu/          # Command .menu
│   │   │       └── index.ts
│   │   └── (system)/          # Route group utilitas sistem
│   │       └── reload/        # Command .reload
│   │           └── index.ts
│   └── utils/                 # Fungsi pembantu (formatters, messages, delay, logger, testing)
├── docs/                      # Dokumentasi mendalam arsitektur bot
├── .env                       # File konfigurasi utama
├── package.json               # Dependensi & skrip proyek
└── README.md                  # Dokumentasi panduan ini
```

---

## 📄 Lisensi & Kredit

Dibuat dengan ❤️ oleh **SuikaStudio Engine**.  
Ditenagai oleh [@whiskeysockets/baileys](https://github.com/WhiskeySockets/Baileys), [Bun](https://bun.sh), [Redis](https://redis.io), dan Keyed GCRA Pacer.
