import type { Container } from 'pixi.js';

/** Caméra : pan (glisser souris/doigt) + zoom (molette / pincement). */
export function attachCameraControls(canvas: HTMLCanvasElement, camera: Container): void {
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let moved = false;

  canvas.addEventListener('pointerdown', (e) => {
    dragging = true;
    moved = false;
    lastX = e.clientX;
    lastY = e.clientY;
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
    camera.x += dx;
    camera.y += dy;
    lastX = e.clientX;
    lastY = e.clientY;
  });
  const stop = () => (dragging = false);
  canvas.addEventListener('pointerup', stop);
  canvas.addEventListener('pointerleave', stop);

  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      const next = Math.min(3, Math.max(0.4, camera.scale.x * factor));
      camera.scale.set(next);
    },
    { passive: false },
  );

  // Empêche la sélection d'agent juste après un glisser.
  canvas.addEventListener(
    'click',
    (e) => {
      if (moved) {
        e.stopImmediatePropagation();
        e.preventDefault();
      }
    },
    true,
  );
}
