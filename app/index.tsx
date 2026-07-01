import { Stack } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
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

  // Dot position in pixels, driven by an Animated value so it can glide smoothly
  // between the sparse sensor samples (Android 12+ caps motion updates at ~5 Hz).
  // `pos` is the dot's OFFSET from the pad center, in pixels. The dot is anchored
  // at 50%/50% (same as the crosshair), so an offset of 0 sits exactly on the
  // crosshair — independent of the measured pad size or border.
  const [padSize, setPadSize] = useState(0);
  const pos = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  useEffect(() => {
    if (!padSize) return;
    const half = padSize / 2;
    Animated.timing(pos, {
      toValue: { x: tilt.x * half, y: tilt.y * half },
      duration: 180, // ~one sensor interval, so each sample eases into the next
      easing: Easing.linear,
      useNativeDriver: true,
    }).start();
  }, [tilt, padSize, pos]);

  const flash = useBeatFlash(beat);
  const sensorBlocked = available === false || permission === 'denied';

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ title: 'Gyro Synth' }} />
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Gyro Synth</Text>
          <Text style={styles.subtitle}>Tilt the phone to play</Text>
        </View>

        <Animated.View style={[styles.noteBox, { transform: [{ scale: flash }] }]}>
          <Text style={styles.noteLabel}>NOTE</Text>
          <Text style={styles.note}>{playing ? note : '—'}</Text>
        </Animated.View>

        {/* Tilt pad: dot tracks the phone's orientation. Each axis is labelled
            with the parameter it controls. */}
        <View
          style={styles.pad}
          onLayout={(e) => setPadSize(e.nativeEvent.layout.width)}>
          <View style={styles.padCrosshairV} />
          <View style={styles.padCrosshairH} />

          <View style={styles.axisTop}>
            <Text style={styles.axisText}>bright · TONE</Text>
          </View>
          <View style={styles.axisBottom}>
            <Text style={styles.axisText}>dark · TONE</Text>
          </View>
          <View style={styles.axisLeft}>
            <Text style={styles.axisText}>low · PITCH</Text>
          </View>
          <View style={styles.axisRight}>
            <Text style={styles.axisText}>high · PITCH</Text>
          </View>

          <Animated.View
            style={[
              styles.dot,
              playing && styles.dotActive,
              { transform: [{ translateX: pos.x }, { translateY: pos.y }, { scale: flash }] },
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
    left: '50%',
    top: '50%',
    width: 28,
    height: 28,
    borderRadius: 14,
    marginLeft: -14, // center the 28px dot on the 50%/50% anchor (= crosshair)
    marginTop: -14,
    backgroundColor: '#3a434d',
  },
  dotActive: { backgroundColor: ACCENT },

  axisTop: { position: 'absolute', top: 6, left: 0, right: 0, alignItems: 'center' },
  axisBottom: { position: 'absolute', bottom: 6, left: 0, right: 0, alignItems: 'center' },
  axisLeft: { position: 'absolute', left: 8, top: 0, bottom: 0, justifyContent: 'center' },
  axisRight: { position: 'absolute', right: 8, top: 0, bottom: 0, justifyContent: 'center' },
  axisText: { color: '#6b7682', fontSize: 11, fontWeight: '600', letterSpacing: 0.5 },

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
