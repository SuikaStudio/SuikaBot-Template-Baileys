# Kamus Objek Pesan `m` (`SerializedMessage`)

Dokumen ini adalah referensi lengkap untuk objek **`m`** (`SerializedMessage`) dan **`m.quoted`** (`QuotedMessage`) yang Anda gunakan di dalam fungsi `exec(m, ctx)` pada setiap plugin SuikaBot.

---

## 📑 Daftar Isi
1. [Identitas & Informasi Pengirim](#1-identitas--informasi-pengirim)
2. [Teks, Perintah, & Argumen](#2-teks-perintah--argumen)
3. [Konteks Chat & Hak Akses Grup](#3-konteks-chat--hak-akses-grup)
4. [Media & Unduhan](#4-media--unduhan)
5. [Pesan yang Dibalas (`m.quoted`)](#5-pesan-yang-dibalas-mquoted)
6. [Aksi Interaktif Pesan (`Action Helpers`)](#6-aksi-interaktif-pesan-action-helpers)

---

## 1. Identitas & Informasi Pengirim

| Properti | Tipe | Deskripsi | Contoh Nilai |
| :--- | :--- | :--- | :--- |
| `m.chatJid` | `string` | JID percakapan saat ini (Grup `@g.us` atau DM `@s.whatsapp.net`). | `'120363041234567890@g.us'` |
| `m.senderJid` | `string` | JID nomor telepon pengirim asli (Sudah dinormalisasi). | `'628123456789@s.whatsapp.net'` |
| `m.senderLid` | `string \| null` | JID format LID pengirim jika dikirim via grup WhatsApp v7. | `'176475928023171@lid'` |
| `m.senderName` | `string` | Nama pushname pengirim atau nomor telepon jika nama kosong. | `'John Doe'` atau `'628123456789'` |
| `m.messageId` | `string` | ID unik pesan dari WhatsApp. | `'3EB01234567890ABCDEF'` |
| `m.timestamp` | `number` | Waktu pesan dikirim dalam detik (*Unix timestamp*). | `1773661200` |
| `m.fromBot` | `boolean` | `true` jika pesan ini dikirim oleh akun bot sendiri. | `false` |
| `m.key` | `proto.IMessageKey` | Objek kunci pesan mentah dari Baileys. | `{ remoteJid, fromMe, id }` |
| `m.raw` | `WAMessage` | Objek pesan mentah Baileys seutuhnya. | `{ key, message, ... }` |

---

## 2. Teks, Perintah, & Argumen

Contoh pesan masuk dari pengguna:  
`!tiktok https://vt.tiktok.com/ZS123/ --hd --silent`

| Properti | Tipe | Hasil dari Contoh di Atas | Deskripsi |
| :--- | :--- | :--- | :--- |
| `m.body` | `string` | `'!tiktok https://vt.tiktok.com/ZS123/ --hd --silent'` | Teks pesan mentah seutuhnya. |
| `m.prefix` | `string` | `'!'` | Simbol prefix yang digunakan. |
| `m.command` | `string` | `'tiktok'` | Nama perintah yang dipanggil (selalu lowercase). |
| `m.args` | `string[]` | `['https://vt.tiktok.com/ZS123/', '--hd', '--silent']` | Seluruh kata setelah nama perintah dipecah spasi. |
| `m.text` | `string` | `'https://vt.tiktok.com/ZS123/ --hd --silent'` | Seluruh teks setelah nama command. |
| `m.query` | `string` | `'https://vt.tiktok.com/ZS123/ --hd --silent'` | Sama seperti `m.text`, tetapi sudah di-`.trim()`. |
| `m.split(delim)` | `(delim?) => string[]` | `m.split('\|')` | Helper memecah teks dengan pemisah kustom. |

---

## 3. Konteks Chat & Hak Akses Grup

| Properti | Tipe | Deskripsi |
| :--- | :--- | :--- |
| `m.isGroup` | `boolean` | `true` jika pesan berada di dalam Grup WhatsApp. |
| `m.isAdmin` | `boolean` | `true` jika pengirim pesan adalah **Admin di grup** tersebut. |
| `m.isBotAdmin` | `boolean` | `true` jika bot adalah **Admin di grup** tersebut. |
| `m.mentionedJids` | `string[]` | Daftar JID nomor yang di-tag / di-mention di pesan (`@user`). |

---

## 4. Media & Unduhan

| Properti | Tipe | Deskripsi |
| :--- | :--- | :--- |
| `m.isMedia` | `boolean` | `true` jika pesan ini melampirkan media (gambar/video/audio/stiker/dokumen/video note ptv). |
| `m.mediaType` | `string \| null` | Tipe media pesan, misal `'imageMessage'`, `'videoMessage'`, `'documentMessage'`, `'ptvMessage'`, dll. |
| `m.mimetype` | `string \| null` | MIME type file (misal `'image/png'`, `'application/pdf'`, `'audio/ogg; codecs=opus'`). |
| `m.fileName` | `string \| null` | Nama file dokumen asli (misal `'document.pdf'`, `'setup.exe'`). |
| `m.downloadMedia()` | `() => Promise<Buffer>` | Mengunduh media pesan ini menjadi `Buffer` biner di memori (dengan auto-recovery 404 URL via `reuploadRequest`). |

### Contoh Penggunaan Unduh Media:
```typescript
if (m.isMedia && m.mediaType === 'imageMessage') {
  const buffer = await m.downloadMedia();
  // Lakukan proses gambar (misal dibuat stiker)
}
```

---

## 5. Pesan yang Dibalas (`m.quoted`)

Jika pengguna membalas / me-*reply* pesan lain saat mengetik perintah, objek `m.quoted` akan terisi otomatis:

| Properti `m.quoted` | Tipe | Deskripsi |
| :--- | :--- | :--- |
| `m.quoted.senderJid` | `string` | JID nomor pengirim pesan yang di-reply. |
| `m.quoted.senderLid` | `string \| null` | JID LID pengirim pesan yang di-reply jika ada. |
| `m.quoted.isMedia` | `boolean` | `true` jika pesan yang di-reply adalah media. |
| `m.quoted.mediaType` | `string \| null` | Tipe media dari pesan yang di-reply (termasuk `'ptvMessage'`). |
| `m.quoted.mimetype` | `string \| null` | MIME type media dari pesan yang di-reply. |
| `m.quoted.fileName` | `string \| null` | Nama file dokumen dari pesan yang di-reply. |
| `m.quoted.react(emoji)` | `(emoji) => Promise` | Memberikan reaksi emoji ke pesan yang di-reply. |
| `m.quoted.delete()` | `() => Promise` | Menghapus pesan yang di-reply (jika bot admin/pesan dari bot). |
| `m.quoted.downloadMedia()` | `() => Promise<Buffer>` | Mengunduh media dari pesan yang di-reply. |

### Contoh Memproses Pesan Reply:
```typescript
// Contoh perintah membuat stiker dari gambar yang di-reply
if (m.quoted && m.quoted.isMedia) {
  const imageBuffer = await m.quoted.downloadMedia();
  await m.replyMedia('sticker', imageBuffer);
}
```

---

## 6. Aksi Interaktif Pesan (`Action Helpers`)

### A. Membalas Pesan (`m.reply`)
Secara default otomatis men-tag / me-reply pesan pengguna:
```typescript
// Kirim balasan teks biasa
await m.reply('Halo, pesanan Anda sedang diproses!');

// Kirim dengan opsi Baileys tambahan
await m.reply({ text: 'Pesan dengan mention', mentions: [m.senderJid] });
```

### B. Reaksi Emoji (`m.react`)
Memberikan reaksi emoji langsung ke pesan user:
```typescript
await m.react('⏳'); // Menandakan sedang loading
await m.react('✅'); // Menandakan sukses
await m.react('❌'); // Menandakan gagal
```

### C. Indikator Mengetik & Merekam
Menampilkan status *"sedang mengetik..."* atau *"sedang merekam audio..."* di atas chat WhatsApp:
```typescript
await m.showTyping();    // Tampilkan "typing..."
await m.showRecording(); // Tampilkan "recording audio..."
```

### D. Mengirim Media Balasan (`m.replyMedia`)
Mengirim gambar, audio, video, stiker, dokumen, voice note (PTT), atau video note (PTV):
```typescript
// Kirim gambar dari Buffer atau URL
await m.replyMedia('image', imageBuffer, 'Ini caption gambarnya');

// Kirim stiker
await m.replyMedia('sticker', stickerBuffer);

// Kirim audio biasa
await m.replyMedia('audio', audioBuffer);

// Kirim Voice Note WhatsApp (PTT) dengan gelombang suara hijau (Kompatibel iOS & Android)
await m.replyMedia('audio', audioBuffer, undefined, { ptt: true });

// Kirim Video Note WhatsApp bulat (PTV)
await m.replyMedia('ptv', videoBuffer);
```

### E. Menghapus & Mengedit Pesan
```typescript
// Hapus pesan pengguna (butuh bot jadi admin grup)
await m.delete();

// Edit pesan yang pernah dikirim oleh bot
const sent = await m.reply('Loading data...');
if (sent?.key) {
  await m.edit(sent.key, 'Data berhasil dimuat! 🎉');
}
```
