// The sound a new notification or message makes, for every role. The sounds are Loved-IT's own (made by
// setup/make-notification-sounds.mjs, the same files as the app's) and live in public/sounds. The choice is kept in
// this browser; the app has its own setting on the phone.
//
// Browsers only play sound after the person has clicked or typed on the page once, so the first notification of a
// visit can be silent; every later one plays.
import { useEffect, useRef } from 'react';

export type SoundId = 'chime' | 'ding' | 'glass' | 'marimba' | 'bloom' | 'pulse' | 'pop' | 'twinkle' | 'off';

export const SOUNDS: { id: SoundId; name: string; hint: string }[] = [
  { id: 'chime', name: 'Chime', hint: 'Two soft rising notes' },
  { id: 'ding', name: 'Ding', hint: 'One small bell' },
  { id: 'glass', name: 'Glass', hint: 'A clear, high ping' },
  { id: 'marimba', name: 'Marimba', hint: 'Three wooden notes' },
  { id: 'bloom', name: 'Bloom', hint: 'A gentle four-note rise' },
  { id: 'pulse', name: 'Pulse', hint: 'Two short beeps' },
  { id: 'pop', name: 'Pop', hint: 'A round bubble pop' },
  { id: 'twinkle', name: 'Twinkle', hint: 'A bright little lift' },
  { id: 'off', name: 'No sound', hint: 'Notifications stay silent' },
];

const KEY = 'loved_it_notification_sound';
const DEFAULT: SoundId = 'chime';
/** Several things arriving together (a notification and its chat message) make one sound. */
const QUIET_MS = 2500;

let lastPlayed = 0;
const players = new Map<SoundId, HTMLAudioElement>();
const listeners = new Set<(id: SoundId) => void>();

export function getSound(): SoundId {
  try {
    const saved = localStorage.getItem(KEY) as SoundId | null;
    return saved && SOUNDS.some((s) => s.id === saved) ? saved : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

export function setSound(id: SoundId): void {
  try { localStorage.setItem(KEY, id); } catch { /* private mode: this visit only */ }
  listeners.forEach((l) => l(id));
}

export function onSoundChange(listener: (id: SoundId) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Plays [id] (or the chosen sound) now. A preview ignores the quiet gap. */
export function playSound(id: SoundId = getSound(), preview = false): void {
  if (id === 'off' || typeof Audio === 'undefined') return;
  const now = Date.now();
  if (!preview && now - lastPlayed < QUIET_MS) return;
  lastPlayed = now;
  let audio = players.get(id);
  if (!audio) {
    audio = new Audio(`/sounds/${id}.wav`);
    audio.preload = 'auto';
    audio.volume = 0.7;
    players.set(id, audio);
  }
  try {
    audio.currentTime = 0;
    // Refused before the first click on the page (autoplay rules): nothing to do.
    audio.play()?.catch(() => {});
  } catch {
    // An old browser without audio: stay silent.
  }
}

/**
 * Plays the chosen sound when [count] goes up (a new notification or message). The first count after the page
 * opens is only remembered, so opening a page with unread items is quiet.
 */
export function useSoundOnIncrease(count: number, enabled = true): void {
  const previous = useRef<number | null>(null);
  useEffect(() => {
    if (!enabled) { previous.current = null; return; }
    if (previous.current !== null && count > previous.current) playSound();
    previous.current = count;
  }, [count, enabled]);
}
