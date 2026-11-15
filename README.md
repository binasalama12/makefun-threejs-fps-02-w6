# Dustbowl Relay

A round-based tactical FPS in the browser, built on three.js. Two crews fight
over a desert relay station: the **Ember Wardens** (your crew, attacking) and
the **Rustjackals** holding the site. Plant the charge on the radio tower and
defend it until it blows — or simply be the last crew standing.

## The place

The station sits in a sand bowl under a hazy sky. A tanker wagon row cuts the
map in half, the relay station building in the middle is all narrow doorways
and split rooms, and the radio tower yard at the far north is the plant site,
ringed in yellow. Long open lanes reward patience and a steady hand; the
station interior rewards the scattergun.

## How a match runs

- First crew to **5 rounds** wins (9 rounds at most).
- Each round opens with a short **buy phase**, then goes live for 100 seconds.
- Win a round by eliminating the other crew, or — as a Warden — by planting
  the charge at the tower and letting the 14-second fuse run out. A
  Rustjackal who reaches a planted charge can defuse it, so plant and cover.
- Kills pay $300, planting pays $300, round wins pay $2,400 (losses $1,400).
  Unspent cash carries over between rounds.

## The armoury

| Key | Weapon | Price | Character |
| --- | --- | --- | --- |
| 1 | Kestrel-9 Sidearm | free | Slow, honest, accurate |
| 2 | Gritfang SMG | $1,250 | Fast, but bloom punishes long sprays |
| 3 | Dune Scattergun | $950 | Eight pellets for the station choke points |
| 4 | Relay Carbine R-7 | $2,100 | The all-rounder for the long lanes |
| 5 | Longwire Marksman | $3,400 | One careful scoped shot |
| 6 | Dustburst Pellet | $300 | Thrown charge that blinds and staggers bots |

Accuracy is a system, not a suggestion: spread grows while you move, sprint
or jump, builds up the longer you hold the trigger, and shrinks when you
stop, crouch or aim. Headshots hit much harder than body shots.

## Bots

You fight alongside two Warden bots against four Rustjackals. Bots patrol
waypoint routes through the station and the tanker lane, hold the tower yard,
check line-of-sight honestly (walls and tankers really block their view),
strafe and fire in bursts when they see a target, push the plant site when
they attack, and move to defuse a planted charge when they defend.

## Controls

- **WASD** move · **Mouse** look · **Click** fire · **Right-click** aim
- **Shift** sprint · **Ctrl / C** crouch · **Space** jump
- **R** reload · **1 / 2** swap sidearm / primary · **G** throw Dustburst Pellet
- **E** (hold, at the tower) plant the charge · **1–6** buy during buy phase

## Running it

The game is static files with no build step and no network calls. Serve the
`game/` folder with any static file server and open `index.html` in a desktop
browser, for example:

```
python3 -m http.server 8080 --directory game
```

All sound is synthesised live with WebAudio — gunfire, reloads, plant beeps
and the detonation are oscillators and filtered noise, never audio files.

Deterministic screenshot poses are available for captures:
`?shot=start|play|end&seed=N` renders one representative still frame (buy
menu, mid-round action, final scoreboard) and sets `window.__shotReady`.
