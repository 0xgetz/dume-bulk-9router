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
  <img alt="platform" src="https://img.shields.io/badge/platform-linux%20%7C%20macOS%20%7C%20windows-lightgrey">
  <img alt="9router" src="https://img.shields.io/badge/integrates-9router-8b5cf6">
  <img alt="status" src="https://img.shields.io/badge/E2E-verified-22c55e">
</p>

# dume-bulk-9router

Bulk-create [Dume.ai](https://app.dume.ai) accounts, automatically harvest each
account's auth token + session cookies, and serve them to
[9Router](https://9router.com) as a single OpenAI-compatible pool with
round-robin balancing and automatic failover. **Zero npm dependencies** (Node ≥ 18).

> Dume's signup is protected by Cloudflare Turnstile, so the creator drives a real
> Chromium (launched locally by default) to pass the challenge, then talks to
> Dume's REST API directly for everything else.

---

## Features

- **Bulk signup** through the hosted Dume UI (`app.dume.ai/signup`) using
  pluggable [mail.tm](https://mail.tm) mailboxes for the 6-digit email code.
- **Automatic token + cookie harvest** — reads the encrypted JWT straight out of
  `localStorage` and pulls the full cookie jar over CDP.
- **OpenAI-compatible pool adapter** — `/v1/chat/completions` (stream + non-stream)
  and `/v1/models`, with round-robin routing and failover across accounts.
- **One-command 9Router wiring** — registers a provider node and provider so the
  models appear under a prefix such as `dume/Kimi-K3`.
- **Own Chromium, no lock-in** — launches its own headless instance, or attaches
  to any browser you already run with `--remote-debugging-port` (`CDP_URL`).
- **No npm install** — pure Node standard library.

## Working models (Free plan)

Of the 81 chat models Dume advertises, **9 respond on a Free account**. All nine
were tested end to end through 9Router (`PONG` round-trips):

| Model via 9Router            | Upstream model ID (Dume)             | Provider   | Notes             |
|------------------------------|--------------------------------------|------------|-------------------|
| `dume/Kimi-K3`               | `dume/moonshotai/Kimi-K3`            | moonshotai | fastest (~3.4 s)  |
| `dume/MiniMax-M3`            | `dume/MiniMaxAI/MiniMax-M3`          | MiniMaxAI  | ~8 s              |
| `dume/Qwen3.5-9B`            | `dume/Qwen/Qwen3.5-9B`               | Qwen       | ~6 s              |
| `dume/Ternary-Bonsai-27B`    | `dume/Prism-ML/Ternary-Bonsai-27B`   | Prism-ML   | Dume default      |
| `dume/gpt-5-nano`            | `openai/gpt-5-nano`                  | openai     | ~6 s              |
| `dume/gpt-5-nano-flex`       | `openai/gpt-5-nano-flex`             | openai     | ~6 s              |
| `dume/gpt-5.6-luna`          | `openai/gpt-5.6-luna`                | openai     | ~3 s              |
| `dume/gpt-5.6-luna-fast`     | `openai/gpt-5.6-luna-fast`           | openai     | ~3 s              |
| `dume/gpt-5.6-luna-pro`      | `openai/gpt-5.6-luna-pro`            | openai     | ~5.6 s            |

### Blocked on the Free plan (72 models)

- **68 `openai/*` models** — GPT‑5.x, GPT‑6.x, GPT‑6 Astra / Luna / Sol / Terra,
  o3 / o3‑pro, GPT‑4o / 4.1 families, Codex and image/embedding variants — return
  `Forbidden: AI model not allowed for your plan`.
- **4 heavy `dume/*` models** — `dume/deepseek-ai/DeepSeek-V4-Pro`,
  `dume/openai/gpt-oss-20b`, `dume/MiniMaxAI/MiniMax-M2.7`,
  `dume/Qwen/Qwen3.5-397B-A17B` — return
  `Unable to access non-serverless model` (a dedicated Together AI endpoint is required).

The working set is also machine-readable in [`working_models.json`](working_models.json).

## Requirements

- Node.js **18+**
- A Chromium/Chrome binary. Auto-detected, or set `CHROME_PATH`.
- A network path Dume accepts. Cloudflare/Vercel bot checks reject most datacenter
  IPs — use a residential connection, your own proxy, or an existing logged-in
  browser via `CDP_URL`.

## Quick start

```bash
git clone https://github.com/0xgetz/dume-bulk-9router
cd dume-bulk-9router

# 1. Create accounts (each one drives Chromium through the signup flow)
node src/cli.js create --count 3 --out accounts.json

# 2. Start the pool adapter
bash run-adapter.sh            # http://127.0.0.1:8790/v1

# 3. Register the pool with 9Router
ROUTER_PASSWORD=123456 node src/connect-9router.js

# 4. Use it through 9Router
curl http://127.0.0.1:20128/v1/chat/completions \
  -H "Authorization: Bearer sk-..." -H "Content-Type: application/json" \
  -d '{"model":"dume/Kimi-K3","messages":[{"role":"user","content":"hi"}]}'
```

## Configuration

| Variable            | Default              | Purpose                                        |
|---------------------|----------------------|------------------------------------------------|
| `CHROME_PATH`       | auto-detect          | Chromium/Chrome binary to launch               |
| `CDP_URL`           | —                    | Attach to an existing browser instead of launching |
| `HEADLESS`          | `1`                  | `0` runs a visible browser (needs a display)   |
| `HTTP_PROXY`/`--proxy` | —                 | Route the browser through a proxy              |
| `PORT`              | `8790`               | Pool adapter port                              |
| `DUME_ACCOUNTS`     | `accounts.json`      | Account store file                             |
| `DUME_ROUTING`      | `round-robin`        | `round-robin` or `random`                      |
| `ROUTER_URL`        | `http://127.0.0.1:20128` | 9Router base URL                          |
| `ROUTER_PASSWORD`   | `123456`             | 9Router admin password                         |
| `MAILTM_BASE`       | `https://api.mail.tm`| Mailbox provider base URL                      |

## CLI

```
node src/cli.js create  --count N [--out accounts.json] [--domains maxxspace.com]
node src/cli.js connect
node src/cli.js models
node src/cli.js chat    <model> "<text>"
node src/cli.js pool
node src/cli.js serve
```

## How it works

```
mail.tm mailbox ──► Chromium (Turnstile) ──► Dume signup UI
                                              │
                        token + cookies ◄─────┘
                              │
                     accounts.json (pool)
                              │
        client ──► pool adapter :8790 ──► Dume REST API
                              │
                          9Router :20128
```

See [`docs/PROTOCOL.md`](docs/PROTOCOL.md) for the reverse-engineered Dume API
and [`STRUCTURE.md`](STRUCTURE.md) for the annotated tree.

## Project layout

```
src/launcher.js       Launch a local Chromium / auto-detect a binary
src/cdp.js            Zero-dep CDP WebSocket client
src/signup.js         Drive the Dume signup UI, harvest token + cookies
src/mailtm.js         mail.tm mailbox client + OTP extraction
src/dume.js           Dume REST client (async session + poll)
src/provision.js      Create N accounts end to end
src/pool.js           Multi-account pool (round-robin + failover)
src/adapter.js        OpenAI-compatible HTTP server
src/connect-9router.js  Register the adapter into 9Router
src/cli.js            Command-line entry point
```

## Legal

For educational and interoperability research. Automating account creation may
violate a service's Terms of Service. You are responsible for how you use this
software. Licensed under [MIT](LICENSE).
