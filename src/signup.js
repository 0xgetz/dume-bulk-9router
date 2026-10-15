"use strict";
// Browser-driven Dume signup.
//
// Why a browser: Dume gates POST /api/auth/send-otp behind a Cloudflare Turnstile
// token. There is no headless bypass — the widget must run in a real page. Cloud
// browsers auto-solve Turnstile, so we drive the hosted signup UI, then harvest the
// encrypted JWT + cookies. Everything after signup is plain REST (see dume.js).

const { connectCDP, evaluate } = require("./cdp");
const { launch: launchChrome } = require("./launcher");

const SIGNUP_URL = "https://app.dume.ai/signup";
const ORIGIN = "https://app.dume.ai";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const FILL_STEP1 = (first, last, email) => `(() => {
  const set=(sel,v)=>{const el=document.querySelector(sel);if(!el)return false;
    const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set;
    s.call(el,v);el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}));return true}
  const ok = set("#firstName",${JSON.stringify(first)}) && set("#lastName",${JSON.stringify(last)}) && set("#email",${JSON.stringify(email)});
  return ok;
})()`;

const CLICK_BY_TEXT = (re) => `(() => {
  const rx=new RegExp(${JSON.stringify(re)},"i");
  const b=[...document.querySelectorAll("button")].find(x=>rx.test(x.innerText.trim()));
  if(b){b.click();return true} return false;
})()`;

const PAGE_TEXT = `document.body.innerText`;

const HAS_TURNSTILE_TOKEN = `(() => {
  const t=document.querySelector('input[name="cf-turnstile-response"]');
  return !!(t && t.value && t.value.length > 20);
})()`;

const FILL_OTP = (code) => `(() => {
  const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set;
  const ins=[...document.querySelectorAll("input")].filter(i=>i.type!=="hidden" && (i.maxLength===1||i.inputMode==="numeric"));
  if(ins.length>=6){
    ${JSON.stringify(code)}.split("").forEach((ch,idx)=>{const el=ins[idx];el.focus();setter.call(el,ch);
      el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}));
      el.dispatchEvent(new KeyboardEvent("keyup",{bubbles:true,key:ch}))});
    return "otp6";
  }
  const single=document.querySelector('input[type="text"],input[type="tel"],input[inputmode="numeric"]');
  if(single){setter.call(single,${JSON.stringify(code)});single.dispatchEvent(new Event("input",{bubbles:true}));single.dispatchEvent(new Event("change",{bubbles:true}));return "otp1"}
  return "no-otp-input";
})()`;

const FILL_PASSWORD = (pw) => `(() => {
  const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set;
  const fields=[...document.querySelectorAll('input[type="password"]')];
  fields.forEach(el=>{setter.call(el,${JSON.stringify(pw)});el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}))});
  const cb=document.querySelector('input[type="checkbox"]'); if(cb&&!cb.checked) cb.click();
  return fields.length;
})()`;

const READ_TOKEN = `(() => {
  try {
    const a = JSON.parse(localStorage.getItem("dume:auth-token")||"null");
    if (typeof a === "string" && a.length > 20) return a;
    const st = JSON.parse(localStorage.getItem("auth-storage")||"null");
    if (st && st.state && st.state.token) return st.state.token;
  } catch(e){}
  return null;
})()`;

async function waitForText(session, predicate, { timeoutMs = 60000, pollMs = 1500 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < deadline) {
    try { last = await evaluate(session, PAGE_TEXT); } catch { last = ""; }
    if (predicate(last)) return last;
    await sleep(pollMs);
  }
  throw new Error("timed out waiting for page state; last text: " + last.slice(0, 160));
}

// Full signup. Returns { token, cookies, email, password, firstName, lastName }.
//
// By default it launches its own local Chromium (see launcher.js). Pass
// { cdpUrl } to attach to an existing Chromium (`chrome --remote-debugging-port`).
async function signup({ cdpUrl, email, password, firstName = "Bulk", lastName = "User", mail, log = () => {}, timeoutMs = 180000, launch = null } = {}) {
  if (!email) throw new Error("signup: email required");
  if (!password) throw new Error("signup: password required");

  // Own browser unless an explicit CDP endpoint was given.
  let browser = null;
  if (!cdpUrl && process.env.CDP_URL) cdpUrl = process.env.CDP_URL;
  if (!cdpUrl) {
    log("launching local Chromium");
    browser = await launchChrome({ headless: process.env.HEADLESS !== "0" });
  }
  const url = cdpUrl || (browser && browser.wsUrl);

  const { ws, session, page, rawCall } = await connectCDP({ cdpUrl: url });
  const t0 = Date.now();
  try {
    // Fresh context: drop any existing Dume session so /signup is not redirected
    // to the dashboard of a previously-provisioned account.
    log("clearing prior session");
    try { await session.call("Network.clearBrowserCookies", {}); } catch { /* ignore */ }
    log(`opening ${SIGNUP_URL}`);
    await session.call("Page.navigate", { url: SIGNUP_URL });
    await sleep(1000);
    try { await evaluate(session, `(() => { try { localStorage.clear(); sessionStorage.clear(); } catch(e){} return true; })()`); } catch { /* ignore */ }
    await session.call("Page.navigate", { url: SIGNUP_URL });
    await waitForText(session, (t) => /Create an account/i.test(t), { timeoutMs: 45000 });
    await sleep(3000); // let Turnstile render + solve

    log(`filling step 1 for ${email}`);
    await evaluate(session, FILL_STEP1(firstName, lastName, email));

    // Wait for the Cloudflare Turnstile token to be minted before submitting.
    const tsDeadline = Date.now() + 45000;
    let tsOk = false;
    while (Date.now() < tsDeadline) {
      tsOk = await evaluate(session, HAS_TURNSTILE_TOKEN);
      if (tsOk) break;
      await sleep(1000);
    }
    if (!tsOk) throw new Error("turnstile token never appeared");
    await sleep(300);

    if (!await evaluate(session, CLICK_BY_TEXT("^continue"))) throw new Error("continue button not found");

    // Either lands on the OTP screen directly, or errors on turnstile.
    await waitForText(session, (t) => /verification code|Set your password|verify your email/i.test(t), { timeoutMs: 90000 });
    log("otp screen reached");

    if (!mail || !mail.token) throw new Error("signup: mail.token required to read the OTP");
    log("waiting for verification email");
    const code = await waitForCodeInline(mail, log);
    log(`got code ${code}`);

    await evaluate(session, FILL_OTP(code));
    await sleep(500);
    if (!await evaluate(session, CLICK_BY_TEXT("verify"))) throw new Error("verify button not found");
    await waitForText(session, (t) => /Set your password/i.test(t), { timeoutMs: 60000 });
    log("password screen reached");

    await evaluate(session, FILL_PASSWORD(password));
    await sleep(400);
    if (!await evaluate(session, CLICK_BY_TEXT("complete sign"))) throw new Error("complete sign up button not found");

    await waitForText(session, (t) => /Welcome back|Dashboard|Get started|What can I help/i.test(t), { timeoutMs: 60000 });
    await sleep(2000);

    const token = await evaluate(session, READ_TOKEN);
    if (!token) throw new Error("signup succeeded but no auth token in localStorage");
    const { cookies } = await session.Network.getCookies({});
    log(`signed up in ${Math.round((Date.now() - t0) / 1000)}s; token len ${token.length}`);

    return {
      email, password, firstName, lastName,
      token,
      cookies: (cookies || []).map((c) => ({ name: c.name, value: c.value, domain: c.domain })),
      signedUpAt: new Date().toISOString(),
    };
  } finally {
    try { if (page && page.targetId && process.env.CDP_USE_EXISTING !== "1") await rawCall("Target.closeTarget", { targetId: page.targetId }); } catch { /* ignore */ }
    try { ws.close(); } catch { /* ignore */ }
    try { if (browser) browser.close(); } catch { /* ignore */ }
  }
}

async function waitForCodeInline(mail, log) {
  const { waitForCode } = require("./mailtm");
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await waitForCode(mail.token, { timeoutMs: 90000, pollMs: 4000 });
    } catch (e) { lastErr = e; log("code wait attempt " + (attempt + 1) + " failed: " + e.message); }
  }
  throw lastErr;
}

module.exports = { signup, SIGNUP_URL, ORIGIN };
