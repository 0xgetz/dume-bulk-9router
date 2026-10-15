# Dume API — reverse-engineered notes

All endpoints are under `https://api.dume.ai/api`. Verified against the Free plan
on 15 Oct 2026.

## Auth

Dume issues an **encrypted JWT** (JWE, `alg: dir`, `enc: A256CBC-HS512`). It is
stored in the web app at:

- `localStorage["dume:auth-token"]` — JSON string containing the raw JWT
- `localStorage["auth-storage"].state.token` — the same JWT inside Zustand state

Send it as a bearer token on every call:

```
Authorization: Bearer <jwt>
channelid: web
x-timezone: America/Detroit
unique-request-code: web-<epoch-ms><n>   # required; missing -> 400
Content-Type: application/json
```

The token is **not IP-bound**: it works from a plain datacenter server (the *app
pages* are bot-protected, but the REST API is not).

## Signup flow

The signup UI drives three calls; the first is Turnstile-gated.

| Step | Method | Path | Body |
|------|--------|------|------|
| 1 | POST | `/auth/send-otp` | `{email, turnstileToken}` |
| 2 | POST | `/auth/verify-otp` | `{email, otp}` |
| 3 | POST | `/auth/signup` | `{email, password, firstName, lastName}` |

- `send-otp` **requires a valid Cloudflare Turnstile token**. Empty or dummy
  tokens fail with `Bot verification required` / `Bot verification failed`. This
  is why the toolkit drives a real browser.
- After step 3 the app stores the JWT and the user lands on the dashboard
  (500 credits on the Free plan).

There is no login endpoint used by the toolkit; the token is harvested directly.

## Chat (asynchronous)

Dume chat is a session + poll model, not a streaming completion.

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/agent/sessions` | create a session -> `{id: "ses_..."}` |
| POST | `/agent/sessions/{id}/message/async` | send a message |
| GET  | `/agent/sessions/{id}/messages` | poll the transcript |
| GET  | `/agent/providers` | full model catalog |

Send a message:

```jsonc
POST /agent/sessions/{id}/message/async
{
  "parts": [{ "type": "text", "text": "hello" }],
  "model": { "providerID": "dume", "modelID": "moonshotai/Kimi-K3" }
}
```

Poll the transcript — the assistant message accumulates in `parts[].text` and is
complete when `info.time.completed` is set:

```jsonc
[
  { "info": { "role": "user", "model": {"providerID": "dume", "modelID": "..."} }, "parts": [{"type": "text","text":"..."}] },
  { "info": { "role": "assistant", "time": {"completed": 1792069403989},
              "tokens": {"total": 14697}, "finish": "stop" },
    "parts": [{"type":"text","text":"Hello there friend."}] }
]
```

Errors surface on the assistant message's `info.error.data.message`, e.g.:

- `Forbidden: AI model not allowed for your plan` (403) — Free-plan restriction
- `Unable to access non-serverless model <id> ...` (400) — needs a Together AI
  dedicated endpoint

## Models

`GET /agent/providers` returns `{data:{providers:[...]}}`. Each provider has a
`models` map; keep entries where `status === "active"` and
`capabilities.output.text === true`. The toolkit ships the **9 that respond on a
Free plan** in `working_models.json`; the other 72 are blocked as described above.

## 9Router registration

```
POST /api/auth/login       {password}                        -> session cookie
POST /api/provider-nodes   {type:"openai-compatible",
                            apiType:"chat", prefix, name,
                            baseUrl}                          -> {id}
POST /api/providers        {provider:<node id>, apiKey, name,
                            priority, defaultModel,
                            allowOverwrite:true}
```

`provider` must be the **node id** (`openai-compatible-chat-<uuid>`), not the
prefix. 9Router relays non-stream client calls downstream with
`Accept: text/event-stream`, so the adapter speaks SSE for both modes.
