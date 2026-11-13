import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import { io } from 'socket.io-client';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let serverProcess;
let baseUrl;
const clients = new Set();

async function unusedPort() {
  const probe = createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const { port } = probe.address();
  await new Promise(resolve => probe.close(resolve));
  return port;
}

function connectClient() {
  const client = io(baseUrl, { transports: ['websocket'], reconnection: false, timeout: 3000 });
  clients.add(client);
  return new Promise((resolve, reject) => {
    client.once('connect', () => resolve(client));
    client.once('connect_error', reject);
  });
}

function once(client, event) {
  return new Promise(resolve => client.once(event, resolve));
}

function join(client, request) {
  return new Promise(resolve => client.emit('room:join', request, resolve));
}

before(async () => {
  const port = await unusedPort();
  baseUrl = `http://127.0.0.1:${port}`;
  serverProcess = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: { ...process.env, PORT: String(port), DEV_PANEL_KEY: 'test-secret-key' },
    stdio: 'ignore'
  });

  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/healthz`);
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Multiplayer server did not start in time.');
});

test('serves the multiplayer lobby and Socket.IO browser client', async () => {
  const page = await fetch(baseUrl);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('cache-control'), /no-store/);
  const html = await page.text();
  assert.match(html, /id="session-selector"/);
  assert.match(html, /data-session="public"/);
  assert.match(html, /data-session="public-bots"/);
  assert.match(html, /data-session="private"/);
  assert.match(html, /data-session="bots"/);
  assert.match(html, /id="btn-private-bots"/);
  assert.doesNotMatch(html, new RegExp(`${['816', '999'].join('')}|test-secret-key`));
  assert.match(html, /id="mobile-controls"/);
  assert.match(html, /id="main-menu-modal"/);
  assert.match(html, /id="updates-modal"/);
  assert.match(html, /id="btn-main-updates"/);
  assert.match(html, /VERSION 1\.1\.10 · COMBAT AI & MODEL OVERHAUL/);
  assert.match(html, /VERSION 1\.1\.5 · BATTLEFIELD EXPANSION/);
  assert.match(html, /id="loading-screen"/);
  assert.match(html, /id="skip-loading"/);
  assert.match(html, /MISSION 01 · OPERATION STEEL RAIN/);
  assert.match(html, /class="loading-progress"/);
  assert.match(html, /#vitals-card,\s*#weapon-card\s*\{\s*top:auto;\s*bottom:calc\(16px \+ env\(safe-area-inset-bottom\)\);/);
  assert.match(html, /"slide jump fire"\s+"reload aim fire"\s+"swap use missile"\s+"loadout descend \."/);
  assert.match(html, /data-mobile-action="fire"\]\s*\{\s*grid-area:fire;[\s\S]*?border-radius:50%/);
  assert.match(html, /#mobile-stick \{[^}]*bottom:calc\(112px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(html, /function updateLoadingIntro/);
  assert.match(html, /CINEMATIC INTRO \/\/ VERSION 1/);
  assert.match(html, /id="toggle-intro-audio"/);
  assert.match(html, /const introScene = new THREE\.Scene\(\)/);
  assert.match(html, /const introApache = mkHeli/);
  assert.match(html, /const introTank = mkTank/);
  assert.match(html, /const introWingmen = \[/);
  assert.match(html, /const introRockets = \[/);
  assert.match(html, /if \(t >= 12\) finishLoadingIntro\(\)/);
  assert.match(html, /renderer\.render\(introScene, introCamera\)/);
  assert.match(html, /const introAdditionalBlasts = \[introTankTwo, introTankThree\]/);
  assert.match(html, /const cameraBlend = \(value, start, end\) => THREE\.MathUtils\.smoothstep/);
  assert.match(html, /function spawnVehicleExplosion\(pos, size = 3\.8\)/);
  assert.match(html, /if \(becameDead && isVehicleEntity\(entity\)\)/);
  assert.match(html, /f\.kind === 'vehicle-explosion'/);
  assert.match(html, /const stairSteps = 14/);
  assert.match(html, /new THREE\.PointLight\(0xffc56e, 7, 42, 2\)/);
  assert.match(html, /const BOT_PATROL_COORDINATES = \[-260, -186, -112, -38, 38, 112, 186, 260\]/);
  assert.match(html, /const patrolCount = BOT_PATROL_COORDINATES\.length \*\* 2/);
  assert.doesNotMatch(html, /baseStayTimer/);
  assert.match(html, /e\.ct = 0;[\s\S]*if \(e\.type === 'inf' && e\.team\)/);
  assert.match(html, /rnd\(-250, 250\)/);
  assert.match(html, /new THREE\.IcosahedronGeometry\(1, 2\)/);
  assert.match(html, /const variation = 1 \+ 0\.14 \* Math\.sin/);
  assert.match(html, /const makeVehiclePaint = color => new THREE\.MeshStandardMaterial/);
  assert.match(html, /function mkInf\(colorHex\)/);
  assert.match(html, /new THREE\.SphereGeometry\(0\.23, 12, 10\)/);
  assert.match(html, /function mkContainer\(x, z, rot = 0, colorIdx = 0\)/);
  assert.match(html, /function mkAbandonedBuilding\(x, z\)/);
  assert.match(html, /new THREE\.DodecahedronGeometry\(s \* rnd\(0\.18, 0\.32\), 0\)/);
  assert.match(html, /const muzzleSleeve = new THREE\.Mesh/);
  assert.match(html, /if \(type === 'med'\)/);
  assert.match(html, /const flagMat = t \? mats\.teamRed : mats\.teamBlue/);
  assert.match(html, /function claimNearestTeamVehicle\(bot\) \{[\s\S]*?vehicle\.tm !== bot\.tm/);
  assert.match(html, /bot\.aiState = 'board_veh';[\s\S]*?bestVehicle\.boardingBot = bot;/);
  assert.match(html, /claimNearestTeamVehicle\(bot\);/);
  assert.match(html, /claimNearestTeamVehicle\(e\);/);
  assert.match(html, /const index = \(slot \* 17 \+ visit \* 13\) % patrolCount/);
  assert.match(html, /currentMode === 'ffa' \|\| other\.tm === e\.tm/);
  assert.match(html, /const squadSize = currentMode === 'ffa' \? 12 : 7/);
  assert.match(html, /findBotVehiclePath\(e\.p\.x, e\.p\.z, targetX, targetZ, navRadius\)/);
  assert.match(html, /for \(const z of \[-2\.7, -1\.62, -0\.54, 0\.54, 1\.62, 2\.7\]\)/);
  assert.match(html, /function getBaseWalkableHeight\(pos\)/);
  assert.match(html, /function getHelipadStairTarget\(vehicle, pos\)/);
  assert.match(html, /if \(pos\.y >= 7 && Math\.abs\(pos\.x - gantryX\) <= 7\.5/);
  assert.match(html, /const rooftopHelipad = type === 'heli' && !isFFA/);
  assert.match(html, /Math\.max\(e\.sp\.y, e\.p\.y - 8 \* dt\)/);
  assert.match(html, /const weaponModels = W\.map\(makeWeaponModel\)/);
  assert.match(html, /function updateHeliChinGun/);
  assert.match(html, /barrelAssembly\.flash/);
  assert.match(html, /const menuVehicles = \[/);
  for (const showcaseVehicle of ['AH-64 APACHE', 'M1A2 ABRAMS', 'COMMAND APC', 'M901 SAM TRUCK']) {
    assert.ok(html.includes(showcaseVehicle), `Missing menu showcase vehicle: ${showcaseVehicle}`);
  }
  assert.match(html, /menuVehicleTimer >= 8/);
  assert.match(html, /renderer\.toneMapping = THREE\.ACESFilmicToneMapping/);
  assert.match(html, /id="settings-modal"/);
  assert.match(html, /id="profile-modal"/);
  assert.match(html, /id="room-details"/);
  assert.match(html, /id="binding-list"/);
  assert.match(html, /id="settings-keyboard-reference"/);
  assert.match(html, /id="room-player-list"/);
  assert.match(html, /id="active-player-count">—/);
  assert.match(html, /veh\.type === 'car' \|\| veh\.type === 'heli' \|\| veh\.type === 'tank' \|\| veh\.type === 'sam'/);
  assert.match(html, /currentMode === 'ffa' \|\| veh\.tm === e\.tm/);
  assert.match(html, /VERSION 1\.1\.10/);
  assert.match(html, /VERSION 1\.2\.00 · PUBLIC MATCHMAKING & HUD/);
  assert.match(html, /Game version 1\.2\.00/);
  assert.match(html, /PLAYER STATISTICS/);
  assert.match(html, /TILL BOT BOARDING/);

  const packageInfo = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  assert.equal(packageInfo.version, '1.2.00');
  const lockInfo = JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf8'));
  assert.equal(lockInfo.version, '1.2.00');
  assert.equal(lockInfo.packages[''].version, '1.2.00');

  const sourcePath = await fetch(`${baseUrl}/server.js`);
  assert.equal(sourcePath.status, 200);
  assert.match(sourcePath.headers.get('content-type'), /text\/html/);
  assert.doesNotMatch(await sourcePath.text(), /from 'socket\.io'/);

  const socketClient = await fetch(`${baseUrl}/socket.io/socket.io.js`);
  assert.equal(socketClient.status, 200);
  assert.match(socketClient.headers.get('content-type'), /javascript/);
});

test('developer authorization uses the server-configured key', async () => {
  const invalid = await fetch(`${baseUrl}/api/dev/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'wrong-key' })
  });
  assert.equal(invalid.status, 403);

  const valid = await fetch(`${baseUrl}/api/dev/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'test-secret-key' })
  });
  assert.deepEqual(await valid.json(), { ok: true, authorized: true });
});

test('Render blueprint configures the app as a healthy Node web service', async () => {
  const blueprint = await readFile(path.join(root, 'render.yaml'), 'utf8');
  assert.match(blueprint, /type:\s*web/);
  assert.match(blueprint, /runtime:\s*node/);
  assert.match(blueprint, /startCommand:\s*npm start/);
  assert.match(blueprint, /healthCheckPath:\s*\/healthz/);

  const health = await fetch(`${baseUrl}/healthz`);
  assert.equal(health.status, 200);
  assert.equal(await health.text(), 'ok');
});

after(() => {
  clients.forEach(client => client.disconnect());
  if (serverProcess && serverProcess.exitCode === null) serverProcess.kill();
});

test('public rooms synchronize match state, combat actions, chat, and presence', async () => {
  const host = await connectClient();
  const guest = await connectClient();
  try {
    const hostRoom = await join(host, { kind: 'public-bots', name: 'Host', mode: 'tdm', difficulty: 1 });
    assert.equal(hostRoom.player.id, host.id);
    assert.equal(hostRoom.hostId, host.id);
    assert.equal(hostRoom.player.team, 0);

    const guestRoom = await join(guest, { kind: 'public-bots', name: '<Guest>', mode: 'ffa', difficulty: 2 });
    assert.equal(guestRoom.hostId, host.id);
    assert.equal(guestRoom.player.team, 1);
    assert.equal(guestRoom.player.name, 'Guest');
    assert.equal(guestRoom.players.length, 2);
    assert.equal(guestRoom.activePlayers, 2);

    const profileUpdate = once(guest, 'player:profile');
    host.emit('player:profile', { name: 'Ranger', appearance: 'woodland' });
    assert.deepEqual(await profileUpdate, { id: host.id, name: 'Ranger', appearance: 'woodland' });

    const matchStart = once(guest, 'match:start');
    host.emit('match:start', { mode: 'ffa', difficulty: 2 });
    const prematureStart = await Promise.race([
      matchStart.then(config => ({ config })),
      new Promise(resolve => setTimeout(() => resolve(null), 100))
    ]);
    assert.equal(prematureStart, null);
    assert.deepEqual(await matchStart, { mode: 'tdm', difficulty: 1, botsEnabled: true });

    const roomChat = once(guest, 'chat:message');
    host.emit('chat:message', 'Ready to deploy');
    assert.equal((await roomChat).text, 'Ready to deploy');

    const combatAction = once(host, 'combat:action');
    guest.emit('combat:action', {
      kind: 'shot', x: 1, y: 2, z: 3, dx: 0, dy: 0, dz: -1, damage: 25
    });
    assert.equal((await combatAction).playerId, guest.id);

    const playerDamage = once(guest, 'player:damage');
    host.emit('player:damage', {
      id: guest.id, amount: 10, attacker: 'Enemy fire', sourceX: 4, sourceZ: 5
    });
    assert.deepEqual(await playerDamage, {
      amount: 10, attacker: 'Enemy fire', sourceX: 4, sourceZ: 5
    });

    const worldState = once(guest, 'game:state');
    host.emit('game:state', { entities: [], missiles: [], scores: { 0: 1 } });
    assert.deepEqual(await worldState, { entities: [], missiles: [], scores: { 0: 1 } });

    const tankState = once(host, 'player:state');
    guest.emit('player:state', {
      x: 42, y: 0, z: -18, yaw: 1.2, pitch: 0,
      health: 2400, maxHealth: 2400, vehicle: 'tank', vehicleId: 'entity-2', vehicleYaw: 0.75
    });
    const relayedTank = await tankState;
    assert.equal(relayedTank.id, guest.id);
    assert.equal(relayedTank.vehicle, 'tank');
    assert.equal(relayedTank.vehicleId, 'entity-2');
    assert.equal(relayedTank.health, 2400);
    assert.equal(relayedTank.maxHealth, 2400);
  } finally {
    host.disconnect();
    guest.disconnect();
    clients.delete(host);
    clients.delete(guest);
  }
});

test('public human-only and bot-enabled queues stay separate', async () => {
  const humanRoomClient = await connectClient();
  const botRoomClient = await connectClient();
  try {
    const humanRoom = await join(humanRoomClient, { kind: 'public', name: 'Human' });
    const botRoom = await join(botRoomClient, { kind: 'public-bots', name: 'Bot Queue' });
    assert.equal(humanRoom.roomKind, 'public');
    assert.equal(humanRoom.botsEnabled, false);
    assert.equal(botRoom.roomKind, 'public-bots');
    assert.equal(botRoom.botsEnabled, true);
    assert.notEqual(humanRoom.hostId, botRoom.hostId);

    humanRoomClient.emit('match:start', { mode: 'tdm', difficulty: 1 });
    botRoomClient.emit('match:start', { mode: 'tdm', difficulty: 1 });
    assert.equal(humanRoom.matchConfig, null);
    assert.equal(botRoom.matchConfig, null);
  } finally {
    humanRoomClient.disconnect();
    botRoomClient.disconnect();
    clients.delete(humanRoomClient);
    clients.delete(botRoomClient);
  }
});

test('private rooms use codes and reject unknown codes', async () => {
  const host = await connectClient();
  const guest = await connectClient();
  const stranger = await connectClient();
  try {
    const created = await join(host, { kind: 'private', action: 'create', name: 'Host', botsEnabled: false });
    assert.match(created.roomCode, /^\d{6}$/);
    assert.equal(created.botsEnabled, false);
    const joined = await join(guest, { kind: 'private', action: 'join', roomCode: created.roomCode });
    assert.equal(joined.roomCode, created.roomCode);
    assert.equal(joined.hostId, host.id);
    assert.equal(joined.players.length, 2);
    assert.equal(joined.botsEnabled, false);

    const botsEnabled = once(guest, 'room:settings');
    host.emit('room:bots', true);
    assert.deepEqual(await botsEnabled, { botsEnabled: true });

    const botsDisabled = once(guest, 'room:settings');
    host.emit('room:bots', false);
    assert.deepEqual(await botsDisabled, { botsEnabled: false });

    const matchStart = once(guest, 'match:start');
    host.emit('match:start', { mode: 'tdm', difficulty: 2, botsEnabled: true });
    assert.deepEqual(await matchStart, { mode: 'tdm', difficulty: 2, botsEnabled: false });

    const malformed = await join(stranger, { kind: 'private', action: 'join', roomCode: '12ab56' });
    assert.match(malformed.error, /six-digit/i);

    const invalid = await join(stranger, { kind: 'private', action: 'join', roomCode: '000000' });
    assert.match(invalid.error, /not found/i);

    const invalidAction = await join(stranger, { kind: 'private', action: 'unexpected', roomCode: created.roomCode });
    assert.match(invalidAction.error, /create or join/i);

    host.disconnect();
    const rebalanced = await join(stranger, { kind: 'private', action: 'join', roomCode: created.roomCode });
    assert.equal(rebalanced.player.team, 0);
  } finally {
    host.disconnect();
    guest.disconnect();
    stranger.disconnect();
    clients.delete(host);
    clients.delete(guest);
    clients.delete(stranger);
  }
});
