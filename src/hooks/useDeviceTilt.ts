import { DeviceMotion, type DeviceMotionMeasurement } from 'expo-sensors';
import { useEffect, useRef, useState } from 'react';

export type Tilt = { x: number; y: number };
export type PermissionState = 'pending' | 'granted' | 'denied';

// DeviceMotion.rotation reports orientation in radians. ~90° of tilt covers the
// full control range; values are clamped so over-tilting just saturates.
const MAX_TILT = Math.PI / 2;

function clamp(v: number): number {
  return Math.max(-1, Math.min(1, v));
}

/**
 * Subscribes to device orientation while `active`, exposing tilt normalized to
 * [-1, 1] on two axes:
 *   x = gamma (roll, left/right)  →  pitch
 *   y = beta  (pitch, front/back) →  filter cutoff
 *
 * Returns `tilt` (state, for UI) and `tiltRef` (latest value without re-render,
 * for the audio loop to read at frame rate).
 */
export function useDeviceTilt(active: boolean, intervalMs = 50) {
  const [tilt, setTilt] = useState<Tilt>({ x: 0, y: 0 });
  const [available, setAvailable] = useState<boolean | null>(null);
  const [permission, setPermission] = useState<PermissionState>('pending');
  const tiltRef = useRef<Tilt>({ x: 0, y: 0 });

  useEffect(() => {
    if (!active) return;

    let cancelled = false;
    let subscription: { remove: () => void } | undefined;

    (async () => {
      const ok = await DeviceMotion.isAvailableAsync();
      if (cancelled) return;
      setAvailable(ok);
      if (!ok) return;

      const { status } = await DeviceMotion.requestPermissionsAsync();
      if (cancelled) return;
      setPermission(status === 'granted' ? 'granted' : 'denied');
      if (status !== 'granted') return;

      DeviceMotion.setUpdateInterval(intervalMs);
      subscription = DeviceMotion.addListener((data: DeviceMotionMeasurement) => {
        const r = data.rotation;
        if (!r) return;
        const next: Tilt = { x: clamp(r.gamma / MAX_TILT), y: clamp(r.beta / MAX_TILT) };
        tiltRef.current = next;
        setTilt(next);
      });
    })();

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [active, intervalMs]);

  return { tilt, tiltRef, available, permission };
}
