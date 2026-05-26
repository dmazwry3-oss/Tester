# Scribd Downloader

Web Scribd downloader sederhana, ringan, dan siap deploy ke **Netlify**.
UI terinspirasi dari `scribd.vdownloaders.com` dengan tampilan yang lebih modern.

> Tool ini hanya menyediakan akses ke dokumen yang dapat diakses publik di
> Scribd. Patuhi hak cipta pemilik konten dan Terms of Service Scribd.

## Fitur

- Validasi URL Scribd di sisi client maupun server
- Mendukung path `/document/`, `/doc/`, dan `/presentation/`
- Backend serverless via **Netlify Functions** (Node 18+)
- Endpoint cantik `/api/download` lewat redirect Netlify
- Header keamanan default (X-Frame-Options, nosniff, dsb.)
- Responsif (mobile friendly), tidak butuh framework / build step

## Struktur Project

```
.
├── index.html                       # Halaman utama
├── styles.css                       # Styling
├── script.js                        # Logic frontend (fetch ke /api/download)
├── netlify/
│   └── functions/
│       └── download.js              # Serverless function (Node)
├── netlify.toml                     # Konfigurasi Netlify (redirect, headers)
├── package.json
└── .gitignore
```

## Cara Kerja

1. User memasukkan URL dokumen Scribd di form.
2. Frontend mem-`POST` URL tersebut ke `/api/download`
   (di-rewrite ke `/.netlify/functions/download`).
3. Function memvalidasi URL, mengekstrak `docId` dan `slug`, lalu membangun
   URL viewer ilide.info — backend yang umum dipakai layanan downloader Scribd.
4. Frontend menampilkan tombol "Open Download Page" yang membuka viewer
   tersebut di tab baru, di mana user dapat menyimpan dokumennya.

## Endpoint

`POST /api/download`

Request body:
```json
{ "url": "https://www.scribd.com/document/123456/Example-Doc" }
```

Response sukses:
```json
{
  "success": true,
  "title": "Example Doc",
  "message": "Dokumen siap. Klik tombol untuk membuka viewer dan menyimpan file.",
  "sourceUrl": "https://www.scribd.com/document/123456/Example-Doc",
  "downloadUrl": "https://ilide.info/doc-viewer-v2?url=...",
  "docId": "123456",
  "kind": "document"
}
```

Response error (contoh):
```json
{ "success": false, "error": "URL harus berasal dari domain scribd.com." }
```

## Development Lokal

Butuh Node.js 18+ dan Netlify CLI.

```bash
npm install -g netlify-cli
netlify dev
```

Netlify Dev akan menjalankan static site + functions di `http://localhost:8888`.
Anda juga bisa membuka `index.html` langsung di browser, tapi endpoint
`/api/download` hanya tersedia lewat `netlify dev` atau setelah di-deploy.

## Deploy ke Netlify

### Opsi 1 — Lewat dashboard (paling cepat)

1. Push repo ini ke GitHub / GitLab / Bitbucket.
2. Login ke <https://app.netlify.com>, klik **Add new site → Import an
   existing project**.
3. Pilih repository ini.
4. Build settings akan diambil dari `netlify.toml` (publish: `.`, functions:
   `netlify/functions`). Tidak perlu mengubah apapun.
5. Klik **Deploy site**. Selesai.

### Opsi 2 — Lewat Netlify CLI

```bash
npm install -g netlify-cli
netlify login
netlify init           # ikuti wizard, pilih "Create & configure a new site"
netlify deploy --prod  # deploy versi production
```

### Opsi 3 — Drag & Drop

Zip seluruh folder lalu drop di <https://app.netlify.com/drop>.
Functions tetap akan terdeteksi karena ada folder `netlify/functions`.

## Catatan

- Function ini **tidak** mem-bypass paywall Scribd. URL yang dihasilkan
  hanya membuka document viewer publik (ilide.info) yang juga digunakan
  oleh layanan downloader Scribd lainnya.
- Jika ilide.info berubah pola URL atau down, edit fungsi
  `buildDownloadUrl()` di `netlify/functions/download.js`.
- Ingin self-host backend sendiri? Anda bisa mengganti `buildDownloadUrl()`
  dengan implementasi yang fetch isi dokumen langsung dari Scribd dan
  meng-upload PDF ke storage. Itu di luar lingkup project ini.

## Lisensi

MIT
