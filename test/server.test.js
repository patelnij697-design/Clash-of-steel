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
    env: { ...process.env, PORT: String(port) },
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
  assert.match(html, /data-session="private"/);
  assert.match(html, /data-session="bots"/);
  assert.match(html, /id="btn-private-bots"/);
  assert.match(html, /id="btn-join-public"/);
  assert.match(html, /id="mobile-controls"/);
  assert.match(html, /id="main-menu-modal"/);
  assert.match(html, /id="loading-screen"/);
  assert.match(html, /id="skip-loading"/);
  assert.match(html, /MISSION 01 · OPERATION STEEL RAIN/);
  assert.match(html, /class="loading-progress"/);
  assert.match(html, /#vitals-card,\s*#weapon-card\s*\{\s*top:auto;\s*bottom:calc\(16px \+ env\(safe-area-inset-bottom\)\);/);
  assert.match(html, /"slide jump fire"\s+"reload aim fire"\s+"swap use missile"\s+"loadout descend \."/);
  assert.match(html, /data-mobile-action="fire"\]\s*\{\s*grid-area:fire;[\s\S]*?border-radius:50%/);
  assert.match(html, /#mobile-stick \{[^}]*bottom:calc\(112px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(html, /function updateLoadingIntro/);
  assert.match(html, /const introApache = mkHeli/);
  assert.match(html, /const introTank = mkTank/);
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
  assert.match(html, /VERSION 1\.1\.0/);
  assert.match(html, /Game version 1\.1\.0/);
  assert.match(html, /PLAYER STATISTICS/);
  assert.match(html, /TILL BOT BOARDING/);

  const packageInfo = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  assert.equal(packageInfo.version, '1.1.0');

  const sourcePath = await fetch(`${baseUrl}/server.js`);
  assert.equal(sourcePath.status, 200);
  assert.match(sourcePath.headers.get('content-type'), /text\/html/);
  assert.doesNotMatch(await sourcePath.text(), /from 'socket\.io'/);

  const socketClient = await fetch(`${baseUrl}/socket.io/socket.io.js`);
  assert.equal(socketClient.status, 200);
  assert.match(socketClient.headers.get('content-type'), /javascript/);
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
    const hostRoom = await join(host, { kind: 'public', name: 'Host' });
    assert.equal(hostRoom.player.id, host.id);
    assert.equal(hostRoom.hostId, host.id);
    assert.equal(hostRoom.player.team, 0);

    const guestRoom = await join(guest, { kind: 'public', name: '<Guest>' });
    assert.equal(guestRoom.hostId, host.id);
    assert.equal(guestRoom.player.team, 1);
    assert.equal(guestRoom.player.name, 'Guest');
    assert.equal(guestRoom.players.length, 2);
    assert.equal(guestRoom.activePlayers, 2);

    const profileUpdate = once(guest, 'player:profile');
    host.emit('player:profile', { name: 'Ranger', appearance: 'violet' });
    assert.deepEqual(await profileUpdate, { id: host.id, name: 'Ranger', appearance: 'violet' });

    const matchStart = once(guest, 'match:start');
    host.emit('match:start', { mode: 'tdm', difficulty: 1 });
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
  } finally {
    host.disconnect();
    guest.disconnect();
    clients.delete(host);
    clients.delete(guest);
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
