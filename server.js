import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { randomInt, randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { Server } from 'socket.io';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
app.use(express.json());
const httpServer = createServer(app);
const io = new Server(httpServer, {
  maxHttpBufferSize: 100_000,
  pingInterval: 10000,
  pingTimeout: 20000
});
const PORT = (process.env.PORT && process.env.PORT !== '8080') ? Number(process.env.PORT) : 3000;
const HOST = '0.0.0.0';
const DEV_PANEL_KEY = process.env.DEV_PANEL_KEY || '';
const MAX_PLAYERS_PER_ROOM = 12;
const MAX_CHAT_LENGTH = 240;
const APPEARANCE_IDS = new Set([
  'cobalt', 'crimson', 'olive', 'sand', 'violet', 'arctic',
  'woodland', 'desert', 'slate', 'midnight', 'copper', 'teal'
]);
const rooms = new Map();
let activePlayers = 0;

/* -------------------------------------------------------------------------
   PERSISTENT USER ACCOUNTS & LEADERBOARD STORAGE
   ------------------------------------------------------------------------- */
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const defaultLeaderboard = [
  { username: 'Viper-Lead', kills: 342, deaths: 89, assists: 114, wins: 38, matches: 45, flagsCaptured: 24, combatScore: 47990, operatorLevel: 48, appearance: 'cobalt' },
  { username: 'GhostOperator', kills: 289, deaths: 74, assists: 92, wins: 32, matches: 40, flagsCaptured: 19, combatScore: 40970, operatorLevel: 41, appearance: 'arctic' },
  { username: 'Ironclad_99', kills: 231, deaths: 98, assists: 105, wins: 24, matches: 35, flagsCaptured: 15, combatScore: 35025, operatorLevel: 36, appearance: 'olive' },
  { username: 'ReaperActual', kills: 184, deaths: 62, assists: 67, wins: 20, matches: 28, flagsCaptured: 12, combatScore: 27545, operatorLevel: 28, appearance: 'crimson' },
  { username: 'ShadowStalker', kills: 146, deaths: 55, assists: 48, wins: 15, matches: 22, flagsCaptured: 8, combatScore: 21230, operatorLevel: 22, appearance: 'sand' }
];

const users = new Map();
try {
  if (fs.existsSync(USERS_FILE)) {
    const raw = fs.readFileSync(USERS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    for (const [k, v] of Object.entries(parsed)) {
      users.set(k.toLowerCase(), v);
    }
  }
} catch (e) {
  console.error('Error loading users.json:', e);
}

function saveUsers() {
  try {
    const obj = {};
    for (const [k, v] of users.entries()) {
      obj[k] = v;
    }
    fs.writeFileSync(USERS_FILE, JSON.stringify(obj, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving users.json:', err);
  }
}

if (users.size === 0) {
  for (const bot of defaultLeaderboard) {
    const salt = randomBytes(16).toString('hex');
    const hash = scryptSync('operator_bot_pass', salt, 64).toString('hex');
    users.set(bot.username.toLowerCase(), {
      username: bot.username,
      passwordHash: `${salt}:${hash}`,
      createdAt: Date.now() - 86400000,
      stats: {
        kills: bot.kills,
        deaths: bot.deaths,
        assists: bot.assists,
        wins: bot.wins,
        matches: bot.matches,
        flagsCaptured: bot.flagsCaptured,
        combatScore: bot.combatScore,
        operatorLevel: bot.operatorLevel,
        appearance: bot.appearance
      }
    });
  }
  saveUsers();
}

const activeSessions = new Map();

function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  try {
    const [salt, key] = storedHash.split(':');
    if (!salt || !key) return false;
    const hashedBuffer = scryptSync(password, salt, 64);
    const keyBuffer = Buffer.from(key, 'hex');
    return timingSafeEqual(hashedBuffer, keyBuffer);
  } catch {
    return false;
  }
}

function getAuthUser(req) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : req.body?.token;
  if (!token || !activeSessions.has(token)) return null;
  const usernameKey = activeSessions.get(token);
  return users.get(usernameKey) || null;
}

/* -------------------------------------------------------------------------
   REST API ROUTES
   ------------------------------------------------------------------------- */
app.get('/healthz', (_req, res) => res.status(200).send('ok'));

app.post('/api/auth/register', (req, res) => {
  const username = (req.body?.username || '').trim();
  const password = req.body?.password || '';
  if (!username || username.length < 3 || username.length > 20 || !/^[\p{L}\p{N} _.-]+$/u.test(username)) {
    return res.status(400).json({ error: 'Username must be 3-20 characters (letters, numbers, underscores).' });
  }
  if (!password || password.length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters long.' });
  }
  const key = username.toLowerCase();
  if (users.has(key)) {
    return res.status(400).json({ error: 'Username is already taken. Please choose another.' });
  }
  const user = {
    username,
    passwordHash: hashPassword(password),
    createdAt: Date.now(),
    stats: {
      kills: 0,
      deaths: 0,
      assists: 0,
      wins: 0,
      matches: 0,
      flagsCaptured: 0,
      combatScore: 0,
      operatorLevel: 1,
      appearance: 'cobalt'
    }
  };
  users.set(key, user);
  saveUsers();

  const token = randomBytes(32).toString('hex');
  activeSessions.set(token, key);
  res.json({ ok: true, token, user: { username: user.username, stats: user.stats } });
});

app.post('/api/auth/login', (req, res) => {
  const username = (req.body?.username || '').trim();
  const password = req.body?.password || '';
  const key = username.toLowerCase();
  const user = users.get(key);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return res.status(401).json({ error: 'Invalid username or password.' });
  }
  const token = randomBytes(32).toString('hex');
  activeSessions.set(token, key);
  res.json({ ok: true, token, user: { username: user.username, stats: user.stats } });
});

app.get('/api/auth/me', (req, res) => {
  const user = getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated.' });
  res.json({ ok: true, user: { username: user.username, stats: user.stats } });
});

app.post('/api/auth/logout', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : req.body?.token;
  if (token) activeSessions.delete(token);
  res.json({ ok: true });
});

app.post('/api/stats/sync', (req, res) => {
  const user = getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated.' });
  const { kills = 0, deaths = 0, assists = 0, wins = 0, matches = 0, flagsCaptured = 0, appearance } = req.body || {};
  user.stats.kills = Math.max(user.stats.kills, Number(kills) || 0);
  user.stats.deaths = Math.max(user.stats.deaths, Number(deaths) || 0);
  user.stats.assists = Math.max(user.stats.assists, Number(assists) || 0);
  user.stats.wins = Math.max(user.stats.wins, Number(wins) || 0);
  user.stats.matches = Math.max(user.stats.matches, Number(matches) || 0);
  user.stats.flagsCaptured = Math.max(user.stats.flagsCaptured, Number(flagsCaptured) || 0);
  if (appearance && APPEARANCE_IDS.has(appearance)) {
    user.stats.appearance = appearance;
  }
  user.stats.combatScore = (user.stats.kills * 100) + (user.stats.assists * 35) + (user.stats.wins * 250) + (user.stats.flagsCaptured * 150);
  user.stats.operatorLevel = Math.max(1, Math.min(50, Math.floor(user.stats.combatScore / 1000) + 1));
  saveUsers();
  res.json({ ok: true, stats: user.stats });
});

app.get('/api/leaderboard', (_req, res) => {
  const allUsers = [...users.values()].map(u => {
    const kd = u.stats.deaths > 0 ? (u.stats.kills / u.stats.deaths).toFixed(2) : u.stats.kills.toFixed(2);
    const winRate = u.stats.matches > 0 ? Math.round((u.stats.wins / u.stats.matches) * 100) : 0;
    return {
      username: u.username,
      combatScore: u.stats.combatScore || 0,
      operatorLevel: u.stats.operatorLevel || 1,
      kills: u.stats.kills || 0,
      deaths: u.stats.deaths || 0,
      assists: u.stats.assists || 0,
      wins: u.stats.wins || 0,
      matches: u.stats.matches || 0,
      flagsCaptured: u.stats.flagsCaptured || 0,
      kd: Number(kd),
      winRate,
      appearance: u.stats.appearance || 'cobalt'
    };
  });
  allUsers.sort((a, b) => b.combatScore - a.combatScore);
  const ranked = allUsers.slice(0, 50).map((item, index) => ({ rank: index + 1, ...item }));
  res.json({ ok: true, leaderboard: ranked });
});

app.post('/api/dev/verify', (req, res) => {
  const password = String(req.body?.password || '').trim();
  if (!DEV_PANEL_KEY) {
    return res.status(503).json({ ok: false, error: 'Developer panel is not configured.' });
  }
  const providedKey = Buffer.from(password);
  const configuredKey = Buffer.from(DEV_PANEL_KEY);
  if (providedKey.length === configuredKey.length && timingSafeEqual(providedKey, configuredKey)) {
    res.json({ ok: true, authorized: true });
  } else {
    res.status(403).json({ ok: false, error: 'Access Denied: Invalid Keycode' });
  }
});

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
    gameState: null,
    botsEnabled: true
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
    gameState: room.gameState,
    botsEnabled: room.botsEnabled
  };
}

function sendPresence(room) {
  io.emit('presence', { activePlayers });
  if (room) io.to(room.id).emit('room:presence', { activePlayers: room.players.size });
}

function cleanName(value) {
  const name = typeof value === 'string'
    ? value.replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 20)
    : '';
  return /^[\p{L}\p{N}][\p{L}\p{N} _.-]{1,19}$/u.test(name)
    ? name
    : `Operator-${randomInt(1000, 10000)}`;
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
    if (!['public', 'public-bots', 'private'].includes(kind)) {
      return acknowledge({ error: 'Choose a public, public with bots, or private room.' });
    }

    let room;
    if (kind === 'public' || kind === 'public-bots') {
      if (request.action && request.action !== 'join') return acknowledge({ error: 'Public rooms can only be joined.' });
      room = rooms.get(kind) || makeRoom(kind, kind);
      room.botsEnabled = kind === 'public-bots';
    } else if (request.action === 'create') {
      let code;
      do { code = randomInt(100000, 1000000).toString(); } while (rooms.has(code));
      room = makeRoom(code, 'private');
      room.botsEnabled = request.botsEnabled !== false;
    } else if (request.action === 'join') {
      const code = typeof request.roomCode === 'string' ? request.roomCode.trim() : '';
      if (!/^\d{6}$/.test(code)) return acknowledge({ error: 'Enter a valid six-digit private room code.' });
      room = rooms.get(code);
      if (!room || room.kind !== 'private') return acknowledge({ error: 'That private room code was not found.' });
    } else {
      return acknowledge({ error: 'Choose whether to create or join a private room.' });
    }

    if (room.players.size >= MAX_PLAYERS_PER_ROOM) return acknowledge({ error: 'This room is full.' });

    const teamCounts = [...room.players.values()].reduce((counts, player) => {
      counts[player.team] = (counts[player.team] || 0) + 1;
      return counts;
    }, { 0: 0, 1: 0 });
    const team = teamCounts[0] <= teamCounts[1] ? 0 : 1;
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
    if (!player || !profile || typeof profile !== 'object' || !rateAllowed(socket, 'lastProfileUpdate', 200)) return;
    player.name = cleanName(profile.name);
    player.appearance = cleanAppearance(profile.appearance);
    socket.to(room.id).emit('player:profile', { id: socket.id, name: player.name, appearance: player.appearance });
  });

  socket.on('match:start', config => {
    const room = rooms.get(socket.data.roomId);
    if (!room || room.hostId !== socket.id || !config || !['tdm', 'ffa', 'ctf'].includes(config.mode)) return;
    room.matchConfig = {
      mode: config.mode,
      difficulty: Math.max(0, Math.min(2, Number(config.difficulty) || 0)),
      botsEnabled: room.botsEnabled
    };
    room.gameState = null;
    io.to(room.id).emit('match:start', room.matchConfig);
  });

  socket.on('room:bots', enabled => {
    const room = rooms.get(socket.data.roomId);
    if (!room || room.kind !== 'private' || room.hostId !== socket.id || typeof enabled !== 'boolean') return;
    room.botsEnabled = enabled;
    io.to(room.id).emit('room:settings', { botsEnabled: room.botsEnabled });
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
        gameState: room.gameState,
        botsEnabled: room.botsEnabled
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
