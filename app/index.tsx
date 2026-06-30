import { Stack } from 'expo-router';
import { useState } from 'react';
import { type DimensionValue, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useDeviceTilt } from '@/src/hooks/useDeviceTilt';
import { MAX_BPM, MIN_BPM, useSynth } from '@/src/hooks/useSynth';

const ACCENT = '#5ad1c8';
const BG = '#101418';
const PANEL = '#1b222a';

export default function SynthScreen() {
  // Sensor runs only while engaged; toggling Start is the user gesture web needs
  // before it will hand over motion data.
  const [engaged, setEngaged] = useState(false);
  const { tilt, tiltRef, available, permission } = useDeviceTilt(engaged);
  const { playing, toggle, rhythmOn, setRhythmOn, bpm, setBpm, note } = useSynth(tiltRef);

  const onToggle = async () => {
    setEngaged(!playing);
    await toggle();
  };

  const stepBpm = (delta: number) =>
    setBpm((b) => Math.max(MIN_BPM, Math.min(MAX_BPM, b + delta)));

  // Tilt pad indicator position (tilt -1..1 → 0..100%).
  const dotLeft: DimensionValue = `${((tilt.x + 1) / 2) * 100}%`;
  const dotTop: DimensionValue = `${((tilt.y + 1) / 2) * 100}%`;

  const sensorBlocked = available === false || permission === 'denied';

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ title: 'Gyro Synth' }} />
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Gyro Synth</Text>
          <Text style={styles.subtitle}>Tilt to play · roll = pitch · pitch = tone</Text>
        </View>

        <View style={styles.noteBox}>
          <Text style={styles.noteLabel}>NOTE</Text>
          <Text style={styles.note}>{playing ? note : '—'}</Text>
        </View>

        {/* Tilt pad: dot tracks the phone's orientation. */}
        <View style={styles.pad}>
          <View style={styles.padCrosshairV} />
          <View style={styles.padCrosshairH} />
          <View style={[styles.dot, { left: dotLeft, top: dotTop }, playing && styles.dotActive]} />
        </View>

        {sensorBlocked ? (
          <Text style={styles.warning}>
            {available === false
              ? 'Device motion sensor is not available on this device.'
              : 'Motion permission denied — enable it in Settings to play.'}
          </Text>
        ) : null}

        {/* Rhythm controls */}
        <View style={styles.panel}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Rhythm</Text>
            <Switch
              value={rhythmOn}
              onValueChange={setRhythmOn}
              trackColor={{ true: ACCENT, false: '#3a434d' }}
              thumbColor="#f4f4f4"
            />
          </View>

          <View style={[styles.row, !rhythmOn && styles.rowDisabled]}>
            <Text style={styles.rowLabel}>Tempo</Text>
            <View style={styles.stepper}>
              <Pressable
                style={styles.stepBtn}
                onPress={() => stepBpm(-5)}
                disabled={!rhythmOn}>
                <Text style={styles.stepBtnText}>−</Text>
              </Pressable>
              <Text style={styles.bpm}>{bpm} BPM</Text>
              <Pressable
                style={styles.stepBtn}
                onPress={() => stepBpm(5)}
                disabled={!rhythmOn}>
                <Text style={styles.stepBtnText}>+</Text>
              </Pressable>
            </View>
          </View>
        </View>

        <Pressable
          style={[styles.playBtn, playing && styles.playBtnActive]}
          onPress={onToggle}>
          <Text style={styles.playBtnText}>{playing ? 'Stop' : 'Start'}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  container: { flex: 1, padding: 24, gap: 20, justifyContent: 'center' },
  header: { alignItems: 'center', gap: 6 },
  title: { color: '#fff', fontSize: 30, fontWeight: '700' },
  subtitle: { color: '#8a96a3', fontSize: 13 },

  noteBox: { alignItems: 'center', gap: 2 },
  noteLabel: { color: '#6b7682', fontSize: 12, letterSpacing: 2 },
  note: { color: ACCENT, fontSize: 56, fontWeight: '800', fontVariant: ['tabular-nums'] },

  pad: {
    aspectRatio: 1,
    width: '100%',
    maxWidth: 320,
    alignSelf: 'center',
    backgroundColor: PANEL,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2a333d',
    overflow: 'hidden',
  },
  padCrosshairV: {
    position: 'absolute',
    left: '50%',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: '#2a333d',
  },
  padCrosshairH: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: '#2a333d',
  },
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

  panel: { backgroundColor: PANEL, borderRadius: 16, padding: 16, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowDisabled: { opacity: 0.4 },
  rowLabel: { color: '#d4dbe2', fontSize: 16 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  stepBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#2a333d',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: { color: '#fff', fontSize: 22, fontWeight: '600' },
  bpm: { color: '#fff', fontSize: 16, minWidth: 80, textAlign: 'center', fontVariant: ['tabular-nums'] },

  playBtn: {
    backgroundColor: ACCENT,
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
  },
  playBtnActive: { backgroundColor: '#e0556b' },
  playBtnText: { color: '#0c1013', fontSize: 18, fontWeight: '800' },
});
