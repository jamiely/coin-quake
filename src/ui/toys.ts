import type { FigurineKind } from '../sim/physics';

export const TOY_NAMES: Record<FigurineKind, string> = {
  critter: 'GEAR CRITTER', professor: 'MINI PROFESSOR', bolt: 'BOLT TOY', duck: 'BRASS DUCK',
};

/** Small ink-outlined portraits matching the toys on the tray. */
export function toyPicture(kind: FigurineKind): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 160;
  canvas.setAttribute('aria-label', TOY_NAMES[kind]);
  const c = canvas.getContext('2d')!;
  const colors = { critter: '#7ed957', professor: '#ffd9b8', bolt: '#59c3ff', duck: '#ffd84a' };
  c.lineWidth = 5;
  c.strokeStyle = '#2b1533';
  const oval = (x: number, y: number, rx: number, ry: number, color: string) => {
    c.fillStyle = color; c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fill(); c.stroke();
  };
  oval(80, 139, 53, 12, '#ffd84a');
  oval(80, 105, 36, 35, kind === 'professor' ? '#ffffff' : colors[kind]);
  if (kind === 'critter') for (const x of [48, 112]) oval(x, 34, 15, 15, '#4a9b2f');
  if (kind === 'bolt') {
    c.beginPath(); c.moveTo(80, 37); c.lineTo(80, 15); c.stroke();
    oval(80, 13, 9, 9, '#ff3d7f');
  }
  oval(80, 64, 37, 34, colors[kind]);
  if (kind === 'professor') for (let i = 0; i < 5; i++) oval(49 + i * 15, 30 - i % 2 * 5, 13, 12, '#ffffff');
  for (const x of [66, 94]) {
    oval(x, 60, 11, 13, '#ffffff');
    oval(x + 2, 62, 4, 5, '#2b1533');
  }
  if (kind === 'duck') oval(80, 82, 22, 9, '#ff8a3d');
  else { c.beginPath(); c.arc(80, 76, 12, 0.2, Math.PI - 0.2); c.stroke(); }
  return canvas;
}
