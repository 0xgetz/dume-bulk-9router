"use strict";
// Account pool: loads provisioned accounts, exposes healthy ones round-robin with
// automatic failover, and persists new accounts to the store file.

const fs = require("fs");
const path = require("path");
const { DumeClient } = require("./dume");

class Pool {
  constructor({ file, prefix = "dume", routing = "round-robin", maxFailures = 3 } = {}) {
    this.file = file;
    this.prefix = prefix;
    this.routing = routing;
    this.maxFailures = maxFailures;
    this.accounts = [];
    this.cursor = 0;
    this.load();
  }

  load() {
    if (!this.file || !fs.existsSync(this.file)) { this.accounts = []; return; }
    let data;
    try { data = JSON.parse(fs.readFileSync(this.file, "utf8")); } catch { data = null; }
    const list = Array.isArray(data) ? data : (data && data.accounts) || [];
    this.accounts = list.map((a) => ({
      email: a.email,
      password: a.password,
      token: a.token,
      cookies: a.cookies || [],
      status: a.status || "active",
      failures: 0,
      client: a.token ? new DumeClient({ token: a.token }) : null,
    }));
  }

  add(account) {
    this.accounts.push({ failures: 0, status: "active", cookies: [], ...account, client: account.token ? new DumeClient({ token: account.token }) : null });
    this.save();
  }

  save() {
    if (!this.file) return;
    const out = { accounts: this.accounts.map((a) => ({
      email: a.email, password: a.password, token: a.token, cookies: a.cookies,
      status: a.status, addedAt: a.addedAt,
    })) };
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(out, null, 2));
  }

  healthy() {
    return this.accounts.filter((a) => a.status !== "disabled" && a.failures < this.maxFailures && a.client);
  }

  // Returns an ordered candidate list for a request (routing strategy first,
  // then the rest for failover).
  candidates() {
    const ok = this.healthy();
    if (!ok.length) return [];
    if (this.routing === "random") {
      const shuffled = [...ok].sort(() => Math.random() - 0.5);
      return shuffled;
    }
    const start = this.cursor % ok.length;
    this.cursor = (this.cursor + 1) % ok.length;
    return [...ok.slice(start), ...ok.slice(0, start)];
  }

  markFailure(a) { a.failures += 1; if (a.failures >= this.maxFailures) a.status = "degraded"; }
  markSuccess(a) { a.failures = 0; }
  markDead(a) { a.status = "dead"; }

  get size() { return this.accounts.length; }
  get healthyCount() { return this.healthy().length; }

  info() {
    return {
      file: this.file,
      total: this.accounts.length,
      healthy: this.healthyCount,
      routing: this.routing,
      accounts: this.accounts.map((a) => ({ email: a.email, status: a.status, failures: a.failures })),
    };
  }
}

module.exports = { Pool };
