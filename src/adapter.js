"use strict";
// OpenAI-compatible HTTP server backed by the Dume account pool.
//
//   POST /v1/chat/completions   (stream + non-stream, round-robin + failover)
//   GET  /v1/models
//   GET  /health
//   GET  /pool                  (account status)
//
// Every request picks the next healthy account, and on a provider error retries
// the next one. Dume chat is asynchronous, so "streaming" forwards polled text as
// SSE deltas.

const http = require("http");
const fs = require("fs");
const path = require("path");
const { Pool } = require("./pool");

const ROOT = path.resolve(__dirname, "..");

function loadConfig() {
  const cfgPath = process.env.DUME_CONFIG || path.join(ROOT, "config.json");
  const cfg = fs.existsSync(cfgPath) ? JSON.parse(fs.readFileSync(cfgPath, "utf8")) : {};

  let models = cfg.models;
  if (!models) {
    const wmPath = path.join(ROOT, "working_models.json");
    if (fs.existsSync(wmPath)) {
      models = JSON.parse(fs.readFileSync(wmPath, "utf8")).map((m) => ({
        providerID: m.model.split("/")[0],
        modelID: m.model.split("/").slice(1).join("/"),
        name: m.name,
      }));
    }
  }
  return {
    port: Number(process.env.PORT || cfg.port || 8790),
    host: process.env.HOST || cfg.host || "127.0.0.1",
    prefix: cfg.modelPrefix || "dume",
    accountsFile: process.env.DUME_ACCOUNTS || cfg.accountsFile || path.join(ROOT, "accounts.json"),
    routing: process.env.DUME_ROUTING || cfg.routing || "round-robin",
    maxFailures: Number(process.env.DUME_MAX_FAILURES || cfg.maxFailures || 3),
    models: models || FALLBACK_MODELS,
  };
}

const FALLBACK_MODELS = [
  { providerID: "dume", modelID: "moonshotai/Kimi-K3", name: "Kimi K3" },
  { providerID: "dume", modelID: "MiniMaxAI/MiniMax-M3", name: "MiniMax M3" },
  { providerID: "dume", modelID: "Qwen/Qwen3.5-9B", name: "Qwen 3.5 9B" },
  { providerID: "dume", modelID: "Prism-ML/Ternary-Bonsai-27B", name: "Ternary Bonsai 27B" },
  { providerID: "openai", modelID: "gpt-5-nano", name: "GPT-5 Nano" },
  { providerID: "openai", modelID: "gpt-5-nano-flex", name: "GPT-5 Nano Flex" },
  { providerID: "openai", modelID: "gpt-5.6-luna", name: "GPT-5.6 Luna" },
  { providerID: "openai", modelID: "gpt-5.6-luna-fast", name: "GPT-5.6 Luna Fast" },
  { providerID: "openai", modelID: "gpt-5.6-luna-pro", name: "GPT-5.6 Luna Pro" },
];

function messagesToText(messages) {
  const sys = [], convo = [];
  for (const m of messages || []) {
    const content = typeof m.content === "string"
      ? m.content
      : Array.isArray(m.content) ? m.content.map((c) => c.text || "").join("") : "";
    if (m.role === "system") sys.push(content);
    else if (m.role === "user") convo.push(content);
    else if (m.role === "assistant") convo.push(`(previous assistant) ${content}`);
  }
  let text = sys.length ? sys.join("\n") + "\n\n" : "";
  return (text + convo.join("\n\n")).trim();
}

function resolveModel(models, requested) {
  if (!requested) return models[0];
  const norm = requested.replace(/^[^/]+\//, "");
  for (const m of models) {
    if (m.modelID === requested || m.modelID === norm) return m;
    if (`${m.providerID}/${m.modelID}` === requested) return m;
    if (m.modelID.split("/").pop() === norm) return m;
  }
  return models[0];
}

function makeServer() {
  const cfg = loadConfig();
  const pool = new Pool({ file: cfg.accountsFile, prefix: cfg.prefix, routing: cfg.routing, maxFailures: cfg.maxFailures });

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    };
    const json = (code, obj) => { res.writeHead(code, { ...cors, "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };

    if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }
    if (url.pathname === "/health") return json(200, { status: "ok", accounts: pool.healthyCount, models: cfg.models.length });
    if (url.pathname === "/pool") return json(200, pool.info());
    if (url.pathname === "/pool/reload") { pool.load(); return json(200, pool.info()); }
    if (url.pathname === "/v1/models") {
      return json(200, {
        object: "list",
        data: cfg.models.map((m) => ({ id: `${cfg.prefix}/${m.modelID.split("/").pop()}`, object: "model", owned_by: m.providerID, created: Math.floor(Date.now() / 1000) })),
      });
    }

    if (url.pathname === "/v1/chat/completions" && req.method === "POST") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", async () => {
        let payload; try { payload = JSON.parse(body); } catch { return json(400, { error: { message: "invalid JSON" } }); }
        const chosen = resolveModel(cfg.models, payload.model);
        const text = messagesToText(payload.messages);
        const wantStream = !!payload.stream || String(req.headers["accept"] || "").includes("text/event-stream");
        const id = "chatcmpl-" + Math.random().toString(36).slice(2);
        const created = Math.floor(Date.now() / 1000);
        const modelName = `${cfg.prefix}/${chosen.modelID.split("/").pop()}`;

        const cands = pool.candidates();
        if (!cands.length) return json(503, { error: { message: "no healthy Dume accounts in pool", type: "no_accounts" } });

        if (wantStream) {
          res.writeHead(200, { ...cors, "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
          const send = (o) => res.write(`data: ${JSON.stringify(o)}\n\n`);
          const chunk = (delta, finish = null) => ({ id, object: "chat.completion.chunk", created, model: modelName, choices: [{ index: 0, delta, finish_reason: finish }] });
          send(chunk({ role: "assistant", content: "" }));

          let lastErr;
          for (const acct of cands) {
            try {
              await acct.client.chat({ text, providerID: chosen.providerID, modelID: chosen.modelID, onDelta: (d) => { if (d) send(chunk({ content: d })); } });
              pool.markSuccess(acct);
              send(chunk({}, "stop"));
              res.write("data: [DONE]\n\n");
              return res.end();
            } catch (e) { lastErr = e; pool.markFailure(acct); }
          }
          send({ error: { message: lastErr ? lastErr.message : "all accounts failed" } });
          return res.end();
        }

        let lastErr;
        for (const acct of cands) {
          try {
            const out = await acct.client.chat({ text, providerID: chosen.providerID, modelID: chosen.modelID });
            pool.markSuccess(acct);
            return json(200, {
              id, object: "chat.completion", created, model: modelName,
              choices: [{ index: 0, message: { role: "assistant", content: out.text }, finish_reason: "stop" }],
              usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
              x_dume_account: acct.email,
            });
          } catch (e) { lastErr = e; pool.markFailure(acct); }
        }
        json(502, { error: { message: lastErr ? lastErr.message : "all accounts failed" } });
      });
      return;
    }

    json(404, { error: { message: "not found" } });
  });

  return { server, pool, cfg };
}

if (require.main === module) {
  const { server, pool, cfg } = makeServer();
  server.listen(cfg.port, cfg.host, () => {
    console.log(`Dume pool adapter on http://${cfg.host}:${cfg.port}  (prefix="${cfg.prefix}", ${pool.healthyCount} accounts, ${cfg.models.length} models)`);
  });
}

module.exports = { makeServer, messagesToText, resolveModel };
