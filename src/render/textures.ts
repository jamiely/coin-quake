import * as THREE from 'three';
import { INK, PALETTE } from './toon';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function texture(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Coin face: gold disc with an inked rim, a raised star and a highlight glint. */
export function coinFace(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  g.fillStyle = PALETTE.gold;
  g.fillRect(0, 0, 128, 128);
  g.lineWidth = 8;
  g.strokeStyle = PALETTE.goldDark;
  g.beginPath();
  g.arc(64, 64, 50, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = PALETTE.goldDark;
  star(g, 64, 66, 30, 13);
  g.fillStyle = '#fff4b8';
  star(g, 62, 62, 26, 11);
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.beginPath();
  g.ellipse(40, 34, 14, 6, -0.6, 0, Math.PI * 2);
  g.fill();
  return texture(c);
}

function star(g: CanvasRenderingContext2D, x: number, y: number, outer: number, inner: number): void {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? inner : outer;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    g.lineTo(x + r * Math.cos(a), y + r * Math.sin(a));
  }
  g.closePath();
  g.fill();
}

/** Factory back wall: plum bricks, big silhouette gears and pipes, in flat cartoon colors. */
export function backWall(): THREE.CanvasTexture {
  const [c, g] = canvas(512, 1024);
  const grad = g.createLinearGradient(0, 0, 0, 1024);
  grad.addColorStop(0, '#5a2e78');
  grad.addColorStop(1, '#2a1640');
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 1024);
  g.strokeStyle = 'rgba(0,0,0,0.18)';
  g.lineWidth = 4;
  for (let y = 0; y < 1024; y += 48) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(512, y);
    g.stroke();
    for (let x = (y / 48) % 2 ? 0 : 48; x < 512; x += 96) {
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x, y + 48);
      g.stroke();
    }
  }
  g.fillStyle = 'rgba(20,6,30,0.45)';
  gear(g, 90, 220, 120, 14);
  gear(g, 430, 520, 150, 16);
  gear(g, 120, 820, 90, 12);
  g.strokeStyle = 'rgba(255,170,90,0.35)';
  g.lineWidth = 26;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(512, 120);
  g.lineTo(330, 120);
  g.quadraticCurveTo(280, 120, 280, 170);
  g.lineTo(280, 380);
  g.stroke();
  return texture(c);
}

function gear(g: CanvasRenderingContext2D, x: number, y: number, r: number, teeth: number): void {
  g.beginPath();
  for (let i = 0; i < teeth * 2; i++) {
    const a = (i * Math.PI) / teeth;
    const rr = i % 2 ? r : r * 1.18;
    g.lineTo(x + rr * Math.cos(a - 0.12), y + rr * Math.sin(a - 0.12));
    g.lineTo(x + rr * Math.cos(a + 0.12), y + rr * Math.sin(a + 0.12));
  }
  g.closePath();
  g.arc(x, y, r * 0.35, 0, Math.PI * 2, true);
  g.fill();
}

/** Chunky outlined cartoon text, like the Lumberjack title, drawn onto a canvas. */
export function chunkyText(g: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, fill: string, align: CanvasTextAlign = 'center'): void {
  g.font = `900 ${size}px "Arial Black", "Arial Rounded MT Bold", system-ui, sans-serif`;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = size * 0.22;
  g.strokeStyle = INK;
  g.strokeText(text, x, y + size * 0.06);
  g.fillStyle = fill;
  g.fillText(text, x, y);
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.save();
  g.beginPath();
  g.rect(0, y - size * 0.5, g.canvas.width, size * 0.28);
  g.clip();
  g.fillText(text, x, y);
  g.restore();
}

/** A sign plate texture, repainted by the caller through `paint`. */
export function signCanvas(w: number, h: number): { ctx: CanvasRenderingContext2D; texture: THREE.CanvasTexture } {
  const [c, g] = canvas(w, h);
  return { ctx: g, texture: texture(c) };
}

/** Rounded rectangle path helper for signs. */
export function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}
