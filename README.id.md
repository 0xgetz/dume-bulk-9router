<p align="center">
  <img src="brand/logo.svg" alt="dume-bulk-9router" width="420"/>
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="README.id.md">Bahasa Indonesia</a> ·
  <a href="README.zh.md">中文</a> ·
  <a href="README.ja.md">日本語</a> ·
  <a href="README.es.md">Español</a>
</p>

<p align="center">
  <img alt="node" src="https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js&logoColor=white">
  <img alt="dependencies" src="https://img.shields.io/badge/dependencies-0-success">
  <img alt="license" src="https://img.shields.io/badge/license-MIT-blue">
  <img alt="9router" src="https://img.shields.io/badge/integrates-9router-8b5cf6">
  <img alt="status" src="https://img.shields.io/badge/E2E-verified-22c55e">
</p>

# dume-bulk-9router

Membuat akun [Dume.ai](https://app.dume.ai) secara massal, mengambil token auth +
cookie sesi tiap akun secara otomatis, lalu menyajikannya ke
[9Router](https://9router.com) sebagai satu pool kompatibel-OpenAI dengan
round-robin dan failover otomatis. **Tanpa dependensi npm** (Node ≥ 18).

> Pendaftaran Dume dilindungi Cloudflare Turnstile, jadi pembuat akun menjalankan
> Chromium sungguhan (diluncurkan lokal secara default) untuk melewati tantangan,
> lalu memakai REST API Dume untuk sisanya.

---

## Fitur

- **Pendaftaran massal** lewat UI Dume (`app.dume.ai/signup`) memakai mailbox
  [mail.tm](https://mail.tm) untuk kode 6-digit.
- **Harvest token + cookie otomatis** — JWT dibaca dari `localStorage`, seluruh
  cookie diambil via CDP.
- **Adapter pool kompatibel-OpenAI** — `/v1/chat/completions` (stream & non-stream)
  dan `/v1/models`, dengan round-robin + failover antar akun.
- **Integrasi 9Router satu perintah** — mendaftarkan provider node dan provider,
  model muncul dengan prefix seperti `dume/Kimi-K3`.
- **Chromium sendiri, tanpa lock-in** — meluncurkan instance headless sendiri,
  atau menempel ke browser apa pun lewat `CDP_URL`.
- **Tanpa npm install** — hanya stdlib Node.

## Model yang berfungsi (paket Free)

Dari 81 model yang diiklankan Dume, **9 berfungsi di akun Free** (semua diuji
end-to-end lewat 9Router):

| Model via 9Router            | ID model upstream (Dume)             | Provider   | Catatan           |
|------------------------------|--------------------------------------|------------|-------------------|
| `dume/Kimi-K3`               | `dume/moonshotai/Kimi-K3`            | moonshotai | tercepat (~3.4 s) |
| `dume/MiniMax-M3`            | `dume/MiniMaxAI/MiniMax-M3`          | MiniMaxAI  | ~8 s              |
| `dume/Qwen3.5-9B`            | `dume/Qwen/Qwen3.5-9B`               | Qwen       | ~6 s              |
| `dume/Ternary-Bonsai-27B`    | `dume/Prism-ML/Ternary-Bonsai-27B`   | Prism-ML   | default Dume      |
| `dume/gpt-5-nano`            | `openai/gpt-5-nano`                  | openai     | ~6 s              |
| `dume/gpt-5-nano-flex`       | `openai/gpt-5-nano-flex`             | openai     | ~6 s              |
| `dume/gpt-5.6-luna`          | `openai/gpt-5.6-luna`                | openai     | ~3 s              |
| `dume/gpt-5.6-luna-fast`     | `openai/gpt-5.6-luna-fast`           | openai     | ~3 s              |
| `dume/gpt-5.6-luna-pro`      | `openai/gpt-5.6-luna-pro`            | openai     | ~5.6 s            |

### Diblokir di paket Free (72 model)

- **68 model `openai/*`** — keluarga GPT‑5.x, GPT‑6.x, Astra / Luna / Sol /
  Terra, o3 / o3‑pro, GPT‑4o / 4.1, Codex, serta varian image/embedding —
  mengembalikan `Forbidden: AI model not allowed for your plan`.
- **4 model berat `dume/*`** — `dume/deepseek-ai/DeepSeek-V4-Pro`,
  `dume/openai/gpt-oss-20b`, `dume/MiniMaxAI/MiniMax-M2.7`,
  `dume/Qwen/Qwen3.5-397B-A17B` — mengembalikan
  `Unable to access non-serverless model` (butuh endpoint Together AI khusus).

Daftar lengkapnya juga tersedia di [`working_models.json`](working_models.json).

## Persyaratan

- Node.js **18+**
- Biner Chromium/Chrome (auto-deteksi, atau set `CHROME_PATH`)
- Jalur jaringan yang diterima Dume (IP datacenter biasanya ditolak — pakai
  koneksi residensial, proxy sendiri, atau browser yang sudah login via `CDP_URL`)

## Mulai cepat

```bash
git clone https://github.com/0xgetz/dume-bulk-9router
cd dume-bulk-9router
node src/cli.js create --count 3 --out accounts.json   # buat akun
bash run-adapter.sh                                     # adapter :8790
ROUTER_PASSWORD=123456 node src/connect-9router.js      # daftarkan ke 9Router
```

## Konfigurasi

| Variabel | Default | Fungsi |
|----------|---------|--------|
| `CHROME_PATH` | auto | Biner Chromium/Chrome |
| `CDP_URL` | — | Menempel ke browser yang sudah ada |
| `HEADLESS` | `1` | `0` = browser terlihat |
| `DUME_ROUTING` | `round-robin` | `round-robin` atau `random` |
| `ROUTER_URL` | `http://127.0.0.1:20128` | URL 9Router |
| `ROUTER_PASSWORD` | `123456` | Sandi admin 9Router |

## CLI

```
node src/cli.js create  --count N [--out accounts.json]
node src/cli.js connect
node src/cli.js models | chat <model> "<text>" | pool | serve
```

Lihat [`docs/PROTOCOL.md`](docs/PROTOCOL.md) untuk API Dume dan
[`STRUCTURE.md`](STRUCTURE.md) untuk struktur proyek.

## Legal

Untuk riset edukasi dan interoperabilitas. Otomasi pembuatan akun dapat melanggar
Ketentuan Layanan. Tanggung jawab penggunaan ada pada Anda. Lisensi
[MIT](LICENSE).
