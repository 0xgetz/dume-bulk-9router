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

[Dume.ai](https://app.dume.ai) のアカウントを一括作成し、各アカウントの auth token と
セッション cookie を自動取得して、[9Router](https://9router.com) に
OpenAI 互換のプールとして提供します。ラウンドロビンと自動フェイルオーバー付き。
**npm 依存ゼロ**（Node ≥ 18）。

> Dume の登録は Cloudflare Turnstile で保護されているため、作成ツールは実際の
> Chromium（既定ではローカル起動）を操作してチャレンジを突破し、以降は Dume の
> REST API を直接利用します。

---

## 特徴

- **一括登録** — Dume 公式 UI（`app.dume.ai/signup`）を操作し、6 桁コードは
  [mail.tm](https://mail.tm) のメールボックスで受信。
- **token + cookie の自動取得** — JWT を `localStorage` から読み、cookie は CDP 経由で収集。
- **OpenAI 互換プールアダプタ** — `/v1/chat/completions`（ストリーム/非ストリーム）と
  `/v1/models`、複数アカウントのラウンドロビン + フェイルオーバー。
- **9Router へワンコマンド接続** — provider node と provider を登録し、
  `dume/Kimi-K3` のようなプレフィックスで利用可能。
- **自前の Chromium、ロックインなし** — 自身で headless を起動、または `CDP_URL` で
  既存ブラウザに接続。
- **npm install 不要** — Node 標準ライブラリのみ。

## 利用可能なモデル（無料プラン）

Dume は 81 のチャットモデルを宣伝していますが、**無料アカウントで応答するのは 9 件**です
（すべて 9Router 経由で E2E 検証済み）。

| 9Router でのモデル           | 上流モデル ID（Dume）                | プロバイダ | 備考               |
|------------------------------|--------------------------------------|------------|--------------------|
| `dume/Kimi-K3`               | `dume/moonshotai/Kimi-K3`            | moonshotai | 最速（~3.4 秒）    |
| `dume/MiniMax-M3`            | `dume/MiniMaxAI/MiniMax-M3`          | MiniMaxAI  | ~8 秒              |
| `dume/Qwen3.5-9B`            | `dume/Qwen/Qwen3.5-9B`               | Qwen       | ~6 秒              |
| `dume/Ternary-Bonsai-27B`    | `dume/Prism-ML/Ternary-Bonsai-27B`   | Prism-ML   | Dume の既定モデル  |
| `dume/gpt-5-nano`            | `openai/gpt-5-nano`                  | openai     | ~6 秒              |
| `dume/gpt-5-nano-flex`       | `openai/gpt-5-nano-flex`             | openai     | ~6 秒              |
| `dume/gpt-5.6-luna`          | `openai/gpt-5.6-luna`                | openai     | ~3 秒              |
| `dume/gpt-5.6-luna-fast`     | `openai/gpt-5.6-luna-fast`           | openai     | ~3 秒              |
| `dume/gpt-5.6-luna-pro`      | `openai/gpt-5.6-luna-pro`            | openai     | ~5.6 秒            |

### 無料プランでブロックされるモデル（72 件）

- **68 件の `openai/*`** — GPT‑5.x / GPT‑6.x、Astra / Luna / Sol / Terra、
  o3 / o3‑pro、GPT‑4o / 4.1 系、Codex、画像・埋め込み系 — は
  `Forbidden: AI model not allowed for your plan` を返します。
- **4 件の重量級 `dume/*`** — `dume/deepseek-ai/DeepSeek-V4-Pro`、
  `dume/openai/gpt-oss-20b`、`dume/MiniMaxAI/MiniMax-M2.7`、
  `dume/Qwen/Qwen3.5-397B-A17B` — は
  `Unable to access non-serverless model` を返します（Together AI の専用エンドポイントが必要）。

利用可能な一覧は [`working_models.json`](working_models.json) にもあります。

## 動作要件

- Node.js **18+**
- Chromium/Chrome バイナリ（自動検出、または `CHROME_PATH` を設定）
- Dume が許可する回線（データセンター IP は大半拒否 — 住宅回線、自前プロキシ、
  または `CDP_URL` で既存ブラウザを利用）

## クイックスタート

```bash
git clone https://github.com/0xgetz/dume-bulk-9router
cd dume-bulk-9router
node src/cli.js create --count 3 --out accounts.json   # アカウント作成
bash run-adapter.sh                                     # アダプタ :8790
ROUTER_PASSWORD=123456 node src/connect-9router.js      # 9Router に登録
```

## 設定

| 変数 | 既定値 | 用途 |
|------|--------|------|
| `CHROME_PATH` | 自動 | Chromium/Chrome バイナリ |
| `CDP_URL` | — | 既存ブラウザへ接続 |
| `HEADLESS` | `1` | `0` で画面表示 |
| `DUME_ROUTING` | `round-robin` | `round-robin` または `random` |
| `ROUTER_URL` | `http://127.0.0.1:20128` | 9Router の URL |
| `ROUTER_PASSWORD` | `123456` | 9Router 管理パスワード |

## CLI

```
node src/cli.js create  --count N [--out accounts.json]
node src/cli.js connect
node src/cli.js models | chat <model> "<text>" | pool | serve
```

Dume API は [`docs/PROTOCOL.md`](docs/PROTOCOL.md)、構成は
[`STRUCTURE.md`](STRUCTURE.md) を参照。

## ライセンス / 注意

教育および相互運用研究用です。アカウントの自動生成は利用規約に違反する可能性があり、
利用は自己責任で行ってください。[MIT](LICENSE)。
