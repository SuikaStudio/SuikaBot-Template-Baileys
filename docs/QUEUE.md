# ?? Panduan & Cara Kerja Message Queue Engine (GCRA Ingress Pacer)

Dokumen ini menjelaskan secara mendalam tentang arsitektur, algoritma, dan cara kerja **`MessageQueueService`** di dalam **SuikaBot Starter**.

---

## 1. Filosofi & Latar Belakang Desain

WhatsApp menerapkan sistem AI Anti-Spam yang sangat ketat. Salah satu penyebab utama nomor bot diblokir (*banned*) adalah **"Burst Messaging"** — yaitu ketika bot mengirim beberapa pesan balasan secara beruntun dalam milidetik yang sama.

Untuk mengatasi ini, SuikaBot Starter menerapkan **Keyed GCRA Ingress Pacer (Non-Blocking)**:
1. **1 Kasir per 1 Chat**: Setiap obrolan (Grup atau DM) memiliki timeline antreannya sendiri.
2. **Human Jitter Simulation**: Setiap pesan di chat yang sama diberi jeda waktu natural pengetikan manusia (default: 500ms – 1500ms).
3. **Zero Head-of-Line Blocking**: Perintah berat (seperti AI 15 detik) tidak akan pernah memblokir perintah ringan (`.ping`) di grup yang sama.
4. **In-Memory & Anti-Spam Basi**: Pesan chat bersifat *transient*. Jika bot mati, bot tidak akan membabi-buta mengirim tumpukan pesan lama saat baru online (*thunderclap spam*).

---

## 2. Diagram Alur & Arsitektur

```
                       Pesan Masuk (messages.upsert)
                                    ¦
                                    ?
                +---------------------------------------+
                ¦   MessageQueueService.enqueue(msg)    ¦
                ¦   - Validasi chatJid & messageId      ¦
                ¦   - Auto-Prune chat idle > 60s        ¦
                +---------------------------------------+
                                    ¦
        +-------------------------------------------------------+
        ?                                                       ?
+-------------------------------+               +-------------------------------+
¦     Chat A (Grup Diskusi)     ¦               ¦     Chat B (Private DM)       ¦
¦                               ¦               ¦                               ¦
¦ 1. Ambil lastScheduled Chat A ¦               ¦ 1. Ambil lastScheduled Chat B ¦
¦ 2. Hitung GCRA TAT:           ¦               ¦ 2. Hitung GCRA TAT:           ¦
¦    nextTime = max(now, last)  ¦               ¦    nextTime = max(now, last)  ¦
¦               + randomDelay   ¦               ¦               + randomDelay   ¦
¦ 3. sleep(nextTime - now)      ¦               ¦ 3. sleep(nextTime - now)      ¦
¦ 4. NON-BLOCKING ASYNC DISPATCH¦               ¦ 4. NON-BLOCKING ASYNC DISPATCH¦
¦    void queueProcessor(msg)   ¦               ¦    void queueProcessor(msg)   ¦
+-------------------------------+               +-------------------------------+
```

---

## 3. Algoritma GCRA (*Generic Cell Rate Algorithm*)

GCRA adalah algoritma standar industri (digunakan oleh Discord, Stripe, dan Cloudflare) untuk *traffic shaping*. 

Alih-alih membuat array antrean `messages[]` yang memakan memori, GCRA bekerja dengan menghitung **Theoretical Arrival Time (TAT)** di masa depan:

$$\text{nextScheduledTime} = \max(\text{now}, \text{lastScheduled}) + \text{random}(\text{minDelayMs}, \text{maxDelayMs})$$

### Keuntungan Formula Ini:
- **Otomatis Mengantre**: Jika 3 pesan masuk di detik yang sama, pesan 1 dijadwalkan di `+800ms`, pesan 2 di `+1600ms`, dan pesan 3 di `+2400ms`.
- **Otomatis Reset**: Jika grup sudah sepi selama 5 menit, pesan berikutnya langsung dijadwalkan dari waktu sekarang (`now + delay`).

---

## 4. Solusi Masalah Head-of-Line (HoL) Blocking

### ? Masalah pada Queue Tradisional (Blocking):
Jika User A meminta `.ai bikin cerpen` (butuh 15 detik), antrean kasir berhenti selama 15 detik. User B yang mengetik `.ping` terpaksa ikut menunggu 15 detik.

### ?? Solusi SuikaBot (Non-Blocking Handoff):
Pacer **hanya bertugas menahan jeda pengetikan awal**, lalu **langsung melepaskan eksekusi ke background runtime**:

```typescript
// 1. Tunggu jeda natural pengetikan
await sleep(waitDuration);

// 2. DISPATCH NON-BLOCKING (TIDAK di-await):
if (this.queueProcessor) {
  this.queueProcessor(message).catch((err) => {
    logger.error({ err }, '[MessageQueueService] Handler error');
  });
}

// 3. Pacer LANGSUNG siap memproses pesan berikutnya di grup tersebut!
```

**Simulasi di Lapangan:**
- `0.8s`: Pesan 1 (`.ai`) mulai diproses di background (butuh 15s).
- `1.6s`: Pesan 2 (`.ping`) mulai diproses di background (butuh 0.05s).
- `1.65s`: ?? **Balasan `.ping` langsung terkirim!**
- `15.8s`: ?? **Balasan `.ai` terkirim setelah selesai diproses.**

---

## 5. Fitur Keamanan & Manajemen Memori

### A. Revocation (Pembatalan Pesan Terhapus)
Jika pengirim menghapus/menarik pesan (*Delete for Everyone*) sebelum waktu jeda pengetikan selesai, Baileys akan memancarkan event `messages.update`:
- `MessageQueueService.revoke(chatJid, messageId)` akan menandai pesan tersebut.
- Begitu waktu jeda selesai, Pacer mendeteksi status revoked dan **membatalkan eksekusi secara bersih**.

### B. Auto-Pruning Memory
Untuk mencegah kebocoran memori RAM (*memory leak*) ketika bot sudah bergabung di ribuan grup:
- Pacer secara berkala membersihkan entri chat yang sudah tidak aktif lebih dari 60 detik dari `Map`.

### C. Graceful Shutdown
Ketika bot dimatikan (`SIGINT` / `SIGTERM`):
- `MessageQueueService.shutdown()` mematikan semua timer aktif dan mengosongkan state memory secara aman.

---

## 6. Konfigurasi (`.env` / `src/config.ts`)

Anda dapat mengatur jeda waktu pacing melalui variabel *environment*:

```env
# Jeda minimum antar pesan di chat yang sama (milidetik)
RATE_LIMIT_MIN_DELAY_MS=500

# Jeda maksimum antar pesan di chat yang sama (milidetik)
RATE_LIMIT_MAX_DELAY_MS=1500
```
