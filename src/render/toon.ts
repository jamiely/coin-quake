import * as THREE from 'three';

/** Dark plum ink, never pure black (the art style in GAME_DESIGN.md §1). */
export const INK = '#2b1533';

export const PALETTE = {
  cherry: '#e8344e',
  cherryDark: '#a81f3a',
  cream: '#fff1d6',
  mint: '#5fe0b4',
  sky: '#59c3ff',
  gold: '#ffc83a',
  goldDark: '#d98a10',
  plum: '#4a2457',
  wall: '#3a1f52',
  hot: '#ff5a1f',
};

let ramp: THREE.DataTexture | null = null;

/** Three-step light ramp: shadow, mid, lit. Nearest filtering keeps the bands hard, like cel shading. */
export function toonRamp(): THREE.DataTexture {
  if (ramp) return ramp;
  const steps = new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255]);
  ramp = new THREE.DataTexture(steps, 3, 1, THREE.RGBAFormat);
  ramp.minFilter = ramp.magFilter = THREE.NearestFilter;
  ramp.generateMipmaps = false;
  ramp.needsUpdate = true;
  return ramp;
}

export function toon(color: THREE.ColorRepresentation, opts: { map?: THREE.Texture; emissive?: THREE.ColorRepresentation; emissiveIntensity?: number } = {}): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({
    color,
    gradientMap: toonRamp(),
    map: opts.map ?? null,
    emissive: opts.emissive ?? '#000000',
    emissiveIntensity: opts.emissiveIntensity ?? 1,
  });
}

const outlineMaterial = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });

/**
 * Inverted-hull ink outline: a slightly fattened back-face copy drawn in ink. `width` is in world units (cm).
 * Works on any mesh whose geometry has vertex normals.
 */
export function outlined(mesh: THREE.Mesh, width = 0.35): THREE.Mesh {
  const hull = new THREE.Mesh(fatten(mesh.geometry, width), outlineMaterial);
  hull.name = 'outline';
  mesh.add(hull);
  return mesh;
}

/** A copy of `geometry` with every vertex pushed out along its (merged) normal by `width`. */
export function fatten(geometry: THREE.BufferGeometry, width: number): THREE.BufferGeometry {
  const g = geometry.clone();
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  // Average normals of coincident vertices, so hard edges (box corners, cylinder rims) do not split the hull.
  const key = (i: number) => `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
  g.computeVertexNormals();
  const nrm = g.getAttribute('normal') as THREE.BufferAttribute;
  const sums = new Map<string, THREE.Vector3>();
  for (let i = 0; i < pos.count; i++) {
    const k = key(i);
    const s = sums.get(k) ?? new THREE.Vector3();
    s.x += nrm.getX(i);
    s.y += nrm.getY(i);
    s.z += nrm.getZ(i);
    sums.set(k, s);
  }
  for (let i = 0; i < pos.count; i++) {
    const n = sums.get(key(i))!.clone().normalize();
    pos.setXYZ(i, pos.getX(i) + n.x * width, pos.getY(i) + n.y * width, pos.getZ(i) + n.z * width);
  }
  pos.needsUpdate = true;
  return g;
}

export function outlineMat(): THREE.MeshBasicMaterial {
  return outlineMaterial;
}
