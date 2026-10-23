import type { Settings } from './settings';
import { SOUNDS, type SoundName } from './sounds';

/**
 * 音效 and 震動, behind the player's 設定. Every call is safe on any device:
 * without Web Audio or the Vibration API (e.g. iPhone Safari) it does nothing.
 */
export interface Feedback {
  /** Plays a sound from SOUNDS, `delayMs` from now, if 音效 is on. */
  play(name: SoundName, delayMs?: number): void;
  /** Vibrates (ms, or an on/off pattern) if 震動 is on and the device can. */
  vibrate(pattern: number | number[]): void;
}

type AudioContextCtor = typeof AudioContext;

export function createFeedback(settings: () => Settings): Feedback {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;

  // Browsers only allow audio after a user gesture, so the AudioContext is
  // created (or resumed) on the first one. Capture phase: #screens stops
  // pointerdown propagation for its buttons. pointerdown alone isn't a user
  // activation for touch, so pointerup / touchend / click / keydown too.
  const unlock = () => {
    try {
      if (!ctx) {
        const w = window as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
        const Ctor = w.AudioContext ?? w.webkitAudioContext;
        if (!Ctor) return;
        ctx = new Ctor();
        master = ctx.createGain();
        master.gain.value = 0.6;
        master.connect(ctx.destination);
      }
      if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
    } catch {
      ctx = null;
    }
  };
  for (const type of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) {
    window.addEventListener(type, unlock, { capture: true, passive: true });
  }

  return {
    play(name, delayMs = 0) {
      if (!settings().sound || !ctx || !master || ctx.state !== 'running') return;
      try {
        SOUNDS[name](ctx, master, ctx.currentTime + delayMs / 1000);
      } catch {
        // A failed sound never stops the game.
      }
    },
    vibrate(pattern) {
      if (!settings().vibration || typeof navigator.vibrate !== 'function') return;
      try {
        navigator.vibrate(pattern);
      } catch {
        // Some browsers throw instead of ignoring; 震動 is optional.
      }
    },
  };
}
