import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { cameraProblem, type CameraProblem } from './logic';

/**
 * La cámara de atrás en el <video> del lector: se pide al abrir, se suelta al cerrar y mientras la app está en segundo
 * plano (al volver se pide otra vez). Con linterna donde el teléfono la ofrece (Android) y enfoque continuo.
 */
export type CameraState = { status: 'starting' } | { status: 'live' } | { status: 'problem'; problem: CameraProblem };

const CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
};

/** Lo que el lector usa de las capacidades de la cámara (no todas están en los tipos del navegador). */
interface TrackCaps {
  torch?: boolean;
  focusMode?: string[];
}

function stopStream(s: MediaStream | null | undefined) {
  s?.getTracks().forEach((t) => t.stop());
}

export function useCamera(video: RefObject<HTMLVideoElement | null>, enabled: boolean) {
  const [state, setState] = useState<CameraState>({ status: 'starting' });
  const [attempt, setAttempt] = useState(0);
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || document.visibilityState !== 'hidden');
  const [torch, setTorch] = useState<{ available: boolean; on: boolean }>({ available: false, on: false });
  const track = useRef<MediaStreamTrack | null>(null);

  useEffect(() => {
    const onVis = () => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  useEffect(() => {
    if (!enabled || !visible) return;
    const secure = window.isSecureContext !== false;
    const media = navigator.mediaDevices;
    if (!secure || typeof media?.getUserMedia !== 'function') {
      setState({ status: 'problem', problem: cameraProblem(null, { secure, hasMedia: typeof media?.getUserMedia === 'function' }) });
      return;
    }
    let alive = true;
    let stream: MediaStream | null = null;
    setState({ status: 'starting' });
    media
      .getUserMedia(CONSTRAINTS)
      .then(async (s) => {
        if (!alive) return stopStream(s);
        stream = s;
        const t = s.getVideoTracks()[0] ?? null;
        track.current = t;
        const caps = (t?.getCapabilities?.() ?? {}) as TrackCaps;
        if (caps.focusMode?.includes('continuous')) {
          t?.applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] }).catch(() => undefined);
        }
        t?.addEventListener('ended', () => {
          if (alive) setState({ status: 'problem', problem: 'busy' });
        });
        setTorch({ available: !!caps.torch, on: false });
        const v = video.current;
        if (v) {
          v.srcObject = s;
          v.muted = true;
          try {
            await v.play();
          } catch {
            // iOS a veces no deja hasta el primer toque: autoPlay + muted + playsInline lo arrancan igual
          }
        }
        if (alive) setState({ status: 'live' });
      })
      .catch((e: unknown) => {
        if (alive) setState({ status: 'problem', problem: cameraProblem(e, { secure: true, hasMedia: true }) });
      });
    return () => {
      alive = false;
      stopStream(stream);
      track.current = null;
      const v = video.current;
      if (v) v.srcObject = null;
    };
  }, [enabled, visible, attempt, video]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const toggleTorch = useCallback(() => {
    const t = track.current;
    if (!t) return;
    const on = !torch.on;
    t.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] })
      .then(() => setTorch((x) => ({ ...x, on })))
      .catch(() => setTorch({ available: false, on: false }));
  }, [torch.on]);

  return { state, retry, torch, toggleTorch };
}
