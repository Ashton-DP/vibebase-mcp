#!/usr/bin/env node
// vibebase-mcp — lets AI assistants (Claude, Cursor, Windsurf) provision a Vibebase
// backend in one command. Speaks MCP (JSON-RPC 2.0 over stdio). Zero dependencies.
//
// Config (env):
//   VIBEBASE_URL  - your Vibebase server (default https://vibebase.io)
//   VIBEBASE_KEY  - your Vibebase API key (from your dashboard)

import readline from 'node:readline';
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const SERVER = (process.env.VIBEBASE_URL || 'https://vibebase.io').replace(/\/$/, '');
const KEY = process.env.VIBEBASE_KEY || '';
const SERVER_INFO = { name: 'vibebase', version: '0.1.2' };

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
}, {
  name: 'branch_backend',
  description:
    'Create an instant dev/preview branch of an existing backend — a full copy-on-write clone ' +
    'of its data, ready in seconds. Use to get a safe scratch/preview database without touching ' +
    'production. Returns a connection string for the branch.',
  inputSchema: {
    type: 'object',
    properties: {
      ref: { type: 'string', description: 'The backend ref to branch (from provision_backend or the dashboard).' },
      name: { type: 'string', description: 'Optional name for the branch (e.g. "preview", "dev").' },
    },
    required: ['ref'],
  },
}];

async function branch(ref, name) {
  const res = await fetch(`${SERVER}/branch`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(KEY ? { 'x-vibebase-key': KEY } : {}) },
    body: JSON.stringify({ ref, name }),
  });
  if (!res.ok) throw new Error(`Branch failed (${res.status}). ${(await res.text().catch(() => '')) || ''}`);
  return res.json();
}

async function provision(name) {
  const res = await fetch(`${SERVER}/provision`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(KEY ? { 'x-vibebase-key': KEY } : {}) },
    // This MCP installs whatever dep the server specifies (backend.clientDep),
    // so opt into the thin re-export wrapper instead of the inlined file.
    body: JSON.stringify({ name, clientMode: 'package' }),
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

  // Type definitions for TS editor autocomplete + checking, if provided.
  if (backend.typesFile?.code) {
    const tf = path.join(dir, backend.typesFile.path);
    await mkdir(path.dirname(tf), { recursive: true });
    await writeFile(tf, backend.typesFile.code);
  }

  // Declare the dependency the server says this client needs, so the user's
  // normal install picks it up (avoids a "module not found" wall). The server
  // specifies it via backend.clientDep (wrapper mode → vibebase-client); fall
  // back to @neondatabase/serverless for older servers that inline the client.
  const dep = backend.clientDep?.name || '@neondatabase/serverless';
  const range = backend.clientDep?.range || '^1.0.0';
  let depNote = `This client needs ${dep} — run: npm install ${dep}`;
  try {
    const pkgPath = path.join(dir, 'package.json');
    const pkg = JSON.parse(await readFile(pkgPath, 'utf8'));
    pkg.dependencies ||= {};
    if (pkg.dependencies[dep]) {
      depNote = '';
    } else {
      pkg.dependencies[dep] = range;
      await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
      depNote = `Added ${dep} to package.json — run your package install (npm/pnpm/yarn/bun) to fetch it.`;
    }
  } catch { /* no package.json — fall back to the install instruction */ }
  return { clientPath: file.path, depNote };
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
      const args = params?.arguments || {};
      if (params?.name === 'provision_backend') {
        try {
          const targetDir = args.target || process.cwd();
          const backend = await provision(args.name || 'app');
          const { clientPath, depNote } = await writeFiles(targetDir, backend);
          const text = [
            `✓ Backend provisioned for "${args.name}" (${backend.provider}).`,
            `Dashboard: ${backend.dashboardUrl}`,
            `Wrote .env.local and ${clientPath} into ${targetDir}.`,
            depNote ? `⚠ ${depNote}` : '',
            `The app can now use the backend via ${clientPath} (auth, storage, vector, migrate, insertMany).`,
          ].filter(Boolean).join('\n');
          return ok(id, { content: [{ type: 'text', text }] });
        } catch (err) {
          return ok(id, { content: [{ type: 'text', text: `Provisioning failed: ${err.message}` }], isError: true });
        }
      }
      if (params?.name === 'branch_backend') {
        try {
          const b = await branch(args.ref, args.name);
          const text = `✓ Dev branch "${b.name}" of ${b.ref} created.\nConnection string (set as DATABASE_URL for the branch):\n${b.connectionUri}`;
          return ok(id, { content: [{ type: 'text', text }] });
        } catch (err) {
          return ok(id, { content: [{ type: 'text', text: `Branch failed: ${err.message}` }], isError: true });
        }
      }
      return fail(id, -32602, `Unknown tool: ${params?.name}`);
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
