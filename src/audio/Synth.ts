import {
  AudioContext,
  AudioManager,
  type BiquadFilterNode,
  type GainNode,
  type OscillatorNode,
} from 'react-native-audio-api';

// One-shot polyphonic voice: its own oscillator/filter/gain, torn down when it
// finishes ringing.
type Voice = { osc: OscillatorNode; filter: BiquadFilterNode; gain: GainNode };

const ATTACK = 0.01;
const RELEASE = 0.6; // struck-note fade length — longer = more audible overlap
const MAX_VOICES = 12; // safety cap so rapid shaking can't spawn unbounded voices

/**
 * A subtractive synth with two paths:
 *   - a persistent mono voice (oscillator -> low-pass -> VCA) for Drone/Metronome,
 *   - `strike()` one-shot voices for Shake mode, which ring and fade independently
 *     so notes overlap (polyphony).
 * Both mix into a shared master gain -> destination.
 *
 * Lives outside React render so the audio graph is built once and only its
 * parameters are nudged while the user tilts the phone. All scheduling is done
 * against `ctx.currentTime`, the audio clock.
 */
export class Synth {
  private ctx: AudioContext | null = null;
  private osc: OscillatorNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private vca: GainNode | null = null;
  private master: GainNode | null = null;
  private voices = new Set<Voice>();
  private started = false;
  private peakGain = 0.25;

  get isStarted(): boolean {
    return this.started;
  }

  get currentTime(): number {
    return this.ctx?.currentTime ?? 0;
  }

  async start(): Promise<void> {
    if (this.started) return;

    // Activate the OS audio session (route to speaker, take focus).
    await AudioManager.setAudioSessionActivity(true);

    const ctx = new AudioContext();

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 220;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1200;
    filter.Q.value = 1;

    const vca = ctx.createGain();
    vca.gain.value = 0; // silent until drone()/pluck()

    // Shared mixing point for the persistent voice and all struck voices.
    const master = ctx.createGain();
    master.gain.value = 0.6; // headroom for overlapping voices
    master.connect(ctx.destination);

    osc.connect(filter).connect(vca).connect(master);
    osc.start();

    this.ctx = ctx;
    this.osc = osc;
    this.filter = filter;
    this.vca = vca;
    this.master = master;
    this.started = true;
  }

  /** Glide the oscillator to a new pitch (short time constant kills zipper noise). */
  setFrequency(hz: number): void {
    if (!this.osc || !this.ctx) return;
    this.osc.frequency.setTargetAtTime(hz, this.ctx.currentTime, 0.02);
  }

  /** Move the low-pass cutoff (brightness). */
  setCutoff(hz: number): void {
    if (!this.filter || !this.ctx) return;
    this.filter.frequency.setTargetAtTime(hz, this.ctx.currentTime, 0.02);
  }

  /** Peak loudness for both drone and plucks, 0..1. */
  setVolume(v: number): void {
    this.peakGain = Math.max(0, Math.min(1, v));
  }

  /** Continuous mode: hold the VCA open (true) or close it (false). */
  drone(on: boolean): void {
    if (!this.vca || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.vca.gain.cancelScheduledValues(t);
    this.vca.gain.setTargetAtTime(on ? this.peakGain : 0, t, 0.03);
  }

  /** Rhythm mode: fire a short attack/decay envelope (a plucked note). */
  pluck(when?: number): void {
    if (!this.vca || !this.ctx) return;
    const t = when ?? this.ctx.currentTime;
    const g = this.vca.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(0.0001, t);
    g.linearRampToValueAtTime(this.peakGain, t + 0.01); // attack
    g.exponentialRampToValueAtTime(0.0001, t + 0.28); // decay (can't ramp to 0)
  }

  /**
   * Shake mode: play an independent voice at the given pitch/cutoff. Each call
   * spawns a fresh oscillator that fades out on its own, so notes overlap.
   */
  strike(frequency: number, cutoff: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = frequency;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    filter.Q.value = 1;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(this.peakGain, t + ATTACK);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + RELEASE);

    osc.connect(filter).connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + RELEASE + 0.05);

    const voice: Voice = { osc, filter, gain };
    this.voices.add(voice);
    osc.onEnded = () => {
      this.voices.delete(voice);
      try {
        osc.disconnect();
        filter.disconnect();
        gain.disconnect();
      } catch {
        // already disconnected
      }
    };

    // Retire the oldest voice if we exceed the cap (Set keeps insertion order).
    if (this.voices.size > MAX_VOICES) {
      const oldest = this.voices.values().next().value;
      if (oldest) {
        try {
          oldest.osc.stop();
        } catch {
          // already stopped
        }
      }
    }
  }

  async stop(): Promise<void> {
    if (!this.started || !this.ctx) return;

    const ctx = this.ctx;
    const osc = this.osc;
    const t = ctx.currentTime;

    this.vca?.gain.cancelScheduledValues(t);
    this.vca?.gain.setTargetAtTime(0, t, 0.05);
    try {
      osc?.stop(t + 0.2);
    } catch {
      // already stopped
    }

    // Silence and release any ringing struck voices.
    this.voices.forEach((v) => {
      try {
        v.osc.stop();
        v.osc.disconnect();
        v.filter.disconnect();
        v.gain.disconnect();
      } catch {
        // already gone
      }
    });
    this.voices.clear();
    this.master?.disconnect();

    this.ctx = null;
    this.osc = null;
    this.filter = null;
    this.vca = null;
    this.master = null;
    this.started = false;

    // Let the release ring out, then tear down the context and session.
    setTimeout(() => {
      ctx.close().catch(() => {});
      AudioManager.setAudioSessionActivity(false).catch(() => {});
    }, 250);
  }
}
