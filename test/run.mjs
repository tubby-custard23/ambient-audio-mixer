// Runs the browser test pages in headless Chrome/Chromium and reports results.
// Usage: node test/run.mjs [page.html ...]   (set CHROME=/path/to/chrome if needed)
// No dependencies: talks to Chrome over the DevTools protocol.

import { spawn, execFileSync } from 'node:child_process';
import { readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  for (const name of ['chromium', 'chromium-browser', 'google-chrome-stable', 'google-chrome']) {
    try {
      return execFileSync('which', [name]).toString().trim();
    } catch { /* try the next one */ }
  }
  const mac = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  return mac;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function connect(port) {
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      return (await res.json()).webSocketDebuggerUrl;
    } catch {
      await sleep(100);
    }
  }
  throw new Error('Chrome did not start');
}

function rpc(ws) {
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  });
  return (method, params = {}, sessionId) => new Promise((res, rej) => {
    const msgId = ++id;
    pending.set(msgId, (msg) => (msg.error ? rej(new Error(msg.error.message)) : res(msg.result)));
    ws.send(JSON.stringify({ id: msgId, method, params, sessionId }));
  });
}

const pages = process.argv.slice(2).length
  ? process.argv.slice(2).map(p => resolve(p))
  : readdirSync(here).filter(f => f.endsWith('.test.html')).map(f => join(here, f));

const port = 9300 + Math.floor(Math.random() * 500);
const profile = mkdtempSync(join(tmpdir(), 'mixer-test-'));
const chrome = spawn(findChrome(), [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  '--autoplay-policy=no-user-gesture-required', '--allow-file-access-from-files',
  '--no-first-run', '--mute-audio', 'about:blank'
], { stdio: 'ignore' });

let failed = 0;
try {
  const ws = new WebSocket(await connect(port));
  await new Promise(r => ws.addEventListener('open', r));
  const send = rpc(ws);

  for (const page of pages) {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    await send('Page.navigate', { url: pathToFileURL(page).href }, sessionId);

    let results = null;
    for (let i = 0; i < 300 && !results; i++) {
      await sleep(100);
      const { result } = await send('Runtime.evaluate', {
        expression: 'window.__results ? JSON.stringify(window.__results) : null',
        returnByValue: true
      }, sessionId);
      if (result.value) results = JSON.parse(result.value);
    }
    console.log(`\n${page.replace(here + '/', '')}`);
    if (!results) {
      console.log('  ✗ timed out');
      failed++;
    } else {
      results.forEach(r => {
        console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? '' : `\n      ${r.error}`}`);
        if (!r.ok) failed++;
      });
    }
    await send('Target.closeTarget', { targetId });
  }
  ws.close();
} finally {
  chrome.kill();
  await sleep(200);
  rmSync(profile, { recursive: true, force: true });
}

console.log(failed ? `\n${failed} failed` : '\nAll passed');
process.exit(failed ? 1 : 0);
