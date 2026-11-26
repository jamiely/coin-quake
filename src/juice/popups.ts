import * as THREE from 'three';

export interface PopupStyle {
  fill: string;
  /** Outline (ink) color. */
  ink: string;
  /** Text height in world units. */
  size: number;
  life?: number;
  /** Upward drift in world units per second. */
  rise?: number;
  /** Rotation wobble on pop, radians. */
  tilt?: number;
}

interface Popup {
  sprite: THREE.Sprite;
  tex: THREE.CanvasTexture;
  canvas: HTMLCanvasElement;
  age: number;
  life: number;
  rise: number;
  baseScale: THREE.Vector2;
  tilt: number;
}

const FONT = '900 {size}px "Arial Black", "Arial Rounded MT Bold", system-ui, sans-serif';

/**
 * World-anchored, outlined cartoon text ("+20", "HOT!", "COMBO x7") that springs up with an overshoot, drifts and
 * fades. A small recycled pool of canvas sprites; the oldest is reused when all are busy.
 */
export class PopupPool {
  readonly group = new THREE.Group();
  private readonly items: Popup[] = [];
  private next = 0;

  constructor(capacity = 32) {
    for (let i = 0; i < capacity; i++) {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 128;
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, toneMapped: false }));
      sprite.visible = false;
      sprite.renderOrder = 20;
      this.group.add(sprite);
      this.items.push({ sprite, tex, canvas, age: 1, life: 1, rise: 0, baseScale: new THREE.Vector2(), tilt: 0 });
    }
  }

  show(text: string, at: THREE.Vector3Like, style: PopupStyle): void {
    const p = this.items[this.next]!;
    this.next = (this.next + 1) % this.items.length;
    const g = p.canvas.getContext('2d')!;
    g.clearRect(0, 0, p.canvas.width, p.canvas.height);
    let px = 96;
    g.font = FONT.replace('{size}', String(px));
    const w = g.measureText(text).width + px * 0.3;
    if (w > p.canvas.width) {
      px = Math.floor((px * p.canvas.width) / w);
      g.font = FONT.replace('{size}', String(px));
    }
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.lineWidth = px * 0.24;
    g.strokeStyle = style.ink;
    g.strokeText(text, 256, 68);
    g.fillStyle = style.fill;
    g.fillText(text, 256, 64);
    p.tex.needsUpdate = true;
    p.sprite.position.set(at.x, at.y, at.z);
    p.baseScale.set(style.size * 4, style.size);
    p.age = 0;
    p.life = style.life ?? 0.9;
    p.rise = style.rise ?? 6;
    p.tilt = (Math.random() - 0.5) * (style.tilt ?? 0.3);
    p.sprite.visible = true;
  }

  update(dt: number): void {
    for (const p of this.items) {
      if (!p.sprite.visible) continue;
      p.age += dt;
      const u = p.age / p.life;
      if (u >= 1) {
        p.sprite.visible = false;
        continue;
      }
      // Spring pop: overshoot to 1.35 then settle to 1, shrink in the last 30%.
      const pop = u < 0.15 ? (u / 0.15) * 1.35 : u < 0.3 ? 1.35 - ((u - 0.15) / 0.15) * 0.35 : 1;
      const out = u > 0.7 ? 1 - (u - 0.7) / 0.3 : 1;
      p.sprite.scale.set(p.baseScale.x * pop * out, p.baseScale.y * pop * out, 1);
      p.sprite.position.y += p.rise * dt * (1 - u);
      (p.sprite.material as THREE.SpriteMaterial).rotation = p.tilt * (1 - u);
      (p.sprite.material as THREE.SpriteMaterial).opacity = Math.min(1, out * 1.5);
    }
  }
}
