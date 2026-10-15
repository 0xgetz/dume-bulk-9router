"use strict";
// Minimal CDP transport (zero dependencies, Node >= 18).
//
// Connects to a Chrome DevTools Protocol WebSocket endpoint and evaluates JS in
// the attached page. Used by the signup driver to (a) load app.dume.ai so the
// Cloudflare Turnstile widget solves in a real page, and (b) read the auth token
// out of localStorage / the Network cookie jar once the account exists.
//
// Endpoint resolution order: opts.cdpUrl -> CDP_URL -> BU_CDP_WS.

const http = require("http");
const https = require("https");
const crypto = require("crypto");
const { URL } = require("url");

function wsConnect(url) {
  const u = new URL(url);
  const isTLS = u.protocol === "wss:";
  const lib = isTLS ? https : http;
  const key = crypto.randomBytes(16).toString("base64");
  return new Promise((resolve, reject) => {
    const req = lib.request({
      host: u.hostname,
      port: u.port || (isTLS ? 443 : 80),
      path: u.pathname + u.search,
      method: "GET",
      headers: {
        Upgrade: "websocket",
        Connection: "Upgrade",
        "Sec-WebSocket-Key": key,
        "Sec-WebSocket-Version": "13",
      },
    });
    req.on("upgrade", (res, sock) => resolve(new RawWS(sock)));
    req.on("response", (res) => reject(new Error("no upgrade: HTTP " + res.statusCode)));
    req.on("error", reject);
    req.end();
  });
}

function encodeText(str) {
  const p = Buffer.from(str, "utf8");
  const mask = crypto.randomBytes(4);
  const len = p.length;
  let header;
  if (len < 126) header = Buffer.from([0x81, 0x80 | len]);
  else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 0x80 | 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  const masked = Buffer.alloc(len);
  for (let i = 0; i < len; i++) masked[i] = p[i] ^ mask[i % 4];
  return Buffer.concat([header, mask, masked]);
}

function decodeFrames(buf) {
  const out = [];
  while (buf.length >= 2) {
    const b1 = buf[0];
    const b2 = buf[1];
    const opcode = b1 & 0x0f;
    const masked = (b2 & 0x80) !== 0;
    let len = b2 & 0x7f;
    let off = 2;
    if (len === 126) { if (buf.length < 4) break; len = buf.readUInt16BE(2); off = 4; }
    else if (len === 127) { if (buf.length < 10) break; len = Number(buf.readBigUInt64BE(2)); off = 10; }
    let mk = null;
    if (masked) { if (buf.length < off + 4) break; mk = buf.slice(off, off + 4); off += 4; }
    if (buf.length < off + len) break;
    const payload = Buffer.from(buf.slice(off, off + len));
    if (masked) for (let i = 0; i < len; i++) payload[i] ^= mk[i % 4];
    out.push({ opcode, payload });
    buf = buf.slice(off + len);
  }
  return { frames: out, rest: buf };
}

class RawWS {
  constructor(sock) {
    this.sock = sock;
    this.buf = Buffer.alloc(0);
    this.onmessage = null;
    sock.on("data", (d) => {
      this.buf = Buffer.concat([this.buf, d]);
      const { frames, rest } = decodeFrames(this.buf);
      this.buf = rest;
      for (const f of frames) {
        if (f.opcode === 0x9) { sock.write(Buffer.from([0x8a, 0x80, 0, 0, 0, 0])); continue; }
        if (f.opcode === 0x1 && this.onmessage) this.onmessage(f.payload.toString());
      }
    });
  }
  send(str) { this.sock.write(encodeText(str)); }
  close() { try { this.sock.destroy(); } catch { /* ignore */ } }
}

async function connectCDP({ cdpUrl } = {}) {
  const wsUrl = cdpUrl || process.env.CDP_URL || process.env.BU_CDP_WS;
  if (!wsUrl) throw new Error("no CDP url (set CDP_URL or BU_CDP_WS)");
  const ws = await wsConnect(wsUrl);
  let id = 0;
  const pending = new Map();
  ws.onmessage = (txt) => {
    let m;
    try { m = JSON.parse(txt); } catch { return; }
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? reject(new Error(m.error.message || "cdp error")) : resolve(m.result);
    }
  };
  const call = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const mid = ++id;
      pending.set(mid, { resolve, reject });
      ws.send(JSON.stringify({ id: mid, method, params, sessionId }));
      setTimeout(() => { if (pending.has(mid)) { pending.delete(mid); reject(new Error("cdp timeout " + method)); } }, 30000);
    });

  // Prefer a dedicated tab so an interactive CDP client on an existing page is
  // never disturbed. Fall back to reusing a page target when creation is blocked.
  let page = null;
  if (process.env.CDP_USE_EXISTING !== "1") {
    try {
      const created = await call("Target.createTarget", { url: "about:blank" });
      page = { targetId: created.targetId };
    } catch { /* fall through */ }
  }
  if (!page) {
    const { targetInfos } = await call("Target.getTargets");
    page = targetInfos.find((t) => t.type === "page" && !t.url.startsWith("chrome://"))
      || targetInfos.find((t) => t.type === "page");
  }
  if (!page) throw new Error("no page target");
  const { sessionId } = await call("Target.attachToTarget", { targetId: page.targetId, flatten: true });
  await call("Runtime.enable", {}, sessionId);
  await call("Page.enable", {}, sessionId);
  await call("Network.enable", {}, sessionId);

  const session = {
    call: (m, p) => call(m, p, sessionId),
    Network: { getCookies: (p) => call("Network.getCookies", p, sessionId) },
  };
  return { ws, session, page, rawCall: call };
}

async function evaluate(session, expression) {
  const r = await session.call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error("page eval error: " + JSON.stringify(r.exceptionDetails).slice(0, 300));
  return r.result.value;
}

module.exports = { connectCDP, evaluate };
