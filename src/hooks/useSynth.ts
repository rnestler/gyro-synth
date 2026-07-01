import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';

import { Synth } from '@/src/audio/Synth';
import { tiltToNote } from '@/src/audio/scale';
import type { Tilt } from '@/src/hooks/useDeviceTilt';

const MIN_CUTOFF = 300;
const MAX_CUTOFF = 6000;

export const MIN_BPM = 40;
export const MAX_BPM = 240;

export type BeatMode = 'drone' | 'metronome' | 'shake';

/**
 * Owns the audio engine and drives it from the latest tilt:
 *   - a per-frame loop maps tilt → pitch (x) and filter cutoff (y)
 *   - the beat mode decides *when* the note is struck:
 *       drone     → held continuously
 *       metronome → plucked at `bpm`
 *       shake     → plucked by `trigger()` (called on each shake)
 */
export function useSynth(tiltRef: RefObject<Tilt>) {
  const synthRef = useRef<Synth | null>(null);
  if (!synthRef.current) synthRef.current = new Synth();

  const [playing, setPlaying] = useState(false);
  const [mode, setMode] = useState<BeatMode>('drone');
  const [bpm, setBpm] = useState(120);
  const [note, setNote] = useState('—');
  const [beat, setBeat] = useState(0); // increments on every struck note (UI flash)

  const lastNoteRef = useRef('—');
  const lastFreqRef = useRef(0);
  const lastCutoffRef = useRef(0);
  // Stable mirrors so trigger() stays referentially stable yet reads fresh state.
  const playingRef = useRef(playing);
  const modeRef = useRef(mode);
  useEffect(() => {
    playingRef.current = playing;
    modeRef.current = mode;
  }, [playing, mode]);

  // Map tilt → synth parameters every animation frame while playing.
  useEffect(() => {
    if (!playing) return;
    const synth = synthRef.current!;
    let frame = 0;

    const loop = () => {
      const t = tiltRef.current ?? { x: 0, y: 0 };

      // Pitch is quantized to scale notes, so the frequency only changes when we
      // cross into a new note — push to the audio bridge (and re-render) only then.
      const n = tiltToNote(t.x);
      if (n.frequency !== lastFreqRef.current) {
        lastFreqRef.current = n.frequency;
        synth.setFrequency(n.frequency);
        lastNoteRef.current = n.name;
        setNote(n.name);
      }

      // Cutoff is continuous; only update when it moved audibly (~25 Hz) to avoid
      // scheduling a param ramp on every single frame. Top of the pad = bright.
      const vy = (t.y + 1) / 2; // 0 at top, 1 at bottom
      const cutoff = MIN_CUTOFF + (1 - vy) * (MAX_CUTOFF - MIN_CUTOFF);
      if (Math.abs(cutoff - lastCutoffRef.current) > 25) {
        lastCutoffRef.current = cutoff;
        synth.setCutoff(cutoff);
      }

      frame = requestAnimationFrame(loop);
    };

    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [playing, tiltRef]);

  // Beat source per mode.
  useEffect(() => {
    if (!playing) return;
    const synth = synthRef.current!;

    if (mode === 'drone') {
      synth.drone(true);
      return () => synth.drone(false);
    }

    // metronome + shake both start from silence between hits
    synth.drone(false);

    if (mode === 'metronome') {
      synth.pluck();
      setBeat((b) => b + 1);
      const id = setInterval(() => {
        synth.pluck();
        setBeat((b) => b + 1);
      }, 60000 / bpm);
      return () => clearInterval(id);
    }

    // 'shake' — plucks arrive via trigger(); nothing scheduled here.
    return undefined;
  }, [playing, mode, bpm]);

  // Tear the engine down if the screen unmounts mid-play.
  useEffect(() => {
    return () => {
      synthRef.current?.stop();
    };
  }, []);

  /** Strike one polyphonic note — only honored in shake mode while playing. */
  const trigger = useCallback(() => {
    if (!playingRef.current || modeRef.current !== 'shake') return;
    // Capture the pitch/cutoff at the instant of the shake so each fading voice
    // keeps its own pitch (letting notes stack into chords/arpeggios).
    const t = tiltRef.current ?? { x: 0, y: 0 };
    const freq = tiltToNote(t.x).frequency;
    const vy = (t.y + 1) / 2; // 0 at top, 1 at bottom
    const cutoff = MIN_CUTOFF + (1 - vy) * (MAX_CUTOFF - MIN_CUTOFF);
    synthRef.current!.strike(freq, cutoff);
    setBeat((b) => b + 1);
  }, [tiltRef]);

  const toggle = useCallback(async () => {
    const synth = synthRef.current!;
    if (synth.isStarted) {
      await synth.stop();
      setNote('—');
      lastNoteRef.current = '—';
      lastFreqRef.current = 0; // force re-push of pitch/cutoff on next start
      lastCutoffRef.current = 0;
      setPlaying(false);
    } else {
      await synth.start();
      setPlaying(true);
    }
  }, []);

  return { playing, toggle, mode, setMode, bpm, setBpm, note, trigger, beat };
}
