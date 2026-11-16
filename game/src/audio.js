// All sound is synthesised live with WebAudio oscillators and filtered
// noise buffers. There are no audio files: the game stays fully offline.
export function createAudio() {
  let ctx = null;
  let master = null;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
    return ctx;
  }

  function noiseBuffer(seconds) {
    const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  function burst({ dur = 0.12, freq = 1200, type = 'lowpass', gain = 0.5, sweepTo = null }) {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(dur);
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t);
    if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(g).connect(master);
    src.start(t);
    src.stop(t + dur);
  }

  function tone({ freq = 440, dur = 0.08, type = 'square', gain = 0.2, slideTo = null }) {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + dur);
  }

  return {
    unlock() { ensure(); },
    shot(kind) {
      if (kind === 'longwire') { burst({ dur: 0.28, freq: 900, gain: 0.8, sweepTo: 120 }); tone({ freq: 90, dur: 0.2, type: 'sine', gain: 0.5 }); }
      else if (kind === 'scatter') { burst({ dur: 0.22, freq: 700, gain: 0.75, sweepTo: 150 }); }
      else { burst({ dur: 0.11, freq: 1600, gain: 0.45, sweepTo: 300 }); tone({ freq: 140, dur: 0.06, type: 'triangle', gain: 0.25 }); }
    },
    botShot() { burst({ dur: 0.09, freq: 1100, gain: 0.16, sweepTo: 260 }); },
    dryFire() { tone({ freq: 1900, dur: 0.03, type: 'square', gain: 0.08 }); },
    reload() { tone({ freq: 620, dur: 0.05, type: 'square', gain: 0.12 }); setTimeout(() => tone({ freq: 880, dur: 0.05, type: 'square', gain: 0.12 }), 160); },
    hit(kill, headshot = false) {
      if (headshot) {
        // Distinct headshot confirm: a bright ping plus a short click, so
        // a head hit is audible without looking at the hitmarker.
        tone({ freq: 1760, dur: 0.09, type: 'sine', gain: 0.26 });
        tone({ freq: 2600, dur: 0.04, type: 'square', gain: 0.1 });
        if (kill) setTimeout(() => tone({ freq: 1320, dur: 0.14, type: 'sine', gain: 0.22 }), 55);
        return;
      }
      tone({ freq: kill ? 1320 : 980, dur: kill ? 0.14 : 0.06, type: 'sine', gain: 0.22 });
    },
    hurt() { tone({ freq: 180, dur: 0.12, type: 'sawtooth', gain: 0.18, slideTo: 90 }); },
    plantBeep() { tone({ freq: 1040, dur: 0.07, type: 'square', gain: 0.16 }); },
    planted() { tone({ freq: 740, dur: 0.1, type: 'square', gain: 0.2 }); setTimeout(() => tone({ freq: 1180, dur: 0.16, type: 'square', gain: 0.2 }), 130); },
    explosion() {
      burst({ dur: 0.9, freq: 500, gain: 0.95, sweepTo: 40 });
      tone({ freq: 60, dur: 0.8, type: 'sine', gain: 0.7, slideTo: 30 });
    },
    grenade() { burst({ dur: 0.3, freq: 2600, type: 'highpass', gain: 0.4 }); tone({ freq: 300, dur: 0.2, type: 'sine', gain: 0.2, slideTo: 120 }); },
    buy() { tone({ freq: 880, dur: 0.06, type: 'sine', gain: 0.18 }); setTimeout(() => tone({ freq: 1240, dur: 0.09, type: 'sine', gain: 0.18 }), 70); },
    denied() { tone({ freq: 220, dur: 0.12, type: 'square', gain: 0.14 }); },
    roundWin() { [660, 830, 990].forEach((f, i) => setTimeout(() => tone({ freq: f, dur: 0.14, type: 'triangle', gain: 0.2 }), i * 110)); },
    roundLose() { [420, 330, 250].forEach((f, i) => setTimeout(() => tone({ freq: f, dur: 0.16, type: 'triangle', gain: 0.2 }), i * 120)); },
  };
}
