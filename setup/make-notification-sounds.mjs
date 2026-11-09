// Makes Loved-IT's notification sounds from scratch (additive synthesis, no recordings, so nothing to license) and
// writes the same WAV files to the website (frontend/public/sounds) and the app (mobile/assets/sounds).
//
//   node setup/make-notification-sounds.mjs
//
// The ids are what the website and the app save as the chosen sound; keep them in step with
// frontend/src/lib/notificationSound.ts and mobile/lib/core/sound/notification_sound.dart.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RATE = 44100;
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** A buffer of `seconds` of silence. */
const blank = (seconds) => new Float32Array(Math.ceil(seconds * RATE));

/**
 * Adds one note: partials as [ratio, gain, decay multiplier], a short attack and an exponential decay.
 * `glide` bends the pitch from `glide * freq` to `freq` over the first 60 ms (a soft "pop").
 */
function note(buf, { freq, at = 0, decay = 0.35, gain = 1, attack = 0.004, partials = [[1, 1, 1]], glide = 1, detune = 0 }) {
  const start = Math.floor(at * RATE);
  const length = Math.min(buf.length - start, Math.ceil((decay * 7 + attack) * RATE));
  const phases = partials.map(() => 0);
  for (let i = 0; i < length; i++) {
    const t = i / RATE;
    const env = (t < attack ? t / attack : 1) * Math.exp(-Math.max(0, t - attack) / decay);
    const bend = glide === 1 ? 1 : 1 + (glide - 1) * Math.exp(-t / 0.02);
    let sample = 0;
    partials.forEach(([ratio, g, d], k) => {
      const f = freq * ratio * bend * (1 + detune * (k % 2 ? 1 : -1));
      phases[k] += (2 * Math.PI * f) / RATE;
      sample += Math.sin(phases[k]) * g * Math.exp(-Math.max(0, t - attack) / (decay * d) + Math.max(0, t - attack) / decay);
    });
    buf[start + i] += sample * env * gain;
  }
  return buf;
}

/** A little room: two quiet echoes, so the sound doesn't end dry. */
function room(buf, echoes = [[0.085, 0.16], [0.17, 0.07]]) {
  const out = Float32Array.from(buf);
  for (const [delay, g] of echoes) {
    const d = Math.floor(delay * RATE);
    for (let i = d; i < out.length; i++) out[i] += buf[i - d] * g;
  }
  return out;
}

/** Peak at -2 dBFS, a 25 ms fade at the end, as 16-bit PCM. */
function wav(buf) {
  let peak = 0;
  for (const s of buf) peak = Math.max(peak, Math.abs(s));
  const scale = peak > 0 ? 0.79 / peak : 0;
  const fade = Math.floor(0.025 * RATE);
  const data = Buffer.alloc(buf.length * 2);
  for (let i = 0; i < buf.length; i++) {
    const tail = buf.length - i < fade ? (buf.length - i) / fade : 1;
    const v = Math.max(-1, Math.min(1, buf[i] * scale * tail));
    data.writeInt16LE(Math.round(v * 32767), i * 2);
  }
  const head = Buffer.alloc(44);
  head.write('RIFF', 0); head.writeUInt32LE(36 + data.length, 4); head.write('WAVE', 8);
  head.write('fmt ', 12); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22);
  head.writeUInt32LE(RATE, 24); head.writeUInt32LE(RATE * 2, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34);
  head.write('data', 36); head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

const E6 = 1318.51, A6 = 1760, C6 = 1046.5, G6 = 1567.98, C7 = 2093, B5 = 987.77, A5 = 880, G5 = 783.99, E5 = 659.25, C5 = 523.25;
const bell = [[1, 1, 1], [2, 0.42, 0.6], [2.76, 0.26, 0.45], [5.4, 0.12, 0.3], [8.93, 0.05, 0.2]];
const soft = [[1, 1, 1], [2, 0.22, 0.55], [3, 0.06, 0.35]];

const sounds = {
  // Two rising notes, warm and short: the default.
  chime: () => room(note(note(blank(1.15), { freq: E6, decay: 0.16, partials: soft, gain: 0.8 }), { freq: A6, at: 0.11, decay: 0.24, partials: soft })),
  // One small bell struck once.
  ding: () => room(note(blank(1.7), { freq: 1174.66, decay: 0.32, partials: bell })),
  // A high glass ping with a faint shimmer.
  glass: () => room(note(note(blank(1.5), { freq: C7, decay: 0.28, partials: [[1, 1, 1], [2.32, 0.18, 0.4]], detune: 0.0025 }), { freq: C7 * 1.5, at: 0.012, decay: 0.2, gain: 0.35 }), [[0.07, 0.2], [0.15, 0.1], [0.23, 0.05]]),
  // Three wooden notes, quick.
  marimba: () => room(note(note(note(blank(0.95), { freq: C5 * 2, decay: 0.09, partials: [[1, 1, 1], [3.93, 0.35, 0.25]] }),
    { freq: E5 * 2, at: 0.085, decay: 0.09, partials: [[1, 1, 1], [3.93, 0.35, 0.25]] }), { freq: G5 * 2, at: 0.17, decay: 0.16, partials: [[1, 1, 1], [3.93, 0.3, 0.25]] })),
  // A soft four-note rise that opens up.
  bloom: () => room([C6, E6, G6, C7].reduce((b, f, i) => note(b, { freq: f, at: i * 0.065, attack: 0.01, decay: 0.2 + i * 0.05, partials: soft, gain: 0.75 + i * 0.08 }), blank(1.6))),
  // Two short, calm beeps.
  pulse: () => room(note(note(blank(0.6), { freq: A5, decay: 0.05, attack: 0.006, partials: [[1, 1, 1], [2, 0.12, 0.5]] }), { freq: A5, at: 0.14, decay: 0.07, attack: 0.006, partials: [[1, 1, 1], [2, 0.12, 0.5]] }), [[0.06, 0.12]]),
  // A round bubble pop, then a smaller one.
  pop: () => room(note(note(blank(0.5), { freq: 520, decay: 0.045, attack: 0.002, glide: 2.1 }), { freq: 760, at: 0.09, decay: 0.04, attack: 0.002, glide: 1.9, gain: 0.6 }), [[0.05, 0.1]]),
  // A bright little lift: a fourth up, like a coin.
  twinkle: () => room(note(note(blank(1.05), { freq: B5 * 2, decay: 0.07, partials: [[1, 1, 1], [3, 0.08, 0.5]], gain: 0.7 }), { freq: E6 * 2, at: 0.07, decay: 0.22, partials: [[1, 1, 1], [3, 0.08, 0.5]] })),
};

for (const dir of ['frontend/public/sounds', 'mobile/assets/sounds']) {
  mkdirSync(join(root, dir), { recursive: true });
  for (const [id, make] of Object.entries(sounds)) {
    writeFileSync(join(root, dir, `${id}.wav`), wav(make()));
  }
}
console.log(`Wrote ${Object.keys(sounds).length} sounds to frontend/public/sounds and mobile/assets/sounds.`);
