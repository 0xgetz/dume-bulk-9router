"use strict";
// Dume AI API client. Zero dependencies (global fetch, Node >= 18).
//
// Auth model: an *encrypted* JWT ("dume:auth-token" in localStorage / auth-storage.token).
// The token is sent as `Authorization: Bearer <jwt>` and every request also needs a
// per-request header `unique-request-code` + `channelid: web`.
//
// Chat is asynchronous:
//   1. POST /api/agent/sessions                -> { id: "ses_..." }
//   2. POST /api/agent/sessions/{id}/message/async
//        { parts:[{type:"text",text}], model:{providerID, modelID} }
//   3. GET  /api/agent/sessions/{id}/messages  (poll) -> assistant text in parts[].text

const DEFAULT_BASE = "https://api.dume.ai/api/agent";

let _seq = 0;
function reqCode() {
  _seq = (_seq + 1) % 97;
  return `web-${Date.now()}${_seq}`;
}

class DumeClient {
  constructor({ token, base = DEFAULT_BASE, timezone = "America/Detroit", channelid = "web" } = {}) {
    if (!token) throw new Error("DumeClient: token is required");
    this.token = token;
    this.base = base.replace(/\/$/, "");
    this.timezone = timezone;
    this.channelid = channelid;
  }

  _headers() {
    return {
      Authorization: `Bearer ${this.token}`,
      "Content-Type": "application/json",
      channelid: this.channelid,
      "x-timezone": this.timezone,
      "unique-request-code": reqCode(),
    };
  }

  async _req(method, path, body) {
    const res = await fetch(this.base + path, {
      method,
      headers: this._headers(),
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
    if (!res.ok) {
      const err = new Error(`Dume ${method} ${path} -> HTTP ${res.status}`);
      err.status = res.status;
      err.body = data;
      throw err;
    }
    return data;
  }

  async providers() {
    const d = await this._req("GET", "/providers");
    return (d && d.data && d.data.providers) || [];
  }

  // Flatten providers -> active chat models with text output.
  async listModels() {
    const provs = await this.providers();
    const out = [];
    for (const p of provs) {
      for (const [mid, m] of Object.entries(p.models || {})) {
        if (m.status !== "active") continue;
        const caps = m.capabilities || {};
        if (!caps.output || !caps.output.text) continue;
        const fam = m.family || "";
        if (fam.includes("embedding") || fam.includes("image")) continue;
        out.push({
          providerID: p.id,
          modelID: mid,
          name: m.name || mid,
          context: (m.limit && m.limit.context) || 0,
          reasoning: !!(caps.reasoning),
          attachment: !!(caps.attachment),
        });
      }
    }
    return out;
  }

  async createSession() {
    const d = await this._req("POST", "/sessions", {});
    const id = d.id || (d.data && (d.data.id || (d.data.session && d.data.session.id)));
    if (!id) throw new Error("createSession: no id in response: " + JSON.stringify(d).slice(0, 200));
    return id;
  }

  async sendMessage(sessionId, text, providerID, modelID) {
    const parts = Array.isArray(text) ? text : [{ type: "text", text }];
    return this._req("POST", `/sessions/${sessionId}/message/async`, {
      parts,
      model: { providerID, modelID },
    });
  }

  async getMessages(sessionId) {
    const d = await this._req("GET", `/sessions/${sessionId}/messages`);
    if (Array.isArray(d)) return d;
    return (d && (d.data || d.messages)) || [];
  }

  static extractAssistant(msgs) {
    // Return { text, error, done } from the last assistant message.
    let last = null;
    for (const m of msgs) {
      const info = m.info || {};
      if (info.role === "assistant") last = m;
    }
    if (!last) return { text: null, error: null, done: false };
    const info = last.info || {};
    if (info.error) {
      const msg = (info.error.data && info.error.data.message) || JSON.stringify(info.error);
      return { text: null, error: msg, done: true };
    }
    let text = "";
    let sawText = false;
    for (const p of last.parts || []) {
      if (p.type === "text" && p.text) { text += p.text; sawText = true; }
    }
    return { text: sawText ? text : null, error: null, done: !!info.time && !!info.time.completed };
  }

  // Full non-streaming completion. Polls until the assistant message completes.
  async chat({ text, providerID, modelID, timeoutMs = 120000, pollMs = 1500, onDelta }) {
    const sid = await this.createSession();
    await this.sendMessage(sid, text, providerID, modelID);
    const deadline = Date.now() + timeoutMs;
    let lastText = "";
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, pollMs));
      const msgs = await this.getMessages(sid);
      const a = DumeClient.extractAssistant(msgs);
      if (a.error) { const e = new Error(a.error); e.providerError = true; throw e; }
      if (a.text && a.text !== lastText) {
        const delta = a.text.slice(lastText.length);
        lastText = a.text;
        if (onDelta) onDelta(delta);
      }
      if (a.done) {
        if (!lastText) { const e = new Error("Dume: assistant completed with no text"); e.providerError = true; throw e; }
        return { text: lastText, sessionId: sid };
      }
    }
    const e = new Error("Dume: timeout waiting for response");
    e.timeout = true;
    throw e;
  }
}

module.exports = { DumeClient, DEFAULT_BASE };
