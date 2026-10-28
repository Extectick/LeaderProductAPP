#!/usr/bin/env node
// Metro/Hermes inspection, without desktop or browser automation. Node 22+.
import { readFile, writeFile } from 'node:fs/promises';
import WebSocket from 'ws';

const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; };
const port = Number(option('--port', '8100'));
const app = option('--app', 'com.leaderproduct.app.dev');
const command = option('--action', '');
const input = option('--value', undefined);
const output = option('--out', '');
const stepsFile = option('--steps', '');
const waitMs = Number(option('--wait', '350'));
// Hermes CDP's UTF-8 bridge rejects raw surrogate pairs in source expressions.
// Keep emoji/non-ASCII values as JS escapes; native IME still receives Unicode.
const jsValue = value => JSON.stringify(value)?.replace(/[^\x20-\x7e]/g, char => `\\u${char.charCodeAt(0).toString(16).padStart(4,'0')}`) ?? 'undefined';
if (!Number.isInteger(port) || port < 1 || port > 65535 || !Number.isFinite(waitMs) || waitMs < 0 || waitMs > 5000) throw new Error('Invalid port/wait');
let matches = [];
for (let attempt=0;attempt<40;attempt++) {
  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(5000) })).json();
  matches = pages.filter(page => page.title?.includes(app));
  if (matches.length) break;
  await new Promise(resolve=>setTimeout(resolve,250));
}
if (matches.length !== 1) throw new Error(`Expected one Hermes target for ${app}; found ${matches.length}. Check adb and Metro port.`);
const ws = new WebSocket(matches[0].webSocketDebuggerUrl, { origin: `http://127.0.0.1:${port}` });
const pending = new Map();
let sequence = 0;
ws.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id); clearTimeout(request.timer);
  if (message.error) request.reject(new Error(`${message.error.code}: ${message.error.message} ${JSON.stringify(message.error.data ?? '')}`)); else request.resolve(message.result);
});
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('Hermes connection timeout')), 5000);
  ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
  ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Hermes connection failed')); }, { once: true });
});
async function request(method, params = {}) {
  const id = ++sequence;
  const result = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('Hermes request timeout')); }, 5000);
    pending.set(id, { resolve, reject, timer });
    ws.send(JSON.stringify({ id, method, params }));
  });
  return result;
}
async function evaluate(expression) {
  const result = await request('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result?.value;
}
// RN's Promise polyfill is not unwrapped by CDP awaitPromise. Resolve inside
// Hermes and read a short-lived result slot instead of returning that polyfill.
async function evaluateAsync(expression) {
  const key=JSON.stringify(`__helpInspectorResult_${process.pid}_${++sequence}`);
  try {
    await evaluate(`globalThis[${key}]={ready:false}; Promise.resolve(${expression}).then(value=>{if(globalThis[${key}])globalThis[${key}]={ready:true,value};},error=>{if(globalThis[${key}])globalThis[${key}]={ready:true,error:String(error)};}); true`);
    const deadline=Date.now()+10000;
    while(Date.now()<deadline) {
      const result=await evaluate(`globalThis[${key}]`);
      if(result?.ready) { if(result.error)throw new Error(result.error);return result.value; }
      await new Promise(resolve=>setTimeout(resolve,50));
    }
    throw new Error('Help snapshot did not settle');
  } finally { await evaluate(`delete globalThis[${key}]`); }
}
async function act(bridge, name, value) {
  // The bridge module loads before React mounts the screen's command handlers.
  for(let attempt=0;attempt<30;attempt++) {
    if(await evaluateAsync(`${bridge}.snapshot().then(s=>s.actions.includes(${jsValue(name)}))`)) {
      return evaluateAsync(`${bridge}.act(${jsValue(name)}, ${jsValue(value)})`);
    }
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  throw new Error(`Help QA action is not mounted: ${name}`);
}
async function requireForeground(bridge) {
  const state = await evaluate(`${bridge}.appState?.()`);
  if (state && state !== 'active') throw new Error(`The DEV app is ${state}. Bring it to the foreground before native layout measurements.`);
}
try {
  const bridge = 'globalThis.__LEADER_HELP_DEV__';
  let ready=false;
  for(let attempt=0;attempt<20&&!ready;attempt++) {
    ready=Boolean(await evaluate(`Boolean(${bridge})`));
    if(!ready)await new Promise(resolve=>setTimeout(resolve,100));
  }
  if (!ready) throw new Error('Open the Help screen in the current development bundle first.');
  await requireForeground(bridge);
  let data;
  if (stepsFile) {
    if (command) throw new Error('Use either --steps or --action');
    const steps = JSON.parse(await readFile(stepsFile, 'utf8'));
    if (!Array.isArray(steps) || steps.length > 100) throw new Error('Expected at most 100 QA steps');
    data = [];
    for (const step of steps) {
      await requireForeground(bridge);
      const delay = step.wait ?? waitMs;
      if (!Number.isFinite(delay) || delay < 0 || delay > 5000) throw new Error('Invalid step wait');
      if (step.action) await act(bridge,step.action,step.value);
      await new Promise(resolve => setTimeout(resolve, delay));
      if (step.snapshot) {
        data.push({name:step.snapshot,...await evaluateAsync(`${bridge}.snapshot()`)});
        // Keep completed measurements if Fast Refresh replaces Hermes mid-run.
        if(output)await writeFile(output, `${JSON.stringify(data,null,2)}\n`);
      }
    }
  } else {
    if (command) {
      await act(bridge,command,input);
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }
    data = await evaluateAsync(`${bridge}.snapshot()`);
  }
  const json = JSON.stringify(data, null, 2);
  if (output) await writeFile(output, `${json}\n`);
  else process.stdout.write(`${json}\n`);
} finally { ws.close(); }
