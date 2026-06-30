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
      const n = tiltToNote(t.x);
      synth.setFrequency(n.frequency);
      synth.setCutoff(MIN_CUTOFF + ((t.y + 1) / 2) * (MAX_CUTOFF - MIN_CUTOFF));

      if (n.name !== lastNoteRef.current) {
        lastNoteRef.current = n.name;
        setNote(n.name); // re-render only when the note actually changes
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

  /** Strike one note — only honored in shake mode while playing. */
  const trigger = useCallback(() => {
    if (!playingRef.current || modeRef.current !== 'shake') return;
    synthRef.current!.pluck();
    setBeat((b) => b + 1);
  }, []);

  const toggle = useCallback(async () => {
    const synth = synthRef.current!;
    if (synth.isStarted) {
      await synth.stop();
      setNote('—');
      lastNoteRef.current = '—';
      setPlaying(false);
    } else {
      await synth.start();
      setPlaying(true);
    }
  }, []);

  return { playing, toggle, mode, setMode, bpm, setBpm, note, trigger, beat };
}
