"use strict";
// Create accounts: temp mailbox -> browser signup -> store token. Sequential by
// default because each signup drives one browser page.

const fs = require("fs");
const path = require("path");
const mailtm = require("./mailtm");
const { signup } = require("./signup");

const ROOT = path.resolve(__dirname, "..");

async function provision({ count = 1, domains, firstName = "Bulk", lastName = "User", onAccount, log = () => {} } = {}) {
  const results = [];
  for (let i = 0; i < count; i++) {
    let attempt = 0;
    while (true) {
      attempt++;
      try {
        const mailbox = await mailtm.createAccount({ domain: domains && domains[i % domains.length] });
        log(`[${i + 1}/${count}] mailbox ${mailbox.address} (pw: ${mailbox.password})`);
        const mailToken = await mailtm.getToken(mailbox.address, mailbox.password);
        const password = "Dume!" + Math.random().toString(36).slice(2, 9) + "Aa9";
        const acct = await signup({
          email: mailbox.address,
          password,
          firstName,
          lastName,
          mail: { token: mailToken },
          log: (m) => log(`   ${m}`),
        });
        results.push(acct);
        if (onAccount) await onAccount(acct);
        log(`[${i + 1}/${count}] OK ${acct.email}`);
        break;
      } catch (e) {
        log(`[${i + 1}/${count}] attempt ${attempt} failed: ${e.message}`);
        if (attempt >= 3) { results.push({ error: e.message }); break; }
        await new Promise((r) => setTimeout(r, 4000));
      }
    }
  }
  return results;
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const get = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
  const count = Number(get("--count", "1"));
  const out = get("--out", path.join(ROOT, "accounts.json"));
  const domains = get("--domains") ? get("--domains").split(",") : undefined;

  const accounts = fs.existsSync(out) ? (JSON.parse(fs.readFileSync(out, "utf8")).accounts || []) : [];
  provision({
    count, domains,
    firstName: get("--first", "Bulk"),
    lastName: get("--last", "User"),
    log: (m) => console.log(m),
    onAccount: (a) => {
      accounts.push({ email: a.email, password: a.password, token: a.token, cookies: a.cookies, status: "active", addedAt: a.signedUpAt });
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, JSON.stringify({ accounts }, null, 2));
    },
  }).then((r) => {
    const ok = r.filter((x) => !x.error).length;
    console.log(`\nprovisioned ${ok}/${count} -> ${out}`);
  }).catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
}

module.exports = { provision };
