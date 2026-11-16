// Hit resolution for player shots: which body part was struck, and how
// much damage that part takes. Bots expose two distinct hitboxes (see
// bots.js buildFigure): the head mesh carries userData.part === 'head'
// and the torso 'body'. A head hit is a different event from a body hit —
// it multiplies the weapon's base damage by its headMult (x4 on the
// Kestrel-9 and the Relay Carbine), plays its own sound and paints the
// hitmarker gold in main.js / hud.js. Long range softens every hit.
export const HEADSHOT_FALLOFF_START = 42;
export const HEADSHOT_FALLOFF_MULT = 0.75;

export function isHeadshot(part) {
  return part === 'head';
}

// Pure: no allocation beyond the small result object, called once per
// pellet that actually struck a bot.
export function damageForHit(def, part, distance) {
  const headshot = isHeadshot(part);
  let damage = def.damage * (headshot ? def.headMult : 1);
  if (distance > HEADSHOT_FALLOFF_START) damage *= HEADSHOT_FALLOFF_MULT;
  return { damage, headshot };
}
