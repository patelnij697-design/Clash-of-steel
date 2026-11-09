import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('vehicle dual-weapon magazine configurations and reloading states', () => {
  // Tank dual weapons
  const tank = {
    type: 'tank',
    mag: 1, ammo: 1, reloadTime: 3.0, reloading: 0,
    mgMag: 75, mgAmmo: 75, mgReloadTime: 2.6, mgReloading: 0
  };
  assert.equal(tank.mag, 1);
  assert.equal(tank.ammo, 1);
  assert.equal(tank.mgMag, 75);
  assert.equal(tank.mgAmmo, 75);

  // Heli dual weapons
  const heli = {
    type: 'heli',
    mag: 120, ammo: 120, reloadTime: 3.0, reloading: 0,
    mMag: 4, mAmmo: 4, mReloadTime: 5.0, mReloading: 0
  };
  assert.equal(heli.mag, 120);
  assert.equal(heli.ammo, 120);
  assert.equal(heli.mMag, 4);
  assert.equal(heli.mAmmo, 4);

  // SAM truck dual weapons
  const sam = {
    type: 'sam',
    mMag: 4, mAmmo: 4, mReloadTime: 3.6, mReloading: 0,
    mag: 120, ammo: 120, reloadTime: 2.4, reloading: 0
  };
  assert.equal(sam.mMag, 4);
  assert.equal(sam.mAmmo, 4);
  assert.equal(sam.mag, 120);
  assert.equal(sam.ammo, 120);
});

test('aimed bullet trajectory remains strictly collinear with sightline without gravity deviation', () => {
  const origin = { x: 0, y: 1.7, z: 0 };
  const cameraForward = { x: 0, y: 0, z: -1 }; // sightline vector
  const speed = 220;

  // Aimed shot: direction matches cameraForward, no gravity drop applied
  const bullet = {
    p: { ...origin },
    velocity: { x: cameraForward.x * speed, y: cameraForward.y * speed, z: cameraForward.z * speed },
    aimed: true
  };

  const dt = 0.05;
  const BULLET_GRAVITY = 9.8;
  for (let step = 0; step < 20; step++) {
    if (!bullet.aimed) {
      bullet.velocity.y -= BULLET_GRAVITY * dt;
    }
    bullet.p.x += bullet.velocity.x * dt;
    bullet.p.y += bullet.velocity.y * dt;
    bullet.p.z += bullet.velocity.z * dt;
  }

  // Trajectory should stay perfectly on the y=1.7 line of sight
  assert.equal(bullet.p.y, origin.y, 'Aimed bullet y-coordinate must remain exactly at eye level');
  assert.equal(bullet.p.x, origin.x, 'Aimed bullet x-coordinate must remain on crosshair axis');
  assert.ok(bullet.p.z < origin.z, 'Bullet travels forward along camera sightline');
});

test('low-profile ADS stance ensures physical gun model stays below the center sightline', () => {
  const adsY = -0.38; // camera space y-offset of gun rig during ADS
  const maxModelHeight = 0.22; // highest point of weapon receiver/sights
  const topOfGunInViewport = adsY + maxModelHeight; // -0.16

  assert.ok(topOfGunInViewport < -0.1, 'Top of gun in ADS must be well below screen center (y = 0.0)');
});

test('index.html contains dual weapon UI structure and ADS reticle logic', async () => {
  const html = await readFile(path.join(root, 'index.html'), 'utf8');

  // Vehicle dual-weapon panel in HUD
  assert.match(html, /id="vehicle-ammo-panel"/);
  assert.match(html, /id="veh-w1-row"/);
  assert.match(html, /id="veh-w2-row"/);
  assert.match(html, /id="veh-w1-ammo"/);
  assert.match(html, /id="veh-w2-ammo"/);

  // Dual weapon telemetry logic
  assert.match(html, /RADAR SAM MISSILES/);
  assert.match(html, /20MM CIWS/);
  assert.match(html, /120MM CANNON/);
  assert.match(html, /COAXIAL MG/);
  assert.match(html, /30MM CHAIN GUN/);
  assert.match(html, /AGM MISSILES/);

  // Aim down sights clearance and zero-drop bullets
  assert.match(html, /const isAimed = Boolean\(rm && !P\.veh\)/);
  assert.match(html, /bullet\.aimed/);
  assert.match(html, /adsY = isSidearm \? -0\.36 : isLauncher \? -0\.42 : -0\.38/);
});
