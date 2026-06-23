#!/usr/bin/env node
// vibebase-mcp — lets AI assistants (Claude, Cursor, Windsurf) provision a Vibebase
// backend in one command. Speaks MCP (JSON-RPC 2.0 over stdio). Zero dependencies.
//
// Config (env):
//   VIBEBASE_URL  - your Vibebase server (default https://vibebase.io)
//   VIBEBASE_KEY  - your Vibebase API key (from your dashboard)

import readline from 'node:readline';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const SERVER = (process.env.VIBEBASE_URL || 'https://vibebase.io').replace(/\/$/, '');
const KEY = process.env.VIBEBASE_KEY || '';
const SERVER_INFO = { name: 'vibebase', version: '0.1.0' };

const TOOLS = [{
  name: 'provision_backend',
  description:
    'Provision a hosted backend (Postgres database + email/password auth) for the current app ' +
    'and wire it in. Writes .env.local and a client file into the target project so the app can ' +
    'immediately store data and log users in. Use whenever the user needs a database, ' +
    'authentication, or a backend for an app they are building.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'A name for the project/backend.' },
      target: { type: 'string', description: 'Absolute path to the app folder to wire up. Defaults to the current working directory.' },
    },
    required: ['name'],
  },
}];

async function provision(name) {
  const res = await fetch(`${SERVER}/provision`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(KEY ? { 'x-vibebase-key': KEY } : {}) },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Provision failed (${res.status}). ${body || 'Check VIBEBASE_URL and VIBEBASE_KEY.'}`);
  }
  return res.json();
}

async function writeFiles(dir, backend) {
  const header = `# Vibebase backend (${backend.provider}) — provisioned ${new Date().toISOString()}`;
  const env = [header, ...Object.entries(backend.env || {}).map(([k, v]) => `${k}=${v}`), ''].join('\n');
  await writeFile(path.join(dir, '.env.local'), env);
  const file = backend.clientFile || { path: 'lib/vibebase.js', code: '' };
  const full = path.join(dir, file.path);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, file.code);
  return file.path;
}

const logErr = (...a) => process.stderr.write(a.join(' ') + '\n');
const send = (m) => process.stdout.write(JSON.stringify(m) + '\n');
const ok = (id, result) => send({ jsonrpc: '2.0', id, result });
const fail = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });

async function handle(msg) {
  const { id, method, params } = msg;
  if (id === undefined || id === null) return; // notification

  switch (method) {
    case 'initialize':
      return ok(id, { protocolVersion: params?.protocolVersion || '2025-06-18', capabilities: { tools: {} }, serverInfo: SERVER_INFO });
    case 'ping':
      return ok(id, {});
    case 'tools/list':
      return ok(id, { tools: TOOLS });
    case 'tools/call': {
      if (params?.name !== 'provision_backend') return fail(id, -32602, `Unknown tool: ${params?.name}`);
      const args = params.arguments || {};
      try {
        const targetDir = args.target || process.cwd();
        const backend = await provision(args.name || 'app');
        const clientPath = await writeFiles(targetDir, backend);
        const text = [
          `✓ Backend provisioned for "${args.name}" (${backend.provider}).`,
          `Dashboard: ${backend.dashboardUrl}`,
          `Wrote .env.local and ${clientPath} into ${targetDir}.`,
          `The app can now use the backend via ${clientPath}.`,
        ].join('\n');
        return ok(id, { content: [{ type: 'text', text }] });
      } catch (err) {
        return ok(id, { content: [{ type: 'text', text: `Provisioning failed: ${err.message}` }], isError: true });
      }
    }
    default:
      return fail(id, -32601, `Method not found: ${method}`);
  }
}

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  const t = line.trim();
  if (!t) return;
  let msg;
  try { msg = JSON.parse(t); } catch { return logErr('parse error:', t); }
  Promise.resolve(handle(msg)).catch((e) => logErr('handler error:', e.message));
});
logErr(`vibebase-mcp ready (server: ${SERVER})`);
