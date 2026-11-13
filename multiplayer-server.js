#!/usr/bin/env node
/* IISER Thiruvananthapuram — Zero-Dependency HTTP + 8-Player WebSocket Server
 * Usage: node multiplayer-server.js [port]   (default port: 8765)
 * Serves static campus simulator assets AND hosts up-to-8-player WebSocket rooms on /ws. */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = parseInt(process.env.PORT || process.argv[2] || '8765', 10);
const ROOT = __dirname;
const MAX_PLAYERS_PER_ROOM = 8;
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const os = require('os');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.glb':  'model/gltf-binary',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon'
};

// Room registry: roomCode -> Map<playerId, ClientInfo>
const rooms = new Map();

function encodeWsText(str) {
  const payload = Buffer.from(str, 'utf8');
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81;
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

function sendJson(client, obj) {
  if (!client || client.closed || !client.socket || client.socket.destroyed) return;
  try {
    client.socket.write(encodeWsText(JSON.stringify(obj)));
  } catch (_) {}
}

function broadcastRoom(roomCode, obj, excludeId) {
  const rm = rooms.get(roomCode);
  if (!rm) return;
  const frame = encodeWsText(JSON.stringify(obj));
  for (const [pid, cl] of rm.entries()) {
    if (pid === excludeId || cl.closed || cl.socket.destroyed) continue;
    try { cl.socket.write(frame); } catch (_) {}
  }
}

function buildRoster(roomCode) {
  const rm = rooms.get(roomCode);
  if (!rm) return [];
  const list = [];
  for (const cl of rm.values()) {
    list.push({
      id: cl.id,
      slot: cl.slot,
      name: cl.name,
      fleet: cl.fleet,
      colorIdx: cl.colorIdx,
      score: cl.score || 0,
      mode: cl.mode || 'shuttle',
      x: cl.x || 197.5,
      y: cl.y || 105,
      z: cl.z || 534.0,
      heading: cl.heading || 0.48
    });
  }
  return list;
}

function removeClient(client) {
  if (!client || client.closed) return;
  client.closed = true;
  const rm = rooms.get(client.room);
  if (rm) {
    rm.delete(client.id);
    if (rm.size === 0) {
      rooms.delete(client.room);
    } else {
      broadcastRoom(client.room, {
        type: 'roster',
        room: client.room,
        players: buildRoster(client.room)
      });
      broadcastRoom(client.room, { type: 'leave', id: client.id });
    }
  }
  try { client.socket.destroy(); } catch (_) {}
}

function handleWsMessage(client, rawText) {
  let msg;
  try { msg = JSON.parse(rawText); } catch (_) { return; }
  if (!msg || typeof msg.type !== 'string') return;

  if (msg.type === 'join') {
    const requestedRoom = String(msg.room || 'IISER-1').trim().toUpperCase().slice(0, 18) || 'IISER-1';
    if (client.room && client.room !== requestedRoom) {
      const prev = rooms.get(client.room);
      if (prev) {
        prev.delete(client.id);
        broadcastRoom(client.room, { type: 'leave', id: client.id });
      }
    }
    let rm = rooms.get(requestedRoom);
    if (!rm) {
      rm = new Map();
      rooms.set(requestedRoom, rm);
    }
    if (!rm.has(client.id) && rm.size >= MAX_PLAYERS_PER_ROOM) {
      sendJson(client, {
        type: 'roomFull',
        room: requestedRoom,
        maxPlayers: MAX_PLAYERS_PER_ROOM
      });
      return;
    }

    // Assign lowest free slot 0..7
    const usedSlots = new Set();
    for (const c of rm.values()) {
      if (c.id !== client.id) usedSlots.add(c.slot);
    }
    let slot = 0;
    while (usedSlots.has(slot) && slot < MAX_PLAYERS_PER_ROOM) slot++;

    client.room = requestedRoom;
    client.slot = slot;
    client.name = String(msg.name || ('Driver ' + (slot + 1))).slice(0, 18);
    client.fleet = String(msg.fleet || 'transit');
    client.colorIdx = typeof msg.colorIdx === 'number' ? msg.colorIdx : slot;
    client.mode = String(msg.mode || 'shuttle');
    rm.set(client.id, client);

    sendJson(client, {
      type: 'welcome',
      id: client.id,
      slot: client.slot,
      room: requestedRoom,
      maxPlayers: MAX_PLAYERS_PER_ROOM,
      players: buildRoster(requestedRoom)
    });
    broadcastRoom(requestedRoom, {
      type: 'roster',
      room: requestedRoom,
      players: buildRoster(requestedRoom)
    });
    return;
  }

  if (!client.room) return;

  if (msg.type === 'state') {
    client.x = +msg.x || 0;
    client.y = +msg.y || 0;
    client.z = +msg.z || 0;
    client.heading = +msg.heading || 0;
    client.score = +msg.score || 0;
    if (msg.name) client.name = String(msg.name).slice(0, 18);
    if (msg.fleet) client.fleet = String(msg.fleet);
    if (typeof msg.colorIdx === 'number') client.colorIdx = msg.colorIdx;
    if (msg.mode) client.mode = String(msg.mode);

    broadcastRoom(client.room, {
      type: 'state',
      id: client.id,
      slot: client.slot,
      name: client.name,
      fleet: client.fleet,
      colorIdx: client.colorIdx,
      mode: client.mode,
      x: client.x,
      y: client.y,
      z: client.z,
      heading: client.heading,
      pitch: +msg.pitch || 0,
      roll: +msg.roll || 0,
      speed: +msg.speed || 0,
      steer: +msg.steer || 0,
      doorOpen: +msg.doorOpen || 0,
      blinker: +msg.blinker || 0,
      braking: !!msg.braking,
      score: client.score,
      progress: +msg.progress || 0,
      ts: +msg.ts || Date.now()
    }, client.id);
  } else if (msg.type === 'horn' || msg.type === 'modeStart' || msg.type === 'chase') {
    // 'chase' carries the rider/chaser round state, catches, votes and results.
    broadcastRoom(client.room, Object.assign({}, msg, { id: client.id, name: client.name }), client.id);
  } else if (msg.type === 'ping') {
    sendJson(client, { type: 'pong', ts: msg.ts });
  }
}

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size, maxPlayersPerRoom: MAX_PLAYERS_PER_ROOM }));
    return;
  }

  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const fullPath = path.resolve(ROOT, rel);
  if (!fullPath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(fullPath, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(fullPath).toLowerCase();
    const headers = {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    };
    if (rel === 'index.html') {
      headers['Set-Cookie'] = 'iiser_ws=1; Path=/; SameSite=Lax';
    }
    res.writeHead(200, headers);
    fs.createReadStream(fullPath).pipe(res);
  });
});

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key) {
    socket.destroy();
    return;
  }
  const accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    'Sec-WebSocket-Accept: ' + accept + '\r\n\r\n'
  );
  socket.setNoDelay(true);

  const client = {
    id: 'p_' + crypto.randomBytes(5).toString('hex'),
    socket,
    room: null,
    slot: 0,
    name: 'Driver',
    fleet: 'transit',
    colorIdx: 0,
    closed: false
  };

  let buffer = Buffer.alloc(0);
  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 2) {
      const b0 = buffer[0];
      const b1 = buffer[1];
      const opcode = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f;
      let offset = 2;

      if (len === 126) {
        if (buffer.length < 4) return;
        len = buffer.readUInt16BE(2);
        offset = 4;
      } else if (len === 127) {
        if (buffer.length < 10) return;
        len = Number(buffer.readBigUInt64BE(2));
        offset = 10;
      }
      const maskBytes = masked ? 4 : 0;
      if (buffer.length < offset + maskBytes + len) return;

      const payload = Buffer.from(buffer.subarray(offset + maskBytes, offset + maskBytes + len));
      if (masked) {
        const mask = buffer.subarray(offset, offset + 4);
        for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      }
      buffer = buffer.subarray(offset + maskBytes + len);

      if (opcode === 0x8) {
        removeClient(client);
        return;
      } else if (opcode === 0x9) {
        // Ping -> Pong
        try { socket.write(Buffer.concat([Buffer.from([0x8a, payload.length]), payload])); } catch (_) {}
      } else if (opcode === 0x1) {
        handleWsMessage(client, payload.toString('utf8'));
      }
    }
  });

  socket.on('close', () => removeClient(client));
  socket.on('error', () => removeClient(client));
});

server.listen(PORT, () => {
  console.log(`[IISER-TVM 8P Server] http://localhost:${PORT}  |  WebSocket ws://localhost:${PORT}/ws (max ${MAX_PLAYERS_PER_ROOM} players/room)`);
  const lanIps = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list || []) {
      if (ni.family === 'IPv4' && !ni.internal) lanIps.push(ni.address);
    }
  }
  if (lanIps.length) {
    console.log('[Same Wi-Fi] share one of these with your friends:');
    for (const ip of lanIps) console.log(`  http://${ip}:${PORT}`);
  }
  console.log(`[Over internet] run: cloudflared tunnel --url http://localhost:${PORT}   then share the printed https URL`);
});
