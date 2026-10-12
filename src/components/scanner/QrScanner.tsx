import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type ChangeEvent, type CSSProperties, type FormEvent, type RefObject } from 'react';
import { useNavigate } from 'react-router';
import { CameraOff, Check, Copy, Flashlight, FlashlightOff, ImageIcon, Keyboard, RefreshCw, X } from 'lucide-react';
import { isAndroid, isIOS } from '../../court/device';
import { MODAL_OPENED, cx } from '../ui';
import { useCamera, type CameraState } from './camera';
import { createDecoder, everyVideoFrame, loadImageFile, type Hit, type QrDecoder } from './decoder';
import {
  PRODUCTION_ORIGIN,
  alignCorners,
  breatheAt,
  centerOf,
  codeReady,
  cornersPath,
  flatQuad,
  frameStyle,
  growQuad,
  idleQuad,
  mapCover,
  normalizeCode,
  problemCopy,
  roundedQuadPath,
  routeFromScan,
  scrimPath,
  springStep,
  toQuad,
  unflatQuad,
  type Platform,
  type Quad,
} from './logic';
import { OLD_ORIGINS } from '../../lib/origin';

/**
 * El lector de QR a pantalla completa (como el de Telegram): la cámara de atrás, el resto oscurecido con un hueco en
 * el centro donde el marco «respira» y una línea barre; al ver un QR el marco lo persigue (un resorte lleva sus 4
 * esquinas a las del código, también de lado o en perspectiva), se marca con ✓ (y vibra donde se puede) y abre la
 * pantalla de la app. Si el QR no es de MatchMate, lo dice y deja copiarlo (nunca abre links de afuera). Abajo, «Elegir
 * foto» (lee un QR de una foto) y «Escribir el código»; arriba, cerrar y la linterna (si el teléfono la tiene). Sin
 * permiso o sin cámara, un aviso tranquilo con qué hacer. Se monta al abrirlo (index.tsx) y suelta la cámara al cerrar.
 */

export type ScanPhase = 'scan' | 'lock' | 'done' | 'foreign' | 'code' | 'photo';

/** Cada cuánto se lee un cuadro (~11 por segundo). */
const SCAN_EVERY_MS = 90;
/** Sin ver el QR este tiempo, el marco vuelve al centro. */
const LOST_MS = 450;
/** El marco persigue al QR este rato antes del ✓, y el ✓ se ve este otro antes de abrir. */
const LOCK_MS = 420;
const DONE_MS = 380;
/** Cuánto más grande que el QR queda el marco. */
const HUG = 1.12;

const SCAN_CSS = [
  '.mm-scan[open]{animation:mm-scan-in .22s ease-out}',
  '@keyframes mm-scan-in{from{opacity:0}to{opacity:1}}',
  // El color del marco: la cámara siempre se ve oscura, así que va el tono del color de la app para fondo oscuro.
  '.mm-scan{--scan-accent:#fff;--scan-on:#0d0f15}',
  '@supports (color:color-mix(in oklab,red,red)){.mm-scan{--scan-accent:color-mix(in oklab,var(--accent) 50%,#fff)}' +
    '@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) .mm-scan{--scan-accent:var(--accent)}}' +
    ':root[data-theme="dark"] .mm-scan{--scan-accent:var(--accent)}}',
  '.mm-scan-line{animation:mm-scan-sweep 2.4s cubic-bezier(.45,0,.55,1) infinite alternate;transition:opacity .2s}',
  '@keyframes mm-scan-sweep{from{transform:translateY(0)}to{transform:translateY(var(--sweep,200px))}}',
  '.mm-scan-pop{animation:mm-scan-pop .38s cubic-bezier(.2,1.5,.4,1) both}',
  '@keyframes mm-scan-pop{from{transform:translate(-50%,-50%) scale(.3);opacity:0}to{transform:translate(-50%,-50%) scale(1);opacity:1}}',
  '@media (prefers-reduced-motion:reduce){.mm-scan-line{animation:none;opacity:0!important}}',
].join('\n');

const platformNow = (): Platform => (isIOS() ? 'ios' : isAndroid() ? 'android' : 'other');
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
// Donde corre, el dominio de la app y las direcciones viejas (sus QR impresos se siguen leyendo).
const appOrigins = () => [typeof location !== 'undefined' ? location.origin : PRODUCTION_ORIGIN, PRODUCTION_ORIGIN, ...OLD_ORIGINS];

/** Lo que dice la línea de abajo del marco (y lo que se anuncia al lector de pantalla). */
export function scanHint(camera: CameraState, phase: ScanPhase): string {
  if (phase === 'photo') return 'Leyendo la foto…';
  if (phase === 'lock') return 'Código encontrado';
  if (phase === 'done') return 'Abriendo…';
  if (camera.status === 'starting') return 'Abriendo la cámara…';
  return 'Apunta al código de la liga, equipo o invitación';
}

interface Anim {
  pos: number[] | null;
  vel: number[];
  /** El QR que se ve (en px de la pantalla), o null. */
  found: Quad | null;
  lastHit: number;
}

export default function QrScanner({ onClose, onNavigate }: { onClose: () => void; onNavigate?: (path: string) => void }) {
  const navigate = useNavigate();
  const dialog = useRef<HTMLDialogElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const refs: OverlayRefs = {
    scrim: useRef<SVGPathElement>(null),
    fill: useRef<SVGPathElement>(null),
    corners: useRef<SVGPathElement>(null),
    check: useRef<HTMLDivElement>(null),
    line: useRef<HTMLDivElement>(null),
  };

  const [phase, setPhaseState] = useState<ScanPhase>('scan');
  const phaseRef = useRef<ScanPhase>('scan');
  const setPhase = (p: ScanPhase) => {
    phaseRef.current = p;
    setPhaseState(p);
  };
  const [foreign, setForeign] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const boxRef = useRef<{ w: number; h: number } | null>(null);
  const [decoder, setDecoder] = useState<QrDecoder | null>(null);
  const decoderLoad = useRef<Promise<QrDecoder> | null>(null);
  const anim = useRef<Anim>({ pos: null, vel: new Array(8).fill(0), found: null, lastHit: -Infinity });
  /** Un QR de afuera que se cerró con «Escanear otro»: no vuelve a salir mientras siga a la vista. */
  const dismissed = useRef<{ text: string; seen: number } | null>(null);
  const timers = useRef<number[]>([]);
  const [platform] = useState(platformNow);

  const camera = useCamera(video, true);

  // El diálogo: se abre al montar (encima de todo, también de otra hoja) y se cierra al desmontar.
  useLayoutEffect(() => {
    const d = dialog.current;
    if (d && !d.open) {
      d.showModal();
      window.dispatchEvent(new Event(MODAL_OPENED));
    }
    const t = timers.current;
    return () => {
      t.forEach((id) => clearTimeout(id));
      if (d?.open) d.close();
    };
  }, []);

  // El lector (el del sistema o jsQR en su worker, que se baja ahora); al cerrar se suelta el worker.
  useEffect(() => {
    let alive = true;
    const load = (decoderLoad.current ??= createDecoder());
    load.then(
      (d) => alive && setDecoder(d),
      () => alive && setNote('No se pudo cargar el lector. Revisa tu conexión o escribe el código.'),
    );
    return () => {
      alive = false;
      load.then((d) => d.close()).catch(() => undefined);
    };
  }, []);

  // El tamaño de la pantalla (el video la llena con object-fit: cover).
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const b = { w: Math.round(r.width), h: Math.round(r.height) };
      boxRef.current = b;
      setBox((old) => (old && old.w === b.w && old.h === b.h ? old : b));
    };
    measure();
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  // El marco: cada repintado sus esquinas se acercan (con resorte) al QR que se ve o al cuadro del centro.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const calm = reducedMotion();
    const loop = (t: number) => {
      const dt = (t - last) / 1000;
      last = t;
      const b = boxRef.current;
      const a = anim.current;
      if (b && b.w && b.h) {
        const ph = phaseRef.current;
        const held = ph === 'lock' || ph === 'done';
        const tracking = !!a.found && (held || t - a.lastHit < LOST_MS);
        const target = tracking && a.found ? a.found : idleQuad(b.w, b.h, calm || held ? 0 : breatheAt(t));
        const goal = flatQuad(target);
        if (!a.pos || calm) {
          a.pos = goal;
          a.vel.fill(0);
        } else springStep(a.pos, a.vel, goal, dt);
        drawFrame(refs, b, unflatQuad(a.pos));
        const line = refs.line.current;
        if (line) line.style.opacity = ph === 'scan' && !tracking ? '1' : '0';
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // `refs` son objetos de useRef (los mismos en cada render).
  }, []);

  const later = (ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  function go(path: string) {
    onClose();
    if (onNavigate) onNavigate(path);
    else navigate(path);
  }

  /** Lo leído (de la cámara o de una foto): a su pantalla con el ✓, o el aviso de que no es de MatchMate. */
  function accept(text: string, fromPhoto: boolean) {
    const route = routeFromScan(text, appOrigins());
    if (route.kind === 'foreign') {
      setForeign(route.text);
      setCopied(false);
      setPhase('foreign');
      return;
    }
    const calm = reducedMotion();
    const success = () => {
      setPhase('done');
      try {
        navigator.vibrate?.(35);
      } catch {
        // sin vibración
      }
      later(calm ? 250 : DONE_MS, () => go(route.path));
    };
    setNote(null);
    if (fromPhoto) {
      anim.current.found = null;
      success();
    } else {
      setPhase('lock');
      later(calm ? 0 : LOCK_MS, success);
    }
  }

  // Cada cuadro leído: el marco va al QR y, si es nuevo, se decide qué hacer.
  const onHit = useEffectEvent((hit: Hit | null, now: number) => {
    const ph = phaseRef.current;
    const a = anim.current;
    const b = boxRef.current;
    if (!hit) {
      if (dismissed.current && now - dismissed.current.seen > 1500) dismissed.current = null;
      return;
    }
    if (ph === 'lock' || ph === 'scan' || ph === 'foreign') {
      const q = b ? toQuad(mapCover(hit.corners, hit.width, hit.height, b.w, b.h)) : null;
      if (q) {
        const cur = a.pos ? unflatQuad(a.pos) : q;
        a.found = growQuad(alignCorners(cur, q), HUG);
        a.lastHit = now;
      }
    }
    if (ph === 'scan') {
      if (dismissed.current?.text === hit.text) {
        dismissed.current.seen = now;
        return;
      }
      accept(hit.text, false);
    } else if (ph === 'foreign' && hit.text !== foreign) {
      accept(hit.text, false);
    }
  });

  // Leer el video mientras la cámara está andando.
  const live = camera.state.status === 'live';
  useEffect(() => {
    const v = video.current;
    if (!live || !decoder || !v) return;
    let stopped = false;
    let busy = false;
    let lastScan = -Infinity;
    const cancel = everyVideoFrame(v, (now) => {
      const ph = phaseRef.current;
      if (busy || now - lastScan < SCAN_EVERY_MS || v.readyState < 2 || !v.videoWidth) return;
      if (ph === 'code' || ph === 'photo' || ph === 'done') return;
      busy = true;
      lastScan = now;
      decoder
        .scanVideo(v)
        .then((hit) => !stopped && onHit(hit, performance.now()))
        .catch(() => undefined)
        .finally(() => {
          busy = false;
        });
    });
    return () => {
      stopped = true;
      cancel();
    };
  }, [live, decoder]);

  // Los avisos de abajo se van solos.
  useEffect(() => {
    if (!note) return;
    const id = window.setTimeout(() => setNote(null), 4000);
    return () => clearTimeout(id);
  }, [note]);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setPhase('photo');
    setNote(null);
    try {
      decoderLoad.current ??= createDecoder();
      const dec = await decoderLoad.current;
      const img = await loadImageFile(f);
      let hit: Hit | null;
      try {
        hit = await dec.scanImage(img.src, img.width, img.height);
      } finally {
        img.release();
      }
      if (hit) return accept(hit.text, true);
      setNote('No encontramos un QR en esa foto. Prueba con otra más de cerca.');
    } catch {
      setNote('No pudimos leer esa foto. Prueba con otra.');
    }
    setPhase('scan');
  }

  function submitCode(e: FormEvent) {
    e.preventDefault();
    const c = normalizeCode(code);
    if (!codeReady(c)) return;
    go(`/unirse/${c}`);
  }

  async function copy() {
    if (!foreign) return;
    try {
      await navigator.clipboard.writeText(foreign);
      setCopied(true);
    } catch {
      setNote('No se pudo copiar.');
    }
  }

  function rescan() {
    if (foreign) dismissed.current = { text: foreign, seen: performance.now() };
    setForeign(null);
    setPhase('scan');
  }

  return (
    <dialog
      ref={dialog}
      aria-label="Escanea el QR"
      onCancel={(e) => {
        if (e.target !== e.currentTarget) return;
        e.preventDefault();
        // Esc (o «atrás» en Android): primero cierra lo de abajo; después, el lector.
        if (phaseRef.current === 'code' || phaseRef.current === 'foreign') rescan();
        else onClose();
      }}
      className="mm-scan m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden border-0 bg-black p-0 text-white"
    >
      <ScannerView
        rootRef={root}
        videoRef={video}
        fileRef={file}
        overlay={refs}
        camera={camera.state}
        phase={phase}
        box={box}
        platform={platform}
        foreign={foreign}
        copied={copied}
        note={note}
        code={code}
        torch={camera.torch}
        on={{
          close: onClose,
          torch: camera.toggleTorch,
          retry: camera.retry,
          photo: () => file.current?.click(),
          file: (e) => void onFile(e),
          openCode: () => {
            setCode('');
            setPhase('code');
          },
          closeCode: () => setPhase('scan'),
          code: setCode,
          submitCode,
          copy: () => void copy(),
          rescan,
        }}
      />
    </dialog>
  );
}

// ---------- El dibujo ----------

export interface OverlayRefs {
  scrim: RefObject<SVGPathElement | null>;
  fill: RefObject<SVGPathElement | null>;
  corners: RefObject<SVGPathElement | null>;
  check: RefObject<HTMLDivElement | null>;
  line: RefObject<HTMLDivElement | null>;
}

/** Pinta el marco en `q` (px de la pantalla): el oscurecido con su hueco, las esquinas, el relleno del ✓ y su lugar. */
function drawFrame(refs: OverlayRefs, b: { w: number; h: number }, q: Quad) {
  const { radius, arm } = frameStyle(q);
  refs.scrim.current?.setAttribute('d', scrimPath(b.w, b.h, q, radius));
  refs.fill.current?.setAttribute('d', roundedQuadPath(q, radius));
  refs.corners.current?.setAttribute('d', cornersPath(q, arm, radius));
  const c = centerOf(q);
  const check = refs.check.current;
  if (check) check.style.transform = `translate(${Math.round(c.x)}px, ${Math.round(c.y)}px)`;
}

export interface ScannerHandlers {
  close: () => void;
  torch: () => void;
  retry: () => void;
  photo: () => void;
  file: (e: ChangeEvent<HTMLInputElement>) => void;
  openCode: () => void;
  closeCode: () => void;
  code: (v: string) => void;
  submitCode: (e: FormEvent) => void;
  copy: () => void;
  rescan: () => void;
}

const glass = 'bg-black/65 ring-1 ring-white/12 backdrop-blur-xl';
const roundBtn =
  'grid size-11 shrink-0 place-items-center rounded-full bg-black/45 text-white backdrop-blur-md transition active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white';
const pillBtn =
  'inline-flex h-12 min-w-0 items-center justify-center gap-2 rounded-full px-4 text-[15px] font-semibold transition active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white';
const accentBtn = 'bg-(--scan-accent) text-(--scan-on) disabled:opacity-40';

/**
 * Lo que se ve del lector (sin la cámara ni los tiempos: eso es QrScanner), para dibujarlo también en las pruebas.
 * El marco y el oscurecido los pinta QrScanner en cada repintado (por eso sus trazos no llevan `d` aquí).
 */
export function ScannerView({
  rootRef,
  videoRef,
  fileRef,
  overlay,
  camera,
  phase,
  box,
  platform,
  foreign,
  copied,
  note,
  code,
  torch,
  on,
}: {
  rootRef?: RefObject<HTMLDivElement | null>;
  videoRef?: RefObject<HTMLVideoElement | null>;
  fileRef?: RefObject<HTMLInputElement | null>;
  overlay?: OverlayRefs;
  camera: CameraState;
  phase: ScanPhase;
  box: { w: number; h: number } | null;
  platform: Platform;
  foreign: string | null;
  copied: boolean;
  note: string | null;
  code: string;
  torch: { available: boolean; on: boolean };
  on: ScannerHandlers;
}) {
  const problem = camera.status === 'problem' ? problemCopy(camera.problem, platform) : null;
  const idle = box ? idleQuad(box.w, box.h) : null;
  const side = idle ? idle[1].x - idle[0].x : 0;
  const hint = scanHint(camera, phase);
  const lineStyle = idle
    ? ({ left: idle[0].x + side * 0.08, top: idle[0].y + side * 0.06, width: side * 0.84, '--sweep': `${Math.round(side * 0.86)}px` } as CSSProperties)
    : undefined;
  return (
    <div ref={rootRef} className="absolute inset-0 overflow-hidden select-none">
      <style href="mm-scan" precedence="default">
        {SCAN_CSS}
      </style>
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        aria-hidden="true"
        className={cx('absolute inset-0 size-full object-cover transition-opacity duration-300', camera.status === 'live' ? 'opacity-100' : 'opacity-0')}
      />

      {problem ? (
        <div className="absolute inset-x-0 top-1/2 mx-auto flex max-w-sm -translate-y-1/2 flex-col items-center px-6 text-center">
          <span aria-hidden="true" className="grid size-16 place-items-center rounded-full bg-white/10">
            <CameraOff className="size-7" />
          </span>
          <h3 className="mt-4 text-[19px] font-bold tracking-[-0.01em]">{problem.title}</h3>
          <p className="mt-2 text-[15px] leading-[1.45] text-white/75">{problem.body}</p>
          {problem.retry && (
            <button type="button" onClick={on.retry} className={cx(pillBtn, accentBtn, 'mt-5 px-5')}>
              <RefreshCw aria-hidden="true" className="size-[18px]" /> Intentar de nuevo
            </button>
          )}
        </div>
      ) : (
        <>
          <svg aria-hidden="true" className="pointer-events-none absolute inset-0 size-full">
            <path ref={overlay?.scrim} fill="rgb(0 0 0 / 0.55)" fillRule="evenodd" />
            <path
              ref={overlay?.fill}
              fill="var(--scan-accent)"
              className={cx('transition-opacity duration-200', phase === 'done' ? 'opacity-25' : 'opacity-0')}
            />
            <path ref={overlay?.corners} fill="none" stroke="var(--scan-accent)" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {idle && (
            <div ref={overlay?.line} className="mm-scan-line pointer-events-none absolute" style={lineStyle}>
              <div className="h-[3px] rounded-full bg-(--scan-accent) opacity-90 shadow-[0_0_14px_3px_var(--scan-accent)]" />
            </div>
          )}
          <div ref={overlay?.check} className="pointer-events-none absolute top-0 left-0">
            {phase === 'done' && (
              <span className="mm-scan-pop absolute grid size-16 place-items-center rounded-full bg-(--scan-accent) text-(--scan-on) shadow-lg">
                <Check aria-hidden="true" strokeWidth={3} className="size-8" />
              </span>
            )}
          </div>
          {phase !== 'foreign' && phase !== 'code' && (
            <p
              className={cx('absolute inset-x-6 text-center text-[15px] leading-snug font-medium text-white/90 [text-shadow:0_1px_3px_rgb(0_0_0/0.6)]', !idle && 'top-[68%]')}
              style={idle ? { top: idle[2].y + 26 } : undefined}
            >
              {hint}
            </p>
          )}
        </>
      )}

      {/* Arriba: cerrar, el título y la linterna. */}
      <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-3 px-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
        <button type="button" onClick={on.close} aria-label="Cerrar" className={roundBtn}>
          <X aria-hidden="true" className="size-6" />
        </button>
        <h2 className="truncate text-[17px] font-semibold tracking-[-0.01em] [text-shadow:0_1px_3px_rgb(0_0_0/0.5)]">Escanea el QR</h2>
        {torch.available && !problem ? (
          <button type="button" onClick={on.torch} aria-label="Linterna" aria-pressed={torch.on} className={cx(roundBtn, torch.on && 'bg-white text-black')}>
            {torch.on ? <Flashlight aria-hidden="true" className="size-[22px]" /> : <FlashlightOff aria-hidden="true" className="size-[22px]" />}
          </button>
        ) : (
          <span aria-hidden="true" className="size-11 shrink-0" />
        )}
      </div>

      {phase === 'code' && <CodePanel code={code} on={on} />}

      {/* Abajo: el aviso del QR de afuera, o «Elegir foto» y «Escribir el código». */}
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 px-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
        {note && (
          <p role="status" className={cx('animate-fade-up max-w-sm rounded-2xl px-4 py-2.5 text-center text-sm font-medium', glass)}>
            {note}
          </p>
        )}
        {phase === 'foreign' && foreign != null ? (
          <ForeignCard text={foreign} copied={copied} on={on} />
        ) : phase !== 'code' ? (
          <div className="flex w-full max-w-sm gap-2.5">
            {/* Cada uno con el ancho de su texto (en 360 px caben los dos sin cortar). */}
            <button type="button" onClick={on.photo} disabled={phase === 'photo'} className={cx(pillBtn, glass, 'flex-auto max-[389px]:gap-1.5 max-[389px]:px-3 max-[389px]:text-[14px]')}>
              <ImageIcon aria-hidden="true" className="size-[19px] shrink-0" /> Elegir foto
            </button>
            <button type="button" onClick={on.openCode} className={cx(pillBtn, glass, 'flex-auto max-[389px]:gap-1.5 max-[389px]:px-3 max-[389px]:text-[14px]')}>
              <Keyboard aria-hidden="true" className="size-[19px] shrink-0" /> <span className="truncate">Escribir el código</span>
            </button>
          </div>
        ) : null}
      </div>

      <input ref={fileRef} type="file" accept="image/*" tabIndex={-1} aria-hidden="true" className="hidden" onChange={on.file} />
      <p className="sr-only" aria-live="polite">
        {problem ? problem.title : phase === 'foreign' ? 'Ese QR no es de MatchMate' : hint}
      </p>
    </div>
  );
}

function ForeignCard({ text, copied, on }: { text: string; copied: boolean; on: ScannerHandlers }) {
  return (
    <section aria-labelledby="qr-ajeno" className={cx('animate-fade-up w-full max-w-sm rounded-[26px] p-4', glass)}>
      <h3 id="qr-ajeno" className="text-[17px] font-bold tracking-[-0.01em]">
        Ese QR no es de MatchMate
      </h3>
      <p className="mt-1 text-sm text-white/70">No lo abrimos. Esto es lo que dice:</p>
      <p className="mt-2.5 line-clamp-3 rounded-xl bg-white/10 px-3 py-2 font-mono text-[13px] leading-snug break-all text-white/90">{text}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={on.copy} className={cx(pillBtn, 'bg-white/12')}>
          {copied ? <Check aria-hidden="true" className="size-[18px]" /> : <Copy aria-hidden="true" className="size-[18px]" />}
          {copied ? 'Copiado' : 'Copiar'}
        </button>
        <button type="button" onClick={on.rescan} className={cx(pillBtn, accentBtn)}>
          Escanear otro
        </button>
      </div>
    </section>
  );
}

/** «Escribir el código»: arriba (el teclado del teléfono sale abajo y no lo tapa). */
function CodePanel({ code, on }: { code: string; on: ScannerHandlers }) {
  return (
    <form
      onSubmit={on.submitCode}
      aria-labelledby="qr-codigo"
      className={cx('animate-fade-up absolute inset-x-4 top-[calc(env(safe-area-inset-top)+4.5rem)] mx-auto max-w-sm rounded-[26px] p-4', glass)}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 id="qr-codigo" className="text-[17px] font-bold tracking-[-0.01em]">
          Escribe el código
        </h3>
        <button type="button" onClick={on.closeCode} aria-label="Volver a la cámara" className="-m-1.5 grid size-9 place-items-center rounded-full text-white/80 active:bg-white/10">
          <X aria-hidden="true" className="size-5" />
        </button>
      </div>
      <p className="mt-0.5 text-sm text-white/70">
        Son 8 letras y números, como <b className="font-bold tracking-wide text-white">ABCD2345</b>.
      </p>
      <div className="mt-3 flex gap-2">
        <input
          autoFocus
          value={code}
          onChange={(e) => on.code(e.target.value.toUpperCase())}
          placeholder="CÓDIGO"
          aria-label="Código de invitación"
          maxLength={12}
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
          className="h-12 min-w-0 flex-1 rounded-full bg-white/12 px-4 text-base font-semibold tracking-[0.1em] text-white uppercase placeholder:text-white/40 focus:outline-2 focus:outline-offset-1 focus:outline-(--scan-accent)"
        />
        <button type="submit" disabled={!codeReady(code)} className={cx(pillBtn, accentBtn, 'w-[96px] shrink-0 px-0')}>
          Unirme
        </button>
      </div>
    </form>
  );
}
