// Vue PixiJS d'un personnage à 4 directions et plusieurs animations nommées
// (idle/walk/busy/sleep…). Gère le swap des textures à chaque changement de cap
// OU d'animation, l'arrêt en idle (frame 0), et le tri Y. Générique faune/agents.

import { AnimatedSprite, Container } from 'pixi.js';
import { type CompiledSprite, type Direction, inferDirection } from './character-sprite';

export class CharacterView {
  readonly container: Container;
  private sprite: AnimatedSprite;
  private dir: Direction = 'down';
  private compiled: CompiledSprite;
  private animName: string;
  /** Dernière position « monde » (tuiles), pour le calcul de direction. */
  private lastWorld = { x: 0, y: 0 };
  /** Forcé : ignore la direction inférée (utile pour `sleep` qui n'a qu'une pose). */
  private lockedDirection: Direction | null = null;

  constructor(compiled: CompiledSprite) {
    this.compiled = compiled;
    this.animName = compiled.defaultAnimation;
    const anim = compiled.animations[this.animName]!;
    this.container = new Container();
    this.sprite = new AnimatedSprite(anim.textures.down);
    this.sprite.anchor.set(0.5, compiled.anchorY);
    this.sprite.animationSpeed = anim.fps / 60;
    this.sprite.play();
    this.container.addChild(this.sprite);
  }

  setScreen(x: number, y: number): void {
    this.container.x = x;
    this.container.y = y;
    this.container.zIndex = y;
  }

  setWorld(x: number, y: number): void {
    this.lastWorld.x = x;
    this.lastWorld.y = y;
  }

  /** Bascule l'animation (idle/walk/busy/sleep…) si elle change. */
  setAnimation(name: string, lockedDirection: Direction | null = null): void {
    if (this.animName === name && this.lockedDirection === lockedDirection) return;
    if (!this.compiled.animations[name]) return; // inconnu : on ignore
    this.animName = name;
    this.lockedDirection = lockedDirection;
    const dir = lockedDirection ?? this.dir;
    const anim = this.compiled.animations[name]!;
    this.sprite.textures = anim.textures[dir];
    this.sprite.animationSpeed = anim.fps / 60;
    this.sprite.gotoAndPlay(0);
  }

  /** Calcule la direction depuis un déplacement (`dx`, `dy` en tuiles) et bascule
   *  les textures si elle change. Ignoré si une direction est verrouillée. */
  faceFromMovement(dx: number, dy: number): void {
    if (this.lockedDirection) return;
    const next = inferDirection(dx, dy, this.dir);
    if (next === this.dir) return;
    this.dir = next;
    const anim = this.compiled.animations[this.animName]!;
    this.sprite.textures = anim.textures[next];
    this.sprite.gotoAndPlay(0);
  }

  /** Fige sur la frame 0 (utile pour les animations qui ne doivent jouer qu'en mouvement). */
  setIdleFrozen(idle: boolean): void {
    if (idle && this.sprite.playing) {
      this.sprite.gotoAndStop(0);
    } else if (!idle && !this.sprite.playing) {
      this.sprite.play();
    }
  }

  /** Tinte le sprite (utile pour distinguer les agents : tons de vêtements). */
  setTint(tint: number): void {
    this.sprite.tint = tint;
  }

  get direction(): Direction {
    return this.dir;
  }

  get lastWorldPos(): { x: number; y: number } {
    return this.lastWorld;
  }

  get currentAnimation(): string {
    return this.animName;
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
