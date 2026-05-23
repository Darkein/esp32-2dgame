import type { Container } from 'pixi.js';

/** Seuil (px) en-dessous duquel un pointerdown/up est considéré comme un tap. */
const TAP_MAX_MOVE = 8;
/** Durée max (ms) d'un tap (au-delà : long press, ignoré). */
const TAP_MAX_DURATION_MS = 500;
/** Bornes du zoom (scale.x = scale.y). */
const ZOOM_MIN = 0.4;
const ZOOM_MAX = 3;

interface Pointer {
  x: number;
  y: number;
  startX: number;
  startY: number;
  startedAt: number;
  moved: boolean;
}

/** Caméra : pan (1 doigt / souris), pinch-zoom (2 doigts), molette (desktop), tap (sélection).
 *  `onTap(clientX, clientY)` est appelé pour un tap court sans déplacement (ni pinch). */
export function attachCameraControls(
  canvas: HTMLCanvasElement,
  camera: Container,
  onTap: (clientX: number, clientY: number) => void = () => {},
): void {
  const pointers = new Map<number, Pointer>();
  /** Distance entre les deux pointeurs au dernier event (pour calculer le delta de pinch). */
  let lastPinchDist = 0;
  /** Vrai si le geste en cours est un pinch (≥2 doigts) — invalide la sélection au release. */
  let gesturedAsPinch = false;

  const distanceOf = (a: Pointer, b: Pointer): number => Math.hypot(a.x - b.x, a.y - b.y);
  const midpointOf = (a: Pointer, b: Pointer): { x: number; y: number } => ({
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  });

  /** Zoome autour d'un point écran (anchor), en gardant le point du monde sous l'anchor fixe. */
  const zoomAt = (factor: number, anchorX: number, anchorY: number): void => {
    const prev = camera.scale.x;
    const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, prev * factor));
    if (next === prev) return;
    const rect = canvas.getBoundingClientRect();
    const px = anchorX - rect.left;
    const py = anchorY - rect.top;
    const worldX = (px - camera.x) / prev;
    const worldY = (py - camera.y) / prev;
    camera.scale.set(next);
    camera.x = px - worldX * next;
    camera.y = py - worldY * next;
  };

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, {
      x: e.clientX,
      y: e.clientY,
      startX: e.clientX,
      startY: e.clientY,
      startedAt: performance.now(),
      moved: false,
    });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      lastPinchDist = distanceOf(a!, b!);
      gesturedAsPinch = true; // dès qu'un 2e doigt touche, le geste n'est plus une sélection
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const prevX = p.x;
    const prevY = p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (Math.abs(p.x - p.startX) + Math.abs(p.y - p.startY) > TAP_MAX_MOVE) p.moved = true;

    if (pointers.size >= 2) {
      // Pinch : deux doigts → ajuste le zoom et pan via le centre du segment.
      const [a, b] = [...pointers.values()];
      const dist = distanceOf(a!, b!);
      const mid = midpointOf(a!, b!);
      if (lastPinchDist > 0 && dist > 0) {
        const factor = dist / lastPinchDist;
        zoomAt(factor, mid.x, mid.y);
      }
      lastPinchDist = dist;
      // Pan du centre : décalage du midpoint entre l'event précédent et celui-ci.
      // On l'estime par la moyenne des déplacements des deux doigts ce frame.
      const dxAvg = (p.x - prevX) / 2;
      const dyAvg = (p.y - prevY) / 2;
      camera.x += dxAvg;
      camera.y += dyAvg;
    } else if (pointers.size === 1) {
      // Pan : 1 doigt / souris.
      camera.x += p.x - prevX;
      camera.y += p.y - prevY;
    }
  });

  const release = (e: PointerEvent) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const wasSingle = pointers.size === 1; // un seul pointeur encore actif → c'est lui qui se lève
    pointers.delete(e.pointerId);
    if (pointers.size < 2) lastPinchDist = 0;
    // Tap : un seul doigt, sans pinch concurrent, sans déplacement, et bref.
    const duration = performance.now() - p.startedAt;
    if (wasSingle && !gesturedAsPinch && !p.moved && duration < TAP_MAX_DURATION_MS) {
      onTap(p.startX, p.startY);
    }
    if (pointers.size === 0) gesturedAsPinch = false;
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  // pointerleave est trop agressif quand on capture : on s'en remet à up/cancel.

  // Molette (desktop) : zoom centré sur le curseur, comportement inchangé.
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      zoomAt(factor, e.clientX, e.clientY);
    },
    { passive: false },
  );

  // Verrou de défense : certains navigateurs envoient encore des gestes natifs si on ne
  // bloque pas explicitement (iOS Safari peut tenter un zoom de page malgré viewport).
  canvas.addEventListener('gesturestart', (e) => e.preventDefault());
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}
