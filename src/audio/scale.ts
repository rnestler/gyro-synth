// Maps a normalized tilt value onto a musical scale so sweeping the phone lands
// on real notes instead of a continuous siren.

// Major pentatonic intervals (semitones from the root). No "wrong" notes, so it
// always sounds musical regardless of how the phone is held.
const PENTATONIC_INTERVALS = [0, 2, 4, 7, 9];
const ROOT_MIDI = 48; // C3
const OCTAVES = 3;

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function buildScale(): number[] {
  const notes: number[] = [];
  for (let o = 0; o < OCTAVES; o++) {
    for (const interval of PENTATONIC_INTERVALS) {
      notes.push(ROOT_MIDI + o * 12 + interval);
    }
  }
  notes.push(ROOT_MIDI + OCTAVES * 12); // cap with the top root note
  return notes;
}

/** The playable note ladder, low to high, as MIDI note numbers. */
export const SCALE = buildScale();

/** Standard equal-temperament MIDI → frequency in Hz (A4 = 69 = 440 Hz). */
export function midiToFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

/** Human-readable note name, e.g. 57 → "A3". */
export function midiToName(midi: number): string {
  return `${NOTE_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

export type Note = {
  midi: number;
  index: number;
  frequency: number;
  name: string;
};

/** Map a normalized tilt value in [-1, 1] to the nearest note on the scale. */
export function tiltToNote(norm: number): Note {
  const clamped = Math.max(-1, Math.min(1, norm));
  const t = (clamped + 1) / 2; // 0..1
  const index = Math.round(t * (SCALE.length - 1));
  const midi = SCALE[index];
  return { midi, index, frequency: midiToFrequency(midi), name: midiToName(midi) };
}
