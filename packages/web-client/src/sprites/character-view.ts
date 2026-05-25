// Vue PixiJS d'un personnage à 4 directions. Cache le swap de textures à chaque
// changement de cap, l'arrêt en idle (frame 0), et le tri Y. Conçue générique pour
// que les agents (à venir) la réutilisent telle quelle.

import { AnimatedSprite, Container } from 'pixi.js';
import { type CompiledSprite, type Direction, inferDirection } from './character-sprite';

export class CharacterView {
  readonly container: Container;
  private sprite: AnimatedSprite;
  private dir: Direction = 'down';
  private compiled: CompiledSprite;
  /** Dernière position « monde » (tuiles), pour calculer le delta de direction. */
  private lastWorld = { x: 0, y: 0 };

  constructor(compiled: CompiledSprite) {
    this.compiled = compiled;
    this.container = new Container();
    this.sprite = new AnimatedSprite(compiled.textures.down);
    this.sprite.anchor.set(0.5, compiled.anchorY);
    this.sprite.animationSpeed = compiled.fps / 60; // PixiJS ticker ~60 Hz par défaut
    this.sprite.play();
    this.container.addChild(this.sprite);
  }

  /** Pose la position écran de la vue (la conversion iso est faite par l'appelant). */
  setScreen(x: number, y: number): void {
    this.container.x = x;
    this.container.y = y;
    this.container.zIndex = y;
  }

  /** Met à jour la position « monde » connue (sert au calcul de direction sur la frame suivante). */
  setWorld(x: number, y: number): void {
    this.lastWorld.x = x;
    this.lastWorld.y = y;
  }

  /** Calcule la direction depuis un déplacement (`dx`, `dy` en tuiles) et bascule
   *  les textures si nécessaire. */
  faceFromMovement(dx: number, dy: number): void {
    const next = inferDirection(dx, dy, this.dir);
    if (next === this.dir) return;
    this.dir = next;
    this.sprite.textures = this.compiled.textures[next];
    this.sprite.gotoAndPlay(0);
  }

  /** En idle, fige sur la frame 0 de la direction courante (le perso « regarde » mais ne marche pas). */
  setIdle(idle: boolean): void {
    if (idle && this.sprite.playing) {
      this.sprite.gotoAndStop(0);
    } else if (!idle && !this.sprite.playing) {
      this.sprite.play();
    }
  }

  get direction(): Direction {
    return this.dir;
  }

  get lastWorldPos(): { x: number; y: number } {
    return this.lastWorld;
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
