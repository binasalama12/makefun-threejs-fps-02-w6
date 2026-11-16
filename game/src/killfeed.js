// Kill feed entries: one structured record per elimination, formatted
// for the HUD feed. Keeping the format here (not in hud.js) means every
// kill site in main.js — player shots, bot-on-bot fire, grenades — reports
// the same shape: killer, weapon, victim, and whether it was a headshot.
// The headshot mark is a target glyph so a feed line can be read at a
// glance while playing.
export const HEADSHOT_MARK = '◎';

export function formatKill({ killer, victim, weapon = '', headshot = false }) {
  const via = weapon ? `  [${weapon}]` : '';
  const mark = headshot ? `  ${HEADSHOT_MARK} HEADSHOT` : '';
  return `${killer} dropped ${victim}${via}${mark}`;
}

// CSS hook hud.js uses to tint headshot lines gold.
export function killFeedClass({ headshot = false }) {
  return headshot ? 'feed-kill feed-headshot' : 'feed-kill';
}
