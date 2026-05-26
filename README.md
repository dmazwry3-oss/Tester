# Dmaz Tester

Multi-mirror Scribd downloader, deploy-ready ke **Netlify**. Daripada
mengandalkan satu backend yang bisa kena Cloudflare/captcha kapan saja,
Dmaz Tester membangun beberapa link mirror sekaligus dari URL yang sama,
jadi kalau satu kena gating, tinggal pindah ke mirror lain — tanpa input
ulang.

> Tool ini hanya menyediakan akses ke dokumen yang dapat diakses publik di
> Scribd. Patuhi hak cipta pemilik konten dan Terms of Service Scribd.

## Highlights

- **6 mirror downloader** dalam satu klik (VPDFS, DLScrib, DocDownloader,
  Scrdownloader, VDownloaders, ilide.info)
- **Subdomain locale** (`id.scribd.com`, `de.scribd.com`, dst.) otomatis
  dinormalisasi
- **Paste dari clipboard**, **copy link per mirror**, **Open all in tabs**
- **Riwayat 5 dokumen terakhir** (localStorage, tidak dikirim ke server)
- **Toast notifications**, animasi halus, mendukung `prefers-reduced-motion`
- Backend serverless via **Netlify Functions** (Node 18+)
- Tidak butuh framework / build step — vanilla HTML/CSS/JS

## Kontak

- WhatsApp: [+62 896-0365-9756](https://wa.me/6289603659756)
- Instagram: [@dmsmaul05](https://instagram.com/dmsmaul05)

## Struktur Project

```
.
├── index.html                       # Halaman utama
├── styles.css                       # Design system (dark-first)
├── script.js                        # Frontend logic
├── netlify/
│   └── functions/
│       └── download.js              # Serverless function (validasi + mirror builder)
├── netlify.toml                     # Konfigurasi Netlify (redirect, headers)
├── package.json
└── .gitignore
```

## Cara Kerja

1. User memasukkan URL dokumen Scribd di form.
2. Frontend mem-`POST` URL ke `/api/download` (di-rewrite ke
   `/.netlify/functions/download`).
3. Function memvalidasi URL, mengekstrak `docId` dan `slug`, normalisasi
   subdomain locale, lalu membangun **6 mirror URL** dari pola yang sudah
   dikenal masing-masing layanan.
4. Frontend merender daftar mirror dengan label *Recommended* di atas, dan
   menyediakan tombol copy & open-all.

## Endpoint

`POST /api/download`

Request:
```json
{ "url": "https://www.scribd.com/document/123456/Example-Doc" }
```

Response sukses:
```json
{
  "success": true,
  "title": "Example Doc",
  "message": "Pilih salah satu mirror di bawah...",
  "sourceUrl": "https://www.scribd.com/document/123456/Example-Doc",
  "docId": "123456",
  "kind": "document",
  "mirrors": [
    {
      "id": "vpdfs",
      "name": "VPDFS",
      "url": "https://scribd.vpdfs.com/document/123456/Example-Doc",
      "note": "Direct domain swap. Biasanya paling ringan dari sisi captcha.",
      "recommended": true
    }
  ],
  "downloadUrl": "https://scribd.vpdfs.com/document/123456/Example-Doc"
}
```

Response error:
```json
{ "success": false, "error": "URL harus berasal dari domain scribd.com." }
```

## Development Lokal

Butuh Node.js 18+ dan Netlify CLI.

```bash
npm install -g netlify-cli
netlify dev
```

Netlify Dev akan menjalankan static site + functions di
`http://localhost:8888`.

## Deploy ke Netlify

### Lewat dashboard

1. Push repo ini ke GitHub / GitLab / Bitbucket.
2. Login ke <https://app.netlify.com>, klik **Add new site → Import an
   existing project**.
3. Pilih repository ini.
4. Build settings akan diambil dari `netlify.toml`. Tidak perlu mengubah
   apapun.
5. Klik **Deploy site**. Selesai.

### Lewat Netlify CLI

```bash
npm install -g netlify-cli
netlify login
netlify init
netlify deploy --prod
```

## Catatan Teknis

- Function ini **tidak** mem-bypass paywall Scribd. URL yang dihasilkan
  hanya membuka document viewer yang sudah dipakai layanan downloader
  pihak ketiga.
- Kalau salah satu mirror berubah pola URL atau down, edit fungsi
  `buildMirrors()` di `netlify/functions/download.js`.
- Frontend cuma render apapun yang server kirim, jadi nambah/nguranggin
  mirror cukup di backend.

## Lisensi

MIT
