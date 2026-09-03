#!/usr/bin/env node
/* Cartographer's Table LAN host.
   Serves the built app from dist/ and relays WebSocket messages between one
   DM (host) and the players in each room. Run with `npm run host`.
   The relay holds no game state; it only forwards messages. */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT || 8080);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const ROOM_LINGER_MS = 10 * 60 * 1000; // keep a room this long after its host drops, for reconnects

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.map': 'application/json',
};

if (!fs.existsSync(path.join(ROOT, 'index.html'))) {
  console.error('dist/ not found. Run `npm run host` (which builds first) or `npm run build`.');
  process.exit(1);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/relay-info') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ relay: true, rooms: rooms.size }));
    return;
  }
  let file = path.join(ROOT, path.normalize(url.pathname).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(ROOT, 'index.html');
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
});

/* ---------- rooms ---------- */

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const rooms = new Map(); // code -> { host: ws|null, peers: Map<peerId, ws>, timer }
let nextPeer = 1;

function newCode() {
  for (;;) {
    let s = '';
    for (let i = 0; i < 4; i++) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    if (!rooms.has(s)) return s;
  }
}
function send(ws, msg) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); }

const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', (ws) => {
  let role = null, room = null, peerId = null;
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (!role) {
      if (msg.type === 'host') {
        const code = (msg.code && rooms.has(msg.code)) ? msg.code : newCode();
        room = rooms.get(code) || { code, host: null, peers: new Map(), timer: null };
        rooms.set(code, room);
        if (room.timer) { clearTimeout(room.timer); room.timer = null; }
        if (room.host && room.host !== ws) { try { room.host.close(); } catch { /* ignore */ } }
        const returning = !!msg.code && rooms.has(msg.code);
        room.host = ws; role = 'host';
        send(ws, { type: 'hosted', code });
        for (const id of room.peers.keys()) send(ws, { type: 'peer-joined', peerId: id });
        if (returning) for (const p of room.peers.values()) send(p, { type: 'host-back' });
        console.log(`[room ${code}] host connected (${room.peers.size} players waiting)`);
      } else if (msg.type === 'join') {
        room = rooms.get(String(msg.code || '').toUpperCase());
        if (!room) { send(ws, { type: 'no-room' }); ws.close(); return; }
        role = 'player'; peerId = 'p' + (nextPeer++);
        room.peers.set(peerId, ws);
        send(ws, { type: 'joined', peerId, hostPresent: !!room.host });
        send(room.host, { type: 'peer-joined', peerId });
        console.log(`[room ${room.code}] player ${peerId} joined`);
      }
      return;
    }
    if (role === 'player') {
      send(room.host, { type: 'from', peerId, msg: msg.msg ?? msg });
    } else if (role === 'host') {
      if (msg.type === 'to') send(room.peers.get(msg.peerId), { type: 'msg', msg: msg.msg });
      else if (msg.type === 'broadcast') for (const p of room.peers.values()) send(p, { type: 'msg', msg: msg.msg });
    }
  });
  ws.on('close', () => {
    if (!room) return;
    if (role === 'player') {
      room.peers.delete(peerId);
      send(room.host, { type: 'peer-left', peerId });
      console.log(`[room ${room.code}] player ${peerId} left`);
    } else if (role === 'host' && room.host === ws) {
      room.host = null;
      for (const p of room.peers.values()) send(p, { type: 'host-left' });
      console.log(`[room ${room.code}] host disconnected; keeping room for ${ROOM_LINGER_MS / 60000} min`);
      room.timer = setTimeout(() => {
        for (const p of room.peers.values()) { try { p.close(); } catch { /* ignore */ } }
        rooms.delete(room.code);
        console.log(`[room ${room.code}] closed`);
      }, ROOM_LINGER_MS);
    }
  });
});

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) if (i.family === 'IPv4' && !i.internal) out.push(i.address);
  }
  return out;
}

server.listen(PORT, () => {
  console.log('');
  console.log("  Cartographer's Table is hosting.");
  console.log('');
  console.log(`  DM:       http://localhost:${PORT}/`);
  for (const ip of lanAddresses()) console.log(`  Players:  http://${ip}:${PORT}/#/join`);
  console.log('');
  console.log('  Start a session from the Session tab to get a room code. Ctrl+C stops the server.');
  console.log('');
});
