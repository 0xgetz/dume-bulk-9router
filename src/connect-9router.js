"use strict";
// Connect the Dume pool adapter into 9Router (https://9router.com).
//
// Flow (verified against 9Router 0.5.99):
//   1. POST /api/auth/login {password}                       -> session cookie
//   2. POST /api/provider-nodes {type:"openai-compatible",   -> { id }
//        apiType:"chat", prefix, name, baseUrl}
//   3. POST /api/providers {provider:<NODE_ID>, apiKey, name, priority, defaultModel}
//
// NOTE: `provider` in step 3 must be the NODE ID, not the prefix.

const fs = require("fs");
const path = require("path");

const ROUTER = process.env.ROUTER_URL || "http://127.0.0.1:20128";
const ADMIN_PW = process.env.ROUTER_PASSWORD || "123456";
const ROOT = path.resolve(__dirname, "..");

function readConfig() {
  const cfgPath = process.env.DUME_CONFIG || path.join(ROOT, "config.json");
  const cfg = fs.existsSync(cfgPath) ? JSON.parse(fs.readFileSync(cfgPath, "utf8")) : {};
  return {
    prefix: process.env.DUME_PREFIX || cfg.modelPrefix || "dume",
    adapterUrl: process.env.DUME_ADAPTER_URL || `http://127.0.0.1:${cfg.port || 8790}/v1`,
    defaultModel: process.env.DUME_DEFAULT_MODEL || "Kimi-K3",
  };
}

function cookieFrom(res) {
  const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  if (raw.length) return raw.map((c) => c.split(";")[0]).join("; ");
  const single = res.headers.get("set-cookie");
  return single ? single.split(";")[0] : "";
}

async function login() {
  const res = await fetch(`${ROUTER}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: ADMIN_PW }),
  });
  if (!res.ok) throw new Error(`9Router login failed: HTTP ${res.status}`);
  const cookie = cookieFrom(res);
  if (!cookie) throw new Error("9Router login: no Set-Cookie returned");
  return cookie;
}

async function api(cookie, method, p, body) {
  const res = await fetch(`${ROUTER}${p}`, {
    method,
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data; try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(`9Router ${method} ${p} -> HTTP ${res.status}: ${text.slice(0, 300)}`);
  return data;
}

async function connect() {
  const { prefix, adapterUrl, defaultModel } = readConfig();
  console.log(`Connecting Dume adapter -> 9Router at ${ROUTER}`);
  console.log(`  baseUrl: ${adapterUrl}   prefix: ${prefix}`);
  const cookie = await login();
  console.log("  logged in");

  let nodeId = null;
  try {
    const nodes = await api(cookie, "GET", "/api/provider-nodes");
    const list = Array.isArray(nodes) ? nodes : (nodes.nodes || nodes.data || []);
    const found = list.find((n) => n.prefix === prefix && n.type && n.type.includes("openai"));
    if (found) nodeId = found.id;
  } catch { /* ignore */ }

  if (!nodeId) {
    const node = await api(cookie, "POST", "/api/provider-nodes", {
      type: "openai-compatible", apiType: "chat", prefix, name: "Dume AI", baseUrl: adapterUrl,
    });
    nodeId = node.id || (node.node && node.node.id) || (node.data && node.data.id);
    console.log("  provider node:", nodeId);
  } else {
    console.log("  reusing provider node:", nodeId);
  }

  const provider = await api(cookie, "POST", "/api/providers", {
    provider: nodeId,
    apiKey: process.env.DUME_ADAPTER_KEY || "dume-pool",
    name: "Dume AI",
    priority: 1,
    defaultModel: `${prefix}/${defaultModel}`,
    allowOverwrite: true,
  });
  console.log("  registered provider:", provider.id || JSON.stringify(provider).slice(0, 100));
  console.log("\nDone. Models now available through 9Router under prefix:", prefix);
}

if (require.main === module) {
  connect().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
}

module.exports = { login, api };
