#!/usr/bin/env node
"use strict";
// Dume bulk toolkit CLI.
//
//   node src/cli.js create   --count 3 [--domains maxxspace.com] [--out accounts.json]
//   node src/cli.js connect
//   node src/cli.js models
//   node src/cli.js chat     <model> "<text>"
//   node src/cli.js pool
//   node src/cli.js serve
//
// Environment: CDP_URL / BU_CDP_WS (browser), ROUTER_URL, ROUTER_PASSWORD.

const path = require("path");
const ROOT = path.resolve(__dirname, "..");

function arg(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : def;
}

async function main() {
  const cmd = process.argv[2];
  switch (cmd) {
    case "create": {
      const { provision } = require("./provision");
      const fs = require("fs");
      const out = arg("--out", path.join(ROOT, "accounts.json"));
      const count = Number(arg("--count", "1"));
      const accounts = fs.existsSync(out) ? (JSON.parse(fs.readFileSync(out, "utf8")).accounts || []) : [];
      const res = await provision({
        count,
        domains: arg("--domains") ? arg("--domains").split(",") : undefined,
        firstName: arg("--first", "Bulk"),
        lastName: arg("--last", "User"),
        log: (m) => console.log(m),
        onAccount: (a) => {
          accounts.push({ email: a.email, password: a.password, token: a.token, cookies: a.cookies, status: "active", addedAt: a.signedUpAt });
          fs.writeFileSync(out, JSON.stringify({ accounts }, null, 2));
        },
      });
      console.log(`\nprovisioned ${res.filter((x) => !x.error).length}/${count} -> ${out}`);
      break;
    }
    case "connect":
      await require("./connect-9router").connect();
      break;
    case "models": {
      const { Pool } = require("./pool");
      const pool = new Pool({ file: arg("--accounts", path.join(ROOT, "accounts.json")) });
      const a = pool.healthy()[0];
      if (!a) { console.log("no accounts; run `create` first"); break; }
      const models = await a.client.listModels();
      models.forEach((m) => console.log(`  ${m.providerID}/${m.modelID}  (${m.name})`));
      break;
    }
    case "chat": {
      const { Pool } = require("./pool");
      const model = process.argv[3];
      const text = process.argv[4];
      const [pid, ...mid] = model.split("/");
      const pool = new Pool({ file: arg("--accounts", path.join(ROOT, "accounts.json")) });
      for (const acct of pool.candidates()) {
        try {
          const out = await acct.client.chat({ text, providerID: pid, modelID: mid.join("/") });
          console.log(out.text); return;
        } catch (e) { pool.markFailure(acct); console.error("failover:", e.message); }
      }
      console.error("all accounts failed"); process.exit(1);
      break;
    }
    case "pool": {
      const { Pool } = require("./pool");
      const pool = new Pool({ file: arg("--accounts", path.join(ROOT, "accounts.json")) });
      console.log(JSON.stringify(pool.info(), null, 2));
      break;
    }
    case "serve":
      require("./adapter").makeServer().server.listen(
        Number(process.env.PORT || 8790),
        process.env.HOST || "127.0.0.1",
        () => console.log("adapter listening on :" + (process.env.PORT || 8790))
      );
      break;
    default:
      console.log("usage: node src/cli.js <create|connect|models|chat|pool|serve> [options]");
  }
}

main().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
