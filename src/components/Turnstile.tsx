import { useEffect, useRef } from 'react';

/**
 * Casilla de Cloudflare Turnstile (gratis) contra registros y entradas de robots. Solo sale si la app usa Supabase
 * y tiene `VITE_TURNSTILE_SITE_KEY`; Supabase la revisa si en el proyecto está activado «Captcha protection».
 * Cada token sirve una sola vez: después de cada intento, cambia `resetKey` para pedir otro.
 */
const SITE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined)?.trim() || '';

export const captchaEnabled = (): boolean => !!SITE_KEY && !!import.meta.env.VITE_SUPABASE_URL;

interface TurnstileApi {
  render(el: HTMLElement, opts: Record<string, unknown>): string;
  reset(id: string): void;
  remove(id: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let loading: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!loading) {
    loading = new Promise<TurnstileApi>((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true;
      s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile')));
      s.onerror = () => {
        loading = null;
        s.remove();
        reject(new Error('turnstile'));
      };
      document.head.appendChild(s);
    });
  }
  return loading;
}

export function Turnstile({ onToken, resetKey = 0 }: { onToken: (token: string | null) => void; resetKey?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const cb = useRef(onToken);
  cb.current = onToken;

  useEffect(() => {
    if (!captchaEnabled()) return;
    let alive = true;
    loadTurnstile()
      .then((api) => {
        if (!alive || !box.current) return;
        widget.current = api.render(box.current, {
          sitekey: SITE_KEY,
          language: 'es',
          theme: 'auto',
          callback: (t: string) => cb.current(t),
          'expired-callback': () => cb.current(null),
          'error-callback': () => cb.current(null),
        });
      })
      .catch(() => cb.current(null));
    return () => {
      alive = false;
      if (widget.current) window.turnstile?.remove(widget.current);
      widget.current = null;
    };
  }, []);

  // Token ya usado: pide otro.
  useEffect(() => {
    if (resetKey && widget.current) {
      cb.current(null);
      window.turnstile?.reset(widget.current);
    }
  }, [resetKey]);

  if (!captchaEnabled()) return null;
  return <div ref={box} className="flex min-h-[65px] justify-center" />;
}
