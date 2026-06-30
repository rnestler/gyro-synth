import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';

import { Synth } from '@/src/audio/Synth';
import { tiltToNote } from '@/src/audio/scale';
import type { Tilt } from '@/src/hooks/useDeviceTilt';

const MIN_CUTOFF = 300;
const MAX_CUTOFF = 6000;

export const MIN_BPM = 40;
export const MAX_BPM = 240;

/**
 * Owns the audio engine and drives it from the latest tilt:
 *   - a per-frame loop maps tilt → pitch (x) and filter cutoff (y)
 *   - a metronome retriggers the note at `bpm` when rhythm is on; otherwise a
 *     continuous drone holds the note.
 */
export function useSynth(tiltRef: RefObject<Tilt>) {
  const synthRef = useRef<Synth | null>(null);
  if (!synthRef.current) synthRef.current = new Synth();

  const [playing, setPlaying] = useState(false);
  const [rhythmOn, setRhythmOn] = useState(false);
  const [bpm, setBpm] = useState(120);
  const [note, setNote] = useState('—');

  const lastNoteRef = useRef('—');

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

  // Rhythm clock vs. continuous drone.
  useEffect(() => {
    if (!playing) return;
    const synth = synthRef.current!;

    if (!rhythmOn) {
      synth.drone(true);
      return () => synth.drone(false);
    }

    synth.drone(false);
    synth.pluck(); // pluck immediately so toggling feels responsive
    const id = setInterval(() => synth.pluck(), 60000 / bpm);
    return () => clearInterval(id);
  }, [playing, rhythmOn, bpm]);

  // Tear the engine down if the screen unmounts mid-play.
  useEffect(() => {
    return () => {
      synthRef.current?.stop();
    };
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

  return { playing, toggle, rhythmOn, setRhythmOn, bpm, setBpm, note };
}
