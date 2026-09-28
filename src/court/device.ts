import { useCallback, useEffect, useState } from 'react';
import { useZoomLock } from '../lib/noZoom';

/**
 * Lo del teléfono en la cancha: pantalla siempre encendida (Wake Lock), vibración corta (solo Android),
 * pantalla completa y el modo sol (alto contraste para jugar de día).
 */

export const isIOS = () =>
  typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

export const isAndroid = () => typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);

interface WakeLockSentinelLike {
  released: boolean;
  release(): Promise<void>;
  addEventListener(type: 'release', cb: () => void): void;
}

type WakeNavigator = Navigator & { wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinelLike> } };

export const wakeLockSupported = () => typeof navigator !== 'undefined' && !!(navigator as WakeNavigator).wakeLock;

export interface WakeLockState {
  /** La pantalla no se apaga ahora. */
  locked: boolean;
  supported: boolean;
  /** Mostrar el aviso «quita el bloqueo automático» (iPhone viejo o el navegador no dejó). */
  hint: boolean;
}

/**
 * Pantalla siempre encendida mientras `active`. El navegador la suelta al pasar a segundo plano: se vuelve a
 * pedir al volver. Donde no existe (iPhone con iOS viejo), `hint` = true para avisar.
 */
export function useWakeLock(active: boolean): WakeLockState {
  // En la cancha no se amplía con los dedos (un toque doble no debe hacer zoom).
  useZoomLock(active);
  const [locked, setLocked] = useState(false);
  const [failed, setFailed] = useState(false);
  const supported = wakeLockSupported();

  useEffect(() => {
    if (!active || !supported) return;
    let sentinel: WakeLockSentinelLike | null = null;
    let alive = true;
    const request = async () => {
      if (document.visibilityState !== 'visible' || (sentinel && !sentinel.released)) return;
      try {
        const s = await (navigator as WakeNavigator).wakeLock!.request('screen');
        if (!alive) {
          void s.release();
          return;
        }
        sentinel = s;
        setLocked(true);
        setFailed(false);
        s.addEventListener('release', () => alive && setLocked(false));
      } catch {
        // Sin batería suficiente, sin permiso o sin gesto del usuario: se avisa.
        if (alive) setFailed(true);
      }
    };
    void request();
    const onVisible = () => void request();
    document.addEventListener('visibilitychange', onVisible);
    // En algunos navegadores hace falta un toque: se vuelve a pedir en el primero.
    document.addEventListener('pointerdown', onVisible, { once: true });
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVisible);
      document.removeEventListener('pointerdown', onVisible);
      setLocked(false);
      void sentinel?.release().catch(() => {});
    };
  }, [active, supported]);

  return { locked, supported, hint: active && (!supported || failed) };
}

/** Vibración corta al anotar (solo Android: en iPhone no existe y en la computadora molesta). */
export function tap(ms = 12) {
  if (!isAndroid()) return;
  try {
    navigator.vibrate?.(ms);
  } catch {
    // no disponible
  }
}

/** Pantalla completa (donde el navegador la deja; en iPhone la app instalada ya ocupa todo). */
export function useFullscreen(): { supported: boolean; active: boolean; toggle: () => void } {
  const supported = typeof document !== 'undefined' && !!document.documentElement.requestFullscreen && !isIOS();
  const [active, setActive] = useState(() => typeof document !== 'undefined' && !!document.fullscreenElement);
  useEffect(() => {
    const on = () => setActive(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  const toggle = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => {});
  }, []);
  return { supported, active, toggle };
}

const SUN_KEY = 'mm:cancha:sol';

function readSun(): boolean {
  try {
    return localStorage.getItem(SUN_KEY) === '1';
  } catch {
    return false;
  }
}

/** Modo sol (alto contraste): se recuerda en el teléfono. */
export function useSunMode(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(readSun);
  const set = useCallback((v: boolean) => {
    setOn(v);
    try {
      localStorage.setItem(SUN_KEY, v ? '1' : '0');
    } catch {
      // sin almacenamiento
    }
  }, []);
  return [on, set];
}

/**
 * Colores del modo cancha como variables CSS (se ponen en el contenedor): los dos lados y, con sol, todo en
 * blanco y negro puro con letras gruesas. `--court-a` / `--court-b` = fondo de cada lado; `-fg` = su letra.
 * Con sol se fija también la letra sobre cada color fuerte (`--on-*`): el tema oscuro la pone oscura (para sus
 * colores claros) y sobre los colores oscuros del sol no se leería.
 */
export function courtVars(sun: boolean): Record<string, string> {
  if (sun) {
    return {
      '--bg': '#ffffff',
      '--surface': '#ffffff',
      '--surface-2': '#eeeeee',
      '--fg': '#000000',
      '--muted': '#1a1a1a',
      '--line': '#000000',
      '--accent': '#000000',
      '--accent-fg': '#ffffff',
      '--accent-soft': '#e6e6e6',
      '--danger': '#b00000',
      '--on-danger': '#ffffff',
      '--danger-soft': '#ffe5e5',
      '--warn': '#7a3d00',
      '--on-warn': '#ffffff',
      '--warn-soft': '#fff0cc',
      '--ok': '#005c2a',
      '--on-ok': '#ffffff',
      '--ok-soft': '#dcf5e6',
      '--court-a': '#000000',
      '--court-a-fg': '#ffffff',
      '--court-b': '#ffd400',
      '--court-b-fg': '#000000',
      colorScheme: 'light',
    };
  }
  return {
    '--court-a': 'var(--accent)',
    '--court-a-fg': 'var(--accent-fg)',
    '--court-b': 'var(--warn)',
    '--court-b-fg': 'var(--bg)',
  };
}
