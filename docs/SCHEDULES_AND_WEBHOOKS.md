# Panduan Schedules & Webhooks Modular

SuikaBot dilengkapi dengan sistem **Auto-Loader Modular** untuk menangani **Tugas Berkala (Cron Jobs)** dan **Endpoint HTTP (Webhooks / API Callbacks)** tanpa perlu menyentuh konfigurasi server utama.

---

## 📑 Daftar Isi
1. [Schedules: Tugas Berkala Cron (`src/schedules/`)](#1-schedules-tugas-berkala-cron-srcschedules)
   - [Cara Kerja Auto-Loader](#cara-kerja-auto-loader-schedules)
   - [Format Penulisan Schedule](#format-penulisan-schedule)
   - [Contoh Implementasi Nyata](#contoh-implementasi-schedule)
2. [Webhooks: Endpoint HTTP Callback (`src/webhooks/`)](#2-webhooks-endpoint-http-callback-srcwebhooks)
   - [Cara Kerja Webhook Server](#cara-kerja-webhook-server)
   - [Format Penulisan Route Webhook](#format-penulisan-route-webhook)
   - [Contoh Implementasi Nyata (Payment Gateway & Notifikasi)](#contoh-implementasi-webhook)

---

## 1. Schedules: Tugas Berkala Cron (`src/schedules/`)

Schedules menggunakan engine **`Croner`** yang mendukung pola cron standar, timezone lokal (`Asia/Jakarta`), dan perlindungan dari *overlapping execution*.

### 🔍 Cara Kerja Auto-Loader Schedules:
1. Letakkan file `.ts` baru di dalam folder `src/schedules/`.
2. Engine SuikaBot akan **secara otomatis memuat dan menjadwalkan tugas** saat bot *startup*.
3. Fitur schedules dapat dinyalakan/dimatikan melalui file `.env`: `ENABLE_SCHEDULES=true`.

---

### 📝 Format Penulisan Schedule:

Setiap file di `src/schedules/` mengekspor objek default yang mengimplementasikan `Schedule`:

```typescript
import type { Schedule } from '@/types/schedule';
import logger from '@/utils/logger';

const mySchedule: Schedule = {
  name: 'daily-reminder',          // Nama unik tugas
  pattern: '0 7 * * *',           // Cron pattern (Setiap jam 07:00 pagi)
  enabled: true,                  // Set false jika ingin menonaktifkan sementara

  async run(job) {
    logger.info('[Schedules] Menjalankan pengingat pagi...');
    // Logika yang ingin dijalankan berkala
  },
};

export default mySchedule;
```

#### ⏰ Format Pola Cron Populer:
* `*/15 * * * *` — Setiap 15 menit.
* `0 * * * *` — Setiap jam tepat (menit ke-0).
* `0 7 * * *` — Setiap hari jam 07:00 pagi (WIB).
* `0 0 * * 0` — Setiap hari Minggu jam 00:00 tengah malam.

---

### 💡 Contoh Implementasi Schedule:

#### Contoh: Auto-Broadcast Pengingat Sholat / Jam Masuk Kerja ke Grup
Buat file `src/schedules/morningReminder.ts`:

```typescript
import type { Schedule } from '@/types/schedule';
import { RedisService } from '@/infra/redis';
import logger from '@/utils/logger';

const morningReminder: Schedule = {
  name: 'morning-reminder',
  pattern: '0 8 * * 1-5', // Senin - Jumat jam 08:00 WIB
  enabled: true,

  async run() {
    logger.info('[Schedule] Mengirim pengingat pagi ke grup kantor...');
    // Anda dapat memanggil soket WhatsApp atau fungsi broadcast di sini
  },
};

export default morningReminder;
```

---

## 2. Webhooks: Endpoint HTTP Callback (`src/webhooks/`)

SuikaBot memiliki **Embedded HTTP Server Bun** yang super cepat untuk menerima request dari layanan eksternal (misal Midtrans, GitHub, Stripe, Uptime Kuma).

### 🔍 Cara Kerja Webhook Server:
1. Letakkan file route baru di dalam folder `src/webhooks/`.
2. Saat bot menyala, server HTTP akan aktif di port yang ditentukan di `.env` (`WEBHOOK_PORT=3000`).
3. Seluruh route otomatis terdaftar sesuai properti `path`.

---

### 📝 Format Penulisan Route Webhook:

Setiap file di `src/webhooks/` mengekspor objek default yang mengimplementasikan `WebhookRoute`:

```typescript
import type { WebhookRoute } from '@/types/webhook';

const myWebhook: WebhookRoute = {
  path: '/webhook/my-service',

  async handler(req: Request) {
    // 1. Cek HTTP Method
    if (req.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    // 2. Baca Body JSON
    const body = await req.json();

    // 3. Kembalikan Response HTTP
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  },
};

export default myWebhook;
```

---

### 💡 Contoh Implementasi Webhook:

#### Contoh: Notifikasi Transaksi Pembayaran Berhasil (Midtrans Callback)
Buat file `src/webhooks/paymentCallback.ts`:

```typescript
import type { WebhookRoute } from '@/types/webhook';
import logger from '@/utils/logger';

const paymentCallback: WebhookRoute = {
  path: '/webhook/payment',

  async handler(req: Request) {
    if (req.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    try {
      const payload = (await req.json()) as {
        order_id: string;
        transaction_status: string;
        gross_amount: string;
      };

      logger.info(
        { orderId: payload.order_id, status: payload.transaction_status },
        '[Webhook] Menerima notifikasi pembayaran'
      );

      if (payload.transaction_status === 'settlement') {
        // Pembayaran berhasil! Lakukan aksi bisnis (misal aktivasi status premium user)
      }

      return new Response(JSON.stringify({ status: 'OK' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err) {
      logger.error({ err }, '[Webhook] Gagal memproses callback pembayaran');
      return new Response('Bad Request', { status: 400 });
    }
  },
};

export default paymentCallback;
```

---

## 🔒 Keamanan & Praktik Terbaik

1. **Gunakan Secret Token / Signature**:
   Selalu verifikasi header otentikasi (misal `req.headers.get('x-webhook-secret')`) pada webhook publik untuk mencegah request palsu.
2. **Hindari Long-Running Task di Webhook Handler**:
   Segera kembalikan status HTTP `200 OK` ke pengirim webhook, lalu jalankan proses berat secara asinkron di latar belakang.
