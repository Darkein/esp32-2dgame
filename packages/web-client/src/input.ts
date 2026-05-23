import type { Container } from 'pixi.js';

/** Seuil (px) en-dessous duquel un pointerdown/up est considéré comme un tap. */
const TAP_MAX_MOVE = 8;
/** Durée max (ms) d'un tap (au-delà : long press, ignoré). */
const TAP_MAX_DURATION_MS = 500;
/** Bornes du zoom (scale.x = scale.y). */
const ZOOM_MIN = 0.4;
const ZOOM_MAX = 3;

/** Caméra : pan (1 doigt / souris), pinch-zoom (2 doigts), molette (desktop), tap (sélection).
 *
 *  Implémentation hybride :
 *  - **Touch** → `TouchEvent` (chemin le plus stable pour le multi-touch sur iOS/Android ;
 *    `PointerEvent` souffre de bugs connus avec `setPointerCapture` quand un 2ᵉ doigt
 *    arrive — la 2ᵉ touche est parfois muette).
 *  - **Souris** → `PointerEvent` (`pointerType !== 'touch'`).
 *
 *  `onTap(clientX, clientY)` est appelé pour un tap court sans déplacement (et sans pinch).
 */
export function attachCameraControls(
  canvas: HTMLCanvasElement,
  camera: Container,
  onTap: (clientX: number, clientY: number) => void = () => {},
): void {
  // Force touch-action en JS aussi : certains assemblages CSS sont ignorés par PixiJS qui
  // pose son propre style sur le canvas. Sans ça, iOS interprète le pinch comme zoom de page.
  canvas.style.touchAction = 'none';

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

  // --- Tactile (TouchEvent) -------------------------------------------------
  // État du geste tactile en cours. `last1`/`last2` = position des doigts à l'event précédent.
  let last1: { x: number; y: number } | null = null;
  let last2: { x: number; y: number } | null = null;
  let lastPinchDist = 0;
  // Suivi du tap : départ + déplacement cumulé du premier doigt.
  let touchStartX = 0;
  let touchStartY = 0;
  let touchStartedAt = 0;
  let touchMoved = false;
  /** Vrai dès qu'un 2ᵉ doigt s'est posé pendant le geste — invalide le tap. */
  let wasMultiTouch = false;
  /** Indicateur global : un geste tactile est en cours (utilisé pour ignorer les `pointer*`
   *  synthétisés que certains navigateurs émettent en parallèle des touches). */
  let touchActive = false;

  canvas.addEventListener(
    'touchstart',
    (e) => {
      touchActive = true;
      if (e.touches.length === 1) {
        const t = e.touches[0]!;
        last1 = { x: t.clientX, y: t.clientY };
        last2 = null;
        touchStartX = t.clientX;
        touchStartY = t.clientY;
        touchStartedAt = performance.now();
        touchMoved = false;
        wasMultiTouch = false;
        lastPinchDist = 0;
      } else if (e.touches.length >= 2) {
        const a = e.touches[0]!;
        const b = e.touches[1]!;
        last1 = { x: a.clientX, y: a.clientY };
        last2 = { x: b.clientX, y: b.clientY };
        lastPinchDist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        wasMultiTouch = true;
        touchMoved = true; // un pinch n'est jamais un tap
      }
      e.preventDefault();
    },
    { passive: false },
  );

  canvas.addEventListener(
    'touchmove',
    (e) => {
      e.preventDefault();
      if (e.touches.length === 1 && last1) {
        const t = e.touches[0]!;
        const dx = t.clientX - last1.x;
        const dy = t.clientY - last1.y;
        camera.x += dx;
        camera.y += dy;
        last1 = { x: t.clientX, y: t.clientY };
        if (Math.abs(t.clientX - touchStartX) + Math.abs(t.clientY - touchStartY) > TAP_MAX_MOVE) {
          touchMoved = true;
        }
      } else if (e.touches.length >= 2) {
        const a = e.touches[0]!;
        const b = e.touches[1]!;
        const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        const mid = { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
        if (lastPinchDist > 0 && dist > 0) {
          zoomAt(dist / lastPinchDist, mid.x, mid.y);
        }
        // Pan additionnel = déplacement du milieu entre les deux events.
        if (last1 && last2) {
          const oldMid = { x: (last1.x + last2.x) / 2, y: (last1.y + last2.y) / 2 };
          camera.x += mid.x - oldMid.x;
          camera.y += mid.y - oldMid.y;
        }
        last1 = { x: a.clientX, y: a.clientY };
        last2 = { x: b.clientX, y: b.clientY };
        lastPinchDist = dist;
        wasMultiTouch = true;
        touchMoved = true;
      }
    },
    { passive: false },
  );

  const touchEnd = (e: TouchEvent) => {
    if (e.touches.length === 0) {
      // Tous les doigts levés : check tap (1 doigt, court, sans déplacement, sans pinch).
      const dur = performance.now() - touchStartedAt;
      if (!wasMultiTouch && !touchMoved && dur < TAP_MAX_DURATION_MS) {
        onTap(touchStartX, touchStartY);
      }
      last1 = null;
      last2 = null;
      lastPinchDist = 0;
      // Petit délai avant de réautoriser les events pointeur (iOS peut émettre un
      // `mousedown` synthétisé après un tap, qu'on veut ignorer).
      setTimeout(() => {
        touchActive = false;
      }, 100);
    } else if (e.touches.length === 1) {
      // Geste 2-doigts qui devient 1-doigt : on continue en pan, sans relancer un tap.
      const t = e.touches[0]!;
      last1 = { x: t.clientX, y: t.clientY };
      last2 = null;
      lastPinchDist = 0;
      // touchMoved/wasMultiTouch restent vrais → release final ne génère pas de tap parasite.
    }
  };
  canvas.addEventListener('touchend', touchEnd, { passive: true });
  canvas.addEventListener('touchcancel', touchEnd, { passive: true });

  // --- Souris (PointerEvent, hors `touch`) ---------------------------------
  let mouseDragging = false;
  let mouseLastX = 0;
  let mouseLastY = 0;
  let mouseStartX = 0;
  let mouseStartY = 0;
  let mouseStartedAt = 0;
  let mouseMoved = false;

  const isMouseLike = (e: PointerEvent) => e.pointerType !== 'touch' && !touchActive;

  canvas.addEventListener('pointerdown', (e) => {
    if (!isMouseLike(e)) return;
    canvas.setPointerCapture(e.pointerId);
    mouseDragging = true;
    mouseLastX = e.clientX;
    mouseLastY = e.clientY;
    mouseStartX = e.clientX;
    mouseStartY = e.clientY;
    mouseStartedAt = performance.now();
    mouseMoved = false;
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!isMouseLike(e) || !mouseDragging) return;
    camera.x += e.clientX - mouseLastX;
    camera.y += e.clientY - mouseLastY;
    mouseLastX = e.clientX;
    mouseLastY = e.clientY;
    if (Math.abs(e.clientX - mouseStartX) + Math.abs(e.clientY - mouseStartY) > TAP_MAX_MOVE) {
      mouseMoved = true;
    }
  });
  const mouseEnd = (e: PointerEvent) => {
    if (!isMouseLike(e) || !mouseDragging) return;
    mouseDragging = false;
    const dur = performance.now() - mouseStartedAt;
    if (!mouseMoved && dur < TAP_MAX_DURATION_MS) {
      onTap(mouseStartX, mouseStartY);
    }
  };
  canvas.addEventListener('pointerup', mouseEnd);
  canvas.addEventListener('pointercancel', mouseEnd);

  // Molette (desktop) : zoom centré sur le curseur.
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      zoomAt(factor, e.clientX, e.clientY);
    },
    { passive: false },
  );

  // Verrous de défense (iOS Safari notamment).
  canvas.addEventListener('gesturestart', (e) => e.preventDefault());
  canvas.addEventListener('gesturechange', (e) => e.preventDefault());
  canvas.addEventListener('gestureend', (e) => e.preventDefault());
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}
