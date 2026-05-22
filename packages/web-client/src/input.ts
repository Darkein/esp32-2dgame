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
      const prev = camera.scale.x;
      const next = Math.min(3, Math.max(0.4, prev * factor));
      if (next === prev) return;
      // Garde le point du monde sous le curseur fixe pendant le zoom.
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const worldX = (px - camera.x) / prev;
      const worldY = (py - camera.y) / prev;
      camera.scale.set(next);
      camera.x = px - worldX * next;
      camera.y = py - worldY * next;
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
