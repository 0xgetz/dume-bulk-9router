"use strict";
// mail.tm disposable mailbox client (zero dependencies).
// API docs: https://docs.mail.tm
//
//   POST /accounts {address,password}  -> create mailbox
//   POST /token    {address,password}  -> bearer token
//   GET  /messages                     -> list
//   GET  /messages/{id}                -> full message (text + html)
//
// Dume's signup emails a 6-digit code ("Your verification code is: XXXXXX").

const BASE = process.env.MAILTM_BASE || "https://api.mail.tm";

function randomLocal(prefix = "dume", len = 10) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return prefix + s;
}

async function jreq(path, { method = "GET", token, body } = {}) {
  const headers = { Accept: "application/json" };
  if (body) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = "Bearer " + token;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data; try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) {
    const e = new Error(`mail.tm ${method} ${path} -> HTTP ${res.status}: ${text.slice(0, 200)}`);
    e.status = res.status; e.body = data;
    throw e;
  }
  return data;
}

async function getDomains() {
  const d = await jreq("/domains");
  const list = Array.isArray(d) ? d : (d["hydra:member"] || []);
  return list.filter((x) => x.isActive).map((x) => x.domain);
}

async function createAccount({ domain, local } = {}) {
  if (!domain) {
    const domains = await getDomains();
    if (!domains.length) throw new Error("mail.tm: no active domains");
    domain = domains[0];
  }
  const address = `${local || randomLocal()}@${domain}`;
  const password = "Dume!" + Math.random().toString(36).slice(2, 12) + "9A";
  await jreq("/accounts", { method: "POST", body: { address, password } });
  return { address, password, domain };
}

async function getToken(address, password) {
  const d = await jreq("/token", { method: "POST", body: { address, password } });
  return d.token;
}

async function listMessages(token) {
  const d = await jreq("/messages", { token });
  if (Array.isArray(d)) return d;
  return d["hydra:member"] || d.member || [];
}

async function getMessage(token, id) {
  return jreq(`/messages/${id}`, { token });
}

function extractCode(message, { len = 6 } = {}) {
  const text = message.text || message.intro || "";
  const html = typeof message.html === "string" ? message.html : (Array.isArray(message.html) ? message.html.join(" ") : "");
  const body = text + " " + html;
  const near = body.match(new RegExp(`code\\D{0,20}?(\\d{${len}})`), "i");
  if (near) return near[1];
  const any = body.match(new RegExp(`\\b(\\d{${len}})\\b`));
  return any ? any[1] : null;
}

// Poll for a message whose body matches and return the parsed code.
async function waitForCode(token, { timeoutMs = 120000, pollMs = 4000, fromFilter = "dume" } = {}) {
  const deadline = Date.now() + timeoutMs;
  let seen = new Set();
  while (Date.now() < deadline) {
    let msgs = [];
    try { msgs = await listMessages(token); } catch { /* transient */ }
    for (const m of msgs) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      const fromAddr = (m.from && m.from.address) || "";
      if (fromFilter && !fromAddr.toLowerCase().includes(fromFilter)) continue;
      let full = m;
      try { full = await getMessage(token, m.id); } catch { /* use summary */ }
      const code = extractCode(full);
      if (code) return code;
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new Error("mail.tm: timed out waiting for verification code");
}

module.exports = { createAccount, getToken, listMessages, getMessage, extractCode, waitForCode, getDomains, randomLocal };
