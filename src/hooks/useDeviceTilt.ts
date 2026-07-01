import { DeviceMotion, type DeviceMotionMeasurement } from 'expo-sensors';
import { type RefObject, useEffect, useRef, useState } from 'react';

export type Tilt = { x: number; y: number };
export type PermissionState = 'pending' | 'granted' | 'denied';

export type DeviceTiltOptions = {
  /** Called once per detected shake (acceleration spike past `shakeThreshold`). */
  onShake?: () => void;
  /** Shake trigger level in m/s². Lower = more sensitive. Defaults to 14. */
  shakeThreshold?: number;
  intervalMs?: number;
};

// DeviceMotion.rotation reports orientation in radians. ~90° of tilt covers the
// full control range; values are clamped so over-tilting just saturates.
const MAX_TILT = Math.PI / 2;
const GRAVITY = 9.81;
// Minimum gap between two shakes so one physical shake = one note.
const REFRACTORY_MS = 150;
const DEFAULT_THRESHOLD = 14;
// ~0.6° of tilt — below this, skip the re-render (dot move is imperceptible).
const TILT_EPSILON = 0.01;

function clamp(v: number): number {
  return Math.max(-1, Math.min(1, v));
}

function magnitude(v: { x: number; y: number; z: number }): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

/**
 * Subscribes to device orientation while `active`, exposing tilt normalized to
 * [-1, 1] on two axes:
 *   x = gamma (roll, left/right)  →  pitch
 *   y = beta  (pitch, front/back) →  filter cutoff
 *
 * Also detects shakes from the same stream and invokes `onShake`.
 *
 * Writes the latest tilt into the provided `tiltRef` (read by the audio loop at
 * frame rate, no re-render) and also returns `tilt` as state for the UI.
 */
export function useDeviceTilt(
  active: boolean,
  tiltRef: RefObject<Tilt>,
  options: DeviceTiltOptions = {},
) {
  const { onShake, shakeThreshold = DEFAULT_THRESHOLD, intervalMs = 50 } = options;

  const [tilt, setTilt] = useState<Tilt>({ x: 0, y: 0 });
  const [available, setAvailable] = useState<boolean | null>(null);
  const [permission, setPermission] = useState<PermissionState>('pending');

  // Keep shake config in refs so tuning sensitivity or swapping the callback
  // never tears down and rebuilds the sensor subscription.
  const onShakeRef = useRef(onShake);
  const thresholdRef = useRef(shakeThreshold);
  const lastShakeRef = useRef(0);
  useEffect(() => {
    onShakeRef.current = onShake;
    thresholdRef.current = shakeThreshold;
  }, [onShake, shakeThreshold]);

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
        if (r) {
          const next: Tilt = { x: clamp(r.gamma / MAX_TILT), y: clamp(r.beta / MAX_TILT) };
          const prev = tiltRef.current;
          tiltRef.current = next; // always fresh for the audio loop
          // Re-render the dot only on a visible change — sensor noise while the
          // phone is still would otherwise re-render the screen every event.
          if (Math.abs(next.x - prev.x) > TILT_EPSILON || Math.abs(next.y - prev.y) > TILT_EPSILON) {
            setTilt(next);
          }
        }

        // Shake = linear-acceleration spike. Prefer gravity-free `acceleration`;
        // fall back to stripping the gravity baseline on platforms (web) that
        // only provide `accelerationIncludingGravity`.
        let mag: number | null = null;
        if (data.acceleration) {
          mag = magnitude(data.acceleration);
        } else if (data.accelerationIncludingGravity) {
          mag = Math.abs(magnitude(data.accelerationIncludingGravity) - GRAVITY);
        }
        if (mag !== null && mag > thresholdRef.current) {
          const now = Date.now();
          if (now - lastShakeRef.current > REFRACTORY_MS) {
            lastShakeRef.current = now;
            onShakeRef.current?.();
          }
        }
      });
    })();

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [active, intervalMs, tiltRef]);

  return { tilt, available, permission };
}
