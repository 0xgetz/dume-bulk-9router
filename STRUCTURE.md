# Structure

```
dume-bulk-9router/
│
├── src/
│   ├── launcher.js          Chromium discovery + launch (CHROME_PATH, auto-detect)
│   ├── cdp.js               Zero-dep CDP WebSocket client (connect + evaluate)
│   ├── signup.js            Drives app.dume.ai/signup; harvests token + cookies
│   ├── mailtm.js            mail.tm mailbox client; 6-digit OTP extraction
│   ├── dume.js              Dume REST client (async sessions + transcript poll)
│   ├── provision.js         Create N accounts end to end (mailbox -> signup -> store)
│   ├── pool.js              Multi-account pool: round-robin / random + failover
│   ├── adapter.js           OpenAI-compatible HTTP server (:8790)
│   ├── connect-9router.js   Registers the adapter into 9Router
│   └── cli.js               Command-line entry point
│
├── docs/
│   └── PROTOCOL.md          Reverse-engineered Dume + 9Router protocol notes
│
├── brand/
│   ├── logo.svg             Wordmark
│   └── icon.svg             Square icon
│
├── config.json              Port, prefix, routing, working-model list
├── working_models.json      The 9 models that respond on a Free plan
├── accounts.json            Generated account store (token + cookies)  [gitignored]
├── run-adapter.sh           Detached launcher for the pool adapter
├── README.md                English (default)
├── README.id.md             Bahasa Indonesia
├── README.zh.md             中文
├── README.ja.md             日本語
├── README.es.md             Español
├── LICENSE                  MIT
└── STRUCTURE.md             This file
```

## Request flow

```
   ┌──────────────┐   mailbox   ┌───────────────────┐   Turnstile   ┌──────────────┐
   │   mail.tm    │ ──────────► │  signup.js        │ ────────────► │  Dume signup │
   │  (OTP email) │ ◄────────── │  (Chromium + CDP) │   token+cookie│      UI      │
   └──────────────┘   6-digit   └─────────┬─────────┘ ◄──────────── └──────────────┘
                                          │
                                          ▼
                                  ┌───────────────┐
                                  │ accounts.json │  pool of accounts
                                  └───────┬───────┘
                                          │
   ┌────────┐   OpenAI-compat   ┌─────────▼─────────┐   async poll   ┌──────────────┐
   │ client │ ────────────────► │  adapter.js :8790 │ ─────────────► │  Dume REST   │
   └────────┘                   │  (pool.js router) │ ◄───────────── │ /api/agent/* │
        ▲                       └─────────┬─────────┘   transcript   └──────────────┘
        │                                 │
        │                                 ▼
   ┌────┴─────────────────────────────────────┐
   │            9Router  :20128 /v1           │
   └──────────────────────────────────────────┘
```

## Module responsibilities

| Module | Depends on | Role |
|--------|-----------|------|
| `launcher.js` | Node child_process | Find + start a Chromium with a private debug port |
| `cdp.js` | Node http/https/crypto | Speak CDP over a raw WebSocket |
| `signup.js` | `launcher`, `cdp`, `mailtm` | Walk the signup UI, return the account |
| `mailtm.js` | global fetch | Create mailboxes, read OTP codes |
| `dume.js` | global fetch | Talk to the Dume REST API |
| `provision.js` | `mailtm`, `signup` | Loop account creation |
| `pool.js` | `dume` | Hold accounts, pick healthy ones |
| `adapter.js` | `pool` | Expose `/v1/chat/completions` |
| `connect-9router.js` | global fetch | Register into 9Router |
| `cli.js` | all of the above | User-facing commands |
