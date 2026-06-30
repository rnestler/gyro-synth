import { Stack } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, type DimensionValue, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { type Tilt, useDeviceTilt } from '@/src/hooks/useDeviceTilt';
import { type BeatMode, MAX_BPM, MIN_BPM, useSynth } from '@/src/hooks/useSynth';

const ACCENT = '#5ad1c8';
const BG = '#101418';
const PANEL = '#1b222a';

const MODES: { key: BeatMode; label: string }[] = [
  { key: 'drone', label: 'Drone' },
  { key: 'metronome', label: 'Metronome' },
  { key: 'shake', label: 'Shake' },
];

const MIN_SENSITIVITY = 1;
const MAX_SENSITIVITY = 10;
// Higher sensitivity → lower acceleration threshold (easier to trigger).
const sensitivityToThreshold = (s: number) => 22 - s * 1.7; // ~20.3 (hard) .. ~5 (easy) m/s²

export default function SynthScreen() {
  // Sensor runs only while engaged; toggling Start is the user gesture web needs
  // before it will hand over motion data.
  const [engaged, setEngaged] = useState(false);
  const [sensitivity, setSensitivity] = useState(6);

  // The component owns tiltRef so both hooks share it without a dependency cycle:
  // useSynth reads it (pitch/cutoff), useDeviceTilt writes it (sensor data).
  const tiltRef = useRef<Tilt>({ x: 0, y: 0 });
  const { playing, toggle, mode, setMode, bpm, setBpm, note, trigger, beat } = useSynth(tiltRef);
  const { tilt, available, permission } = useDeviceTilt(engaged, tiltRef, {
    onShake: trigger,
    shakeThreshold: sensitivityToThreshold(sensitivity),
  });

  const onToggle = async () => {
    setEngaged(!playing);
    await toggle();
  };

  const stepBpm = (delta: number) =>
    setBpm((b) => Math.max(MIN_BPM, Math.min(MAX_BPM, b + delta)));
  const stepSensitivity = (delta: number) =>
    setSensitivity((s) => Math.max(MIN_SENSITIVITY, Math.min(MAX_SENSITIVITY, s + delta)));

  // Tilt pad indicator position (tilt -1..1 → 0..100%).
  const dotLeft: DimensionValue = `${((tilt.x + 1) / 2) * 100}%`;
  const dotTop: DimensionValue = `${((tilt.y + 1) / 2) * 100}%`;

  const flash = useBeatFlash(beat);
  const sensorBlocked = available === false || permission === 'denied';

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ title: 'Gyro Synth' }} />
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Gyro Synth</Text>
          <Text style={styles.subtitle}>Tilt = pitch · roll = note · pitch = tone</Text>
        </View>

        <Animated.View style={[styles.noteBox, { transform: [{ scale: flash }] }]}>
          <Text style={styles.noteLabel}>NOTE</Text>
          <Text style={styles.note}>{playing ? note : '—'}</Text>
        </Animated.View>

        {/* Tilt pad: dot tracks the phone's orientation. */}
        <View style={styles.pad}>
          <View style={styles.padCrosshairV} />
          <View style={styles.padCrosshairH} />
          <Animated.View
            style={[
              styles.dot,
              { left: dotLeft, top: dotTop },
              playing && styles.dotActive,
              { transform: [{ scale: flash }] },
            ]}
          />
        </View>

        {sensorBlocked ? (
          <Text style={styles.warning}>
            {available === false
              ? 'Device motion sensor is not available on this device.'
              : 'Motion permission denied — enable it in Settings to play.'}
          </Text>
        ) : null}

        {/* Beat mode + its control */}
        <View style={styles.panel}>
          <View style={styles.segment}>
            {MODES.map((m) => {
              const selected = mode === m.key;
              return (
                <Pressable
                  key={m.key}
                  style={[styles.segBtn, selected && styles.segBtnActive]}
                  onPress={() => setMode(m.key)}>
                  <Text style={[styles.segText, selected && styles.segTextActive]}>{m.label}</Text>
                </Pressable>
              );
            })}
          </View>

          {mode === 'metronome' ? (
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Tempo</Text>
              <View style={styles.stepper}>
                <Pressable style={styles.stepBtn} onPress={() => stepBpm(-5)}>
                  <Text style={styles.stepBtnText}>−</Text>
                </Pressable>
                <Text style={styles.value}>{bpm} BPM</Text>
                <Pressable style={styles.stepBtn} onPress={() => stepBpm(5)}>
                  <Text style={styles.stepBtnText}>+</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {mode === 'shake' ? (
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Sensitivity</Text>
              <View style={styles.stepper}>
                <Pressable style={styles.stepBtn} onPress={() => stepSensitivity(-1)}>
                  <Text style={styles.stepBtnText}>−</Text>
                </Pressable>
                <Text style={styles.value}>{sensitivity}</Text>
                <Pressable style={styles.stepBtn} onPress={() => stepSensitivity(1)}>
                  <Text style={styles.stepBtnText}>+</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {mode === 'drone' ? <Text style={styles.hint}>Continuous tone — tilt to play.</Text> : null}
          {mode === 'shake' ? <Text style={styles.hint}>Shake the phone to strike a note.</Text> : null}
        </View>

        <Pressable style={[styles.playBtn, playing && styles.playBtnActive]} onPress={onToggle}>
          <Text style={styles.playBtnText}>{playing ? 'Stop' : 'Start'}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

/** Brief scale pulse each time the beat counter advances. */
function useBeatFlash(beat: number) {
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (beat === 0) return;
    scale.setValue(1.18);
    Animated.timing(scale, { toValue: 1, duration: 160, useNativeDriver: true }).start();
  }, [beat, scale]);
  return scale;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  container: { flex: 1, padding: 24, gap: 18, justifyContent: 'center' },
  header: { alignItems: 'center', gap: 6 },
  title: { color: '#fff', fontSize: 30, fontWeight: '700' },
  subtitle: { color: '#8a96a3', fontSize: 13 },

  noteBox: { alignItems: 'center', gap: 2 },
  noteLabel: { color: '#6b7682', fontSize: 12, letterSpacing: 2 },
  note: { color: ACCENT, fontSize: 56, fontWeight: '800', fontVariant: ['tabular-nums'] },

  pad: {
    aspectRatio: 1,
    width: '100%',
    maxWidth: 300,
    alignSelf: 'center',
    backgroundColor: PANEL,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2a333d',
    overflow: 'hidden',
  },
  padCrosshairV: { position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, backgroundColor: '#2a333d' },
  padCrosshairH: { position: 'absolute', top: '50%', left: 0, right: 0, height: 1, backgroundColor: '#2a333d' },
  dot: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    marginLeft: -14,
    marginTop: -14,
    backgroundColor: '#3a434d',
  },
  dotActive: { backgroundColor: ACCENT },

  warning: { color: '#e8a13b', textAlign: 'center', fontSize: 13 },

  panel: { backgroundColor: PANEL, borderRadius: 16, padding: 16, gap: 12 },
  segment: { flexDirection: 'row', backgroundColor: '#11161b', borderRadius: 12, padding: 4, gap: 4 },
  segBtn: { flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: 'center' },
  segBtnActive: { backgroundColor: ACCENT },
  segText: { color: '#9aa5b1', fontSize: 14, fontWeight: '600' },
  segTextActive: { color: '#0c1013' },

  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowLabel: { color: '#d4dbe2', fontSize: 16 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  stepBtn: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#2a333d', alignItems: 'center', justifyContent: 'center' },
  stepBtnText: { color: '#fff', fontSize: 22, fontWeight: '600' },
  value: { color: '#fff', fontSize: 16, minWidth: 80, textAlign: 'center', fontVariant: ['tabular-nums'] },
  hint: { color: '#8a96a3', fontSize: 13, textAlign: 'center' },

  playBtn: { backgroundColor: ACCENT, borderRadius: 16, paddingVertical: 18, alignItems: 'center' },
  playBtnActive: { backgroundColor: '#e0556b' },
  playBtnText: { color: '#0c1013', fontSize: 18, fontWeight: '800' },
});
