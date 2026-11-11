export const BASE_WEAPONS = [
  { n: 'Combat Pistol', lv: 1, dmg: 24, rate: 0.25, mag: 15, rel: 1.1, spr: 0.012, zoom: 1.3, cls: 'Sidearm', type: 'pistol' },
  { n: 'Vector SMG', lv: 1, dmg: 16, rate: 0.065, mag: 32, rel: 1.4, spr: 0.03, zoom: 1.5, auto: 1, cls: 'Close Quarters', type: 'smg' },
  { n: 'Magnum .44', lv: 2, dmg: 58, rate: 0.5, mag: 6, rel: 2.0, spr: 0.005, zoom: 1.6, cls: 'Heavy Revolver', type: 'pistol' },
  { n: 'SPAS Shotgun', lv: 2, dmg: 16, pel: 8, rate: 0.75, mag: 8, rel: 2.2, spr: 0.065, zoom: 1.2, cls: 'Breaching', type: 'shotgun' },
  { n: 'M4A1 Carbine', lv: 3, dmg: 28, rate: 0.1, mag: 30, rel: 1.7, spr: 0.015, zoom: 2.4, auto: 1, cls: 'Assault Rifle', type: 'rifle' },
  { n: 'Micro SMG', lv: 3, dmg: 14, rate: 0.05, mag: 24, rel: 1.2, spr: 0.04, zoom: 1.3, auto: 1, cls: 'Auto Pistol', type: 'smg' },
  { n: 'M39 DMR', lv: 4, dmg: 52, rate: 0.3, mag: 10, rel: 1.9, spr: 0.004, zoom: 3.8, scope: 1, cls: 'Marksman', type: 'sniper' },
  { n: 'Javelin Anti Tank Missle', lv: 4, rate: 1.8, mag: 1, rel: 2.5, zoom: 2.0, m: 'at', cls: 'Anti-Armor', type: 'rocket' },
  { n: 'Barrett .50', lv: 5, dmg: 125, rate: 1.3, mag: 5, rel: 2.4, spr: 0.001, zoom: 7.0, scope: 1, cls: 'Heavy Sniper', type: 'sniper' },
  { n: 'Stinger AA', lv: 5, rate: 1.8, mag: 1, rel: 2.6, zoom: 2.0, m: 'aa', cls: 'Lock-On Anti-Air', type: 'rocket' },
  { n: 'M249 SAW', lv: 6, dmg: 25, rate: 0.085, mag: 100, rel: 4.2, spr: 0.035, zoom: 1.7, auto: 1, cls: 'Light Machine Gun', type: 'lmg' }
];

export const NEW_WEAPONS = [
  { n: 'SCAR-H Battle Rifle', lv: 4, dmg: 38, rate: 0.14, mag: 20, rel: 1.9, spr: 0.01, zoom: 2.8, auto: 1, cls: 'Battle Rifle', type: 'rifle' },
  { n: 'P90 PDW', lv: 2, dmg: 17, rate: 0.058, mag: 50, rel: 1.8, spr: 0.028, zoom: 1.6, auto: 1, cls: 'Submachine Gun', type: 'smg' },
  { n: 'AA-12 Auto Shotgun', lv: 5, dmg: 14, pel: 7, rate: 0.28, mag: 12, rel: 2.3, spr: 0.07, zoom: 1.2, auto: 1, cls: 'Auto Shotgun', type: 'shotgun' },
  { n: 'Desert Eagle .50', lv: 3, dmg: 64, rate: 0.42, mag: 7, rel: 1.7, spr: 0.008, zoom: 1.5, cls: 'Heavy Pistol', type: 'pistol' }
];

export const ALL_WEAPONS = [...BASE_WEAPONS, ...NEW_WEAPONS];

export function createBRState() {
  return {
    active: true,
    phase: 'plane', // 'plane' | 'freefall' | 'ground'
    planePos: { x: -220, y: 95, z: -220 },
    planeDir: { x: Math.SQRT1_2, y: 0, z: Math.SQRT1_2 },
    planeSpeed: 28,
    parachuteOpen: false,
    zoneCenter: { x: 0, z: 0 },
    zoneRadius: 240,
    zoneMinRadius: 25,
    zoneShrinkRate: 1.6,
    zoneDamage: 8,
    crates: []
  };
}

export function ejectFromC17(brState) {
  if (!brState || brState.phase !== 'plane') return false;
  brState.phase = 'freefall';
  brState.parachuteOpen = false;
  return true;
}

export function stepC17Flight(brState, dt) {
  if (!brState || !brState.active) return false;
  brState.planePos.x += brState.planeDir.x * brState.planeSpeed * dt;
  brState.planePos.z += brState.planeDir.z * brState.planeSpeed * dt;
  const outOfBounds = brState.planePos.x > 220 || brState.planePos.z > 220;
  if (outOfBounds && brState.phase === 'plane') {
    ejectFromC17(brState);
  }
  return outOfBounds;
}

export function stepParachuteDescent(brState, playerPos, vy, dt) {
  if (!brState || brState.phase !== 'freefall') return { y: playerPos.y, vy, landed: false };
  if (playerPos.y <= 35) {
    brState.parachuteOpen = true;
  }
  const nextVy = brState.parachuteOpen ? Math.max(vy - 18 * dt, -7) : Math.max(vy - 28 * dt, -26);
  let nextY = playerPos.y + nextVy * dt;
  let landed = false;
  if (nextY <= 0) {
    nextY = 0;
    brState.phase = 'ground';
    brState.parachuteOpen = false;
    landed = true;
  }
  return { y: nextY, vy: landed ? 0 : nextVy, landed };
}

export function createWeaponCrates(count = 24, randFn = Math.random) {
  const crates = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + (randFn() - 0.5) * 0.3;
    const dist = 30 + randFn() * 165;
    const weaponIndex = Math.floor(randFn() * ALL_WEAPONS.length);
    crates.push({
      id: i,
      x: Math.cos(angle) * dist,
      z: Math.sin(angle) * dist,
      weaponIndex,
      opened: false
    });
  }
  return crates;
}

export function lootWeaponCrate(crates, playerPos, loadout, weapons = ALL_WEAPONS) {
  for (const crate of crates) {
    if (crate.opened) continue;
    const dist = Math.hypot(playerPos.x - crate.x, playerPos.z - crate.z);
    if (dist <= 3.0) {
      crate.opened = true;
      const wIdx = crate.weaponIndex;
      if (loadout[0] === -1) {
        loadout[0] = wIdx;
      } else if (loadout[1] === -1) {
        loadout[1] = wIdx;
      } else {
        loadout[0] = wIdx;
      }
      return {
        looted: true,
        weaponIndex: wIdx,
        weaponName: weapons[wIdx]?.n || 'Weapon',
        crateId: crate.id
      };
    }
  }
  return { looted: false };
}

export function stepSafeZone(brState, dt) {
  if (!brState || !brState.active) return brState?.zoneRadius ?? 0;
  if (brState.zoneRadius > brState.zoneMinRadius) {
    brState.zoneRadius = Math.max(brState.zoneMinRadius, brState.zoneRadius - brState.zoneShrinkRate * dt);
  }
  return brState.zoneRadius;
}
