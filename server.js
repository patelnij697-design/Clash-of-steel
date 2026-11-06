import express from 'express';
import path from 'path';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { randomInt } from 'crypto';
import { Server } from 'socket.io';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  maxHttpBufferSize: 100_000,
  pingInterval: 10000,
  pingTimeout: 20000
});
const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';
const MAX_PLAYERS_PER_ROOM = 12;
const MAX_CHAT_LENGTH = 240;
const APPEARANCE_IDS = new Set(['cobalt', 'crimson', 'olive', 'sand', 'violet', 'arctic']);
const rooms = new Map();
let activePlayers = 0;

app.get('/healthz', (_req, res) => res.status(200).send('ok'));
function sendApp(_req, res) {
  res.set('Cache-Control', 'no-store, max-age=0');
  res.sendFile(path.join(__dirname, 'index.html'));
}
app.get(['/', '/index.html'], sendApp);
app.get('*', sendApp);

function makeRoom(id, kind) {
  const room = {
    id,
    kind,
    players: new Map(),
    hostId: null,
    matchConfig: null,
    gameState: null
  };
  rooms.set(id, room);
  return room;
}

function roomSummary(room) {
  return {
    roomCode: room.kind === 'private' ? room.id : null,
    roomKind: room.kind,
    hostId: room.hostId,
    players: [...room.players.values()],
    activePlayers,
    matchConfig: room.matchConfig,
    gameState: room.gameState
  };
}

function sendPresence(room) {
  io.emit('presence', { activePlayers });
  if (room) io.to(room.id).emit('room:presence', { activePlayers: room.players.size });
}

function cleanName(value) {
  const name = typeof value === 'string' ? value.replace(/[<>]/g, '').trim().slice(0, 20) : '';
  return name || `Operator-${randomInt(1000, 10000)}`;
}

function cleanAppearance(value) {
  return APPEARANCE_IDS.has(value) ? value : 'cobalt';
}

function validPlayerState(state) {
  return state && typeof state === 'object'
    && ['x', 'y', 'z', 'yaw', 'health'].every(key => Number.isFinite(state[key]))
    && Math.abs(state.x) <= 1000
    && Math.abs(state.y) <= 200
    && Math.abs(state.z) <= 1000
    && state.health >= 0
    && state.health <= 1000
    && Number.isFinite(state.pitch || 0)
    && Math.abs(state.pitch || 0) <= Math.PI;
}

function rateAllowed(socket, key, minInterval) {
  const now = Date.now();
  const last = socket.data[key] || 0;
  if (now - last < minInterval) return false;
  socket.data[key] = now;
  return true;
}

io.on('connection', socket => {
  sendPresence();

  socket.on('room:join', (request, acknowledge = () => {}) => {
    if (socket.data.roomId) return acknowledge({ error: 'You are already in a room.' });

    const kind = request?.kind;
    if (kind !== 'public' && kind !== 'private') return acknowledge({ error: 'Choose a public or private room.' });

    let room;
    if (kind === 'public') {
      room = rooms.get('public') || makeRoom('public', 'public');
    } else if (request.action === 'create') {
      let code;
      do { code = randomInt(100000, 1000000).toString(); } while (rooms.has(code));
      room = makeRoom(code, 'private');
    } else {
      const code = typeof request.roomCode === 'string' ? request.roomCode.trim().toUpperCase() : '';
      room = rooms.get(code);
      if (!room || room.kind !== 'private') return acknowledge({ error: 'That private room code was not found.' });
    }

    if (room.players.size >= MAX_PLAYERS_PER_ROOM) return acknowledge({ error: 'This room is full.' });

    const teamCounts = [...room.players.values()].reduce((counts, player) => {
      counts[player.team] = (counts[player.team] || 0) + 1;
      return counts;
    }, {});
    const team = kind === 'public' ? (teamCounts[0] || 0) <= (teamCounts[1] || 0) ? 0 : 1 : room.players.size % 2;
    const player = { id: socket.id, name: cleanName(request.name), team, appearance: cleanAppearance(request.appearance) };
    room.players.set(socket.id, player);
    activePlayers++;
    if (!room.hostId) room.hostId = socket.id;
    socket.data.roomId = room.id;
    socket.join(room.id);
    acknowledge({ ...roomSummary(room), player });
    socket.to(room.id).emit('player:joined', player);
    sendPresence(room);
  });

  socket.on('player:state', state => {
    const room = rooms.get(socket.data.roomId);
    if (!room || !validPlayerState(state) || !rateAllowed(socket, 'lastPlayerState', 40)) return;
    const player = room.players.get(socket.id);
    if (!player) return;
    const safeState = {
      x: state.x,
      y: state.y,
      z: state.z,
      yaw: state.yaw,
      pitch: state.pitch || 0,
      health: state.health,
      shield: Number.isFinite(state.shield) ? Math.max(0, Math.min(50, state.shield)) : 0,
      vehicle: typeof state.vehicle === 'string' ? state.vehicle.slice(0, 12) : null,
      vehicleId: typeof state.vehicleId === 'string' ? state.vehicleId.slice(0, 32) : null,
      vehicleYaw: Number.isFinite(state.vehicleYaw) ? state.vehicleYaw : 0,
      maxHealth: Number.isFinite(state.maxHealth) ? Math.max(1, Math.min(1000, state.maxHealth)) : 100,
      hasAmmo: state.hasAmmo === true,
      boostActive: state.boostActive === true
    };
    player.state = safeState;
    socket.to(room.id).emit('player:state', { id: socket.id, ...safeState });
  });

  socket.on('player:profile', profile => {
    const room = rooms.get(socket.data.roomId);
    const player = room && room.players.get(socket.id);
    if (!player || !profile || typeof profile !== 'object') return;
    player.name = cleanName(profile.name);
    player.appearance = cleanAppearance(profile.appearance);
    socket.to(room.id).emit('player:profile', { id: socket.id, name: player.name, appearance: player.appearance });
  });

  socket.on('match:start', config => {
    const room = rooms.get(socket.data.roomId);
    if (!room || room.hostId !== socket.id || !config || !['tdm', 'ffa', 'ctf'].includes(config.mode)) return;
    room.matchConfig = { mode: config.mode, difficulty: Math.max(0, Math.min(2, Number(config.difficulty) || 0)) };
    room.gameState = null;
    io.to(room.id).emit('match:start', room.matchConfig);
  });

  socket.on('match:end', result => {
    const room = rooms.get(socket.data.roomId);
    if (room && room.hostId === socket.id && Number.isInteger(result?.winnerTeam)) {
      io.to(room.id).emit('match:end', { winnerTeam: result.winnerTeam });
    }
  });

  socket.on('game:state', state => {
    const room = rooms.get(socket.data.roomId);
    if (!room || room.hostId !== socket.id || !state || typeof state !== 'object' || !rateAllowed(socket, 'lastGameState', 80)) return;
    room.gameState = state;
    socket.to(room.id).emit('game:state', state);
  });

  socket.on('combat:action', action => {
    const room = rooms.get(socket.data.roomId);
    if (!room || room.hostId === socket.id || !action || typeof action !== 'object' || !rateAllowed(socket, 'lastCombatAction', 60)) return;
    const vector = [action.x, action.y, action.z, action.dx, action.dy, action.dz];
    if (!vector.every(Number.isFinite) || vector.some(value => Math.abs(value) > 1000)) return;
    if (action.kind === 'shot') {
      if (!Number.isFinite(action.damage) || action.damage < 0 || action.damage > 1000) return;
    } else if (action.kind === 'missile') {
      if (!['at', 'aa', 'agm', 'sam'].includes(action.missileType)) return;
      if (action.targetId != null && typeof action.targetId !== 'string') return;
    } else {
      return;
    }
    io.to(room.hostId).emit('combat:action', { playerId: socket.id, ...action });
  });

  socket.on('player:damage', damage => {
    const room = rooms.get(socket.data.roomId);
    if (!room || room.hostId !== socket.id || !damage || typeof damage.id !== 'string'
      || !Number.isFinite(damage.amount) || damage.amount <= 0 || damage.amount > 1000) return;
    const target = room.players.get(damage.id);
    if (target) {
      const source = Number.isFinite(damage.sourceX) && Math.abs(damage.sourceX) <= 1000
        && Number.isFinite(damage.sourceZ) && Math.abs(damage.sourceZ) <= 1000
        ? { sourceX: damage.sourceX, sourceZ: damage.sourceZ }
        : {};
      io.to(damage.id).emit('player:damage', {
        amount: damage.amount,
        attacker: cleanName(damage.attacker),
        ...source
      });
    }
  });

  socket.on('player:effect', effect => {
    const room = rooms.get(socket.data.roomId);
    if (!room || room.hostId !== socket.id || !effect || typeof effect.id !== 'string'
      || !['med', 'shield', 'ammo', 'repair', 'boost'].includes(effect.type)) return;
    const target = room.players.get(effect.id);
    if (target) io.to(effect.id).emit('player:effect', { type: effect.type, amount: effect.amount });
  });

  socket.on('player:vehicle-denied', id => {
    const room = rooms.get(socket.data.roomId);
    if (room && room.hostId === socket.id && typeof id === 'string' && room.players.has(id)) {
      io.to(id).emit('player:vehicle-denied');
    }
  });

  socket.on('world:pickup', request => {
    const room = rooms.get(socket.data.roomId);
    if (!room || room.hostId === socket.id || !Number.isInteger(request?.index)
      || request.index < 0 || request.index > 100 || !rateAllowed(socket, 'lastPickupRequest', 300)) return;
    io.to(room.hostId).emit('world:pickup', { playerId: socket.id, index: request.index });
  });

  socket.on('chat:message', value => {
    const room = rooms.get(socket.data.roomId);
    if (!room || !rateAllowed(socket, 'lastChatMessage', 500)) return;
    const player = room.players.get(socket.id);
    const text = typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, MAX_CHAT_LENGTH) : '';
    if (!player || !text) return;
    io.to(room.id).emit('chat:message', { id: socket.id, name: player.name, text, time: Date.now() });
  });

  socket.on('disconnect', () => {
    leaveRoom(socket);
    sendPresence();
  });
});

function leaveRoom(socket) {
  const room = rooms.get(socket.data.roomId);
  if (!room) return;
  room.players.delete(socket.id);
  activePlayers = Math.max(0, activePlayers - 1);
  if (room.hostId === socket.id) {
    room.hostId = room.players.keys().next().value || null;
    if (room.hostId) {
      io.to(room.hostId).emit('host:changed', {
        matchConfig: room.matchConfig,
        gameState: room.gameState
      });
    }
  }
  socket.to(room.id).emit('player:left', { id: socket.id, hostId: room.hostId });
  if (!room.players.size) {
    rooms.delete(room.id);
    io.emit('presence', { activePlayers });
  } else {
    sendPresence(room);
  }
  socket.leave(room.id);
  socket.data.roomId = null;
}

io.on('connection', socket => {
  socket.on('room:leave', () => leaveRoom(socket));
});

httpServer.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}`);
});
