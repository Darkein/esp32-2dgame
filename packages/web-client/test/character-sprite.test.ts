import { describe, it, expect } from 'vitest';
import { inferDirection } from '../src/sprites/character-sprite';

describe('inferDirection', () => {
  it('renvoie la direction cardinale dominante', () => {
    expect(inferDirection(1, 0, 'down')).toBe('right');
    expect(inferDirection(-1, 0, 'down')).toBe('left');
    expect(inferDirection(0, 1, 'right')).toBe('down');
    expect(inferDirection(0, -1, 'right')).toBe('up');
  });

  it('privilégie l\'axe dominant en diagonale', () => {
    expect(inferDirection(0.7, 0.2, 'down')).toBe('right');
    expect(inferDirection(0.2, -0.7, 'right')).toBe('up');
  });

  it('garde la direction précédente sous le seuil (zone morte anti-jitter)', () => {
    expect(inferDirection(0.01, 0.01, 'left')).toBe('left');
    expect(inferDirection(0, 0, 'up')).toBe('up');
  });

  it('en cas d\'égalité parfaite, l\'axe vertical l\'emporte (ax > ay est faux)', () => {
    // ax === ay : la condition est `ax > ay`, donc on tombe sur la branche verticale.
    expect(inferDirection(0.5, 0.5, 'right')).toBe('down');
    expect(inferDirection(-0.5, -0.5, 'right')).toBe('up');
  });
});
