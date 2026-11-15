// The Dustbowl armoury. Every gun here is an invention for this game:
// prices, handling and damage are tuned so standing still and aiming beats
// holding the trigger while sprinting. `spread` is in radians at rest;
// main.js scales it by movement, stance and bloom before a shot is cast.
export const WEAPONS = [
  {
    id: 'kestrel', name: 'Kestrel-9 Sidearm', slot: 'sidearm', price: 0,
    damage: 26, headMult: 2.6, fireRate: 260, auto: false,
    mag: 12, reserve: 48, reloadMs: 1100, spread: 0.011, kick: 0.010,
    range: 70, pellets: 1, zoom: 1.0, desc: 'Free sidearm. Honest, slow, accurate.',
  },
  {
    id: 'grit', name: 'Gritfang SMG', slot: 'primary', price: 1250,
    damage: 19, headMult: 2.2, fireRate: 82, auto: true,
    mag: 30, reserve: 90, reloadMs: 1700, spread: 0.026, kick: 0.007,
    range: 55, pellets: 1, zoom: 1.0, desc: 'Fast close work. Bloom punishes long sprays.',
  },
  {
    id: 'scatter', name: 'Dune Scattergun', slot: 'primary', price: 950,
    damage: 11, headMult: 1.6, fireRate: 780, auto: false,
    mag: 6, reserve: 24, reloadMs: 2400, spread: 0.055, kick: 0.030,
    range: 26, pellets: 8, zoom: 1.0, desc: 'Eight pellets for the station choke points.',
  },
  {
    id: 'carbine', name: 'Relay Carbine R-7', slot: 'primary', price: 2100,
    damage: 34, headMult: 2.8, fireRate: 128, auto: true,
    mag: 25, reserve: 75, reloadMs: 1900, spread: 0.009, kick: 0.011,
    range: 95, pellets: 1, zoom: 1.15, desc: 'The all-rounder for the long desert lanes.',
  },
  {
    id: 'longwire', name: 'Longwire Marksman', slot: 'primary', price: 3400,
    damage: 92, headMult: 2.0, fireRate: 1250, auto: false,
    mag: 5, reserve: 20, reloadMs: 2600, spread: 0.002, kick: 0.045,
    range: 160, pellets: 1, zoom: 2.6, desc: 'One careful shot down the tanker lane.',
  },
];

export const GRENADE = {
  id: 'dustpellet', name: 'Dustburst Pellet', price: 300,
  desc: 'Thrown charge: blinds and staggers bots caught in the burst.',
};

export function weaponById(id) {
  return WEAPONS.find((w) => w.id === id) || WEAPONS[0];
}

// Runtime state for one carried gun: ammunition plus bloom and timing.
export function makeGunState(def) {
  return {
    def, mag: def.mag, reserve: def.reserve,
    lastShotAt: -Infinity, reloadingUntil: 0, bloom: 0,
  };
}

export function refillGun(state) {
  state.mag = state.def.mag;
  state.reserve = state.def.reserve;
  state.bloom = 0;
  state.reloadingUntil = 0;
}
