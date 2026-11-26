import * as THREE from 'three';

/** One burst request: `count` particles from `at`, flying out at `speed` within a cone around `dir`. */
export interface Burst {
  at: THREE.Vector3Like;
  count: number;
  color: THREE.ColorRepresentation;
  speed: number;
  /** Mean direction; omit for a sphere. */
  dir?: THREE.Vector3Like;
  /** Cone half-angle in radians around `dir`. */
  spread?: number;
  size?: number;
  life?: number;
  gravity?: number;
  drag?: number;
  /** Spin the quad (confetti). */
  spin?: boolean;
  /** Soft round spark, or a flat square chip (confetti, debris). */
  shape?: 'spark' | 'chip';
}

const UP = new THREE.Vector3(0, 1, 0);

/**
 * A fixed-size pool of camera-facing particles drawn in one instanced call. When full, the oldest slots are recycled,
 * so a new burst always shows. Live particles are packed into the first instances each frame, so only they are drawn.
 */
export class ParticlePool {
  readonly mesh: THREE.InstancedMesh;
  live = 0;
  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly age: Float32Array;
  private readonly life: Float32Array;
  private readonly size: Float32Array;
  private readonly grav: Float32Array;
  private readonly drag: Float32Array;
  private readonly spin: Float32Array;
  private readonly shape: Float32Array;
  private readonly colors: Float32Array;
  private readonly drawnShape: THREE.InstancedBufferAttribute;
  private next = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly spinQ = new THREE.Quaternion();
  private readonly s = new THREE.Vector3();
  private readonly p = new THREE.Vector3();
  private readonly v = new THREE.Vector3();
  private readonly c = new THREE.Color();
  private readonly axis = new THREE.Vector3(0, 0, 1);

  constructor(readonly capacity = 4000) {
    const geo = new THREE.PlaneGeometry(1, 1);
    this.drawnShape = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
    this.drawnShape.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('shape', this.drawnShape);
    const mat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float shape;\nvarying float vShape;\nvarying vec2 vQuad;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvShape = shape;\nvQuad = position.xy;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vShape;\nvarying vec2 vQuad;')
        .replace(
          '#include <alphatest_fragment>',
          'float r = length(vQuad) * 2.0;\n' +
            'diffuseColor.a *= vShape < 0.5 ? smoothstep(1.0, 0.35, r) : 1.0;\n' +
            'if (diffuseColor.a < 0.02) discard;',
        );
    };
    this.mesh = new THREE.InstancedMesh(geo, mat, capacity);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, this.c.set('#ffffff'));
    this.mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.renderOrder = 10;
    this.pos = new Float32Array(capacity * 3);
    this.vel = new Float32Array(capacity * 3);
    this.colors = new Float32Array(capacity * 3);
    this.age = new Float32Array(capacity).fill(1);
    this.life = new Float32Array(capacity).fill(1);
    this.size = new Float32Array(capacity);
    this.grav = new Float32Array(capacity);
    this.drag = new Float32Array(capacity);
    this.spin = new Float32Array(capacity);
    this.shape = new Float32Array(capacity);
  }

  burst(b: Burst, rand: () => number = Math.random): void {
    const spread = b.spread ?? Math.PI;
    const toDir = b.dir ? new THREE.Quaternion().setFromUnitVectors(UP, new THREE.Vector3(b.dir.x, b.dir.y, b.dir.z).normalize()) : null;
    const base = new THREE.Color(b.color);
    for (let n = 0; n < b.count; n++) {
      const i = this.next;
      this.next = (this.next + 1) % this.capacity;
      // Uniform on the sphere, or within a cone of half-angle `spread` around `dir`.
      const cosT = toDir ? 1 - rand() * (1 - Math.cos(spread)) : rand() * 2 - 1;
      const sinT = Math.sqrt(Math.max(0, 1 - cosT * cosT));
      const phi = rand() * Math.PI * 2;
      this.v.set(sinT * Math.cos(phi), cosT, sinT * Math.sin(phi));
      if (toDir) this.v.applyQuaternion(toDir);
      this.v.multiplyScalar(b.speed * (0.45 + 0.55 * rand()));
      this.pos[i * 3] = b.at.x;
      this.pos[i * 3 + 1] = b.at.y;
      this.pos[i * 3 + 2] = b.at.z;
      this.v.toArray(this.vel, i * 3);
      this.age[i] = 0;
      this.life[i] = (b.life ?? 0.6) * (0.6 + 0.4 * rand());
      this.size[i] = (b.size ?? 0.6) * (0.6 + 0.4 * rand());
      this.grav[i] = b.gravity ?? -60;
      this.drag[i] = b.drag ?? 2.5;
      this.spin[i] = b.spin ? (rand() - 0.5) * 20 : 0;
      this.shape[i] = b.shape === 'chip' ? 1 : 0;
      // Slight hue and lightness jitter keeps bursts lively.
      this.c.copy(base).offsetHSL((rand() - 0.5) * 0.04, 0, (rand() - 0.5) * 0.15).toArray(this.colors, i * 3);
    }
  }

  /** Simulates every live particle and packs them into the first `live` instances. `dt` is real seconds. */
  update(dt: number, camera: THREE.Camera): void {
    let live = 0;
    for (let i = 0; i < this.capacity; i++) {
      if (this.age[i]! >= this.life[i]!) continue;
      this.age[i] = this.age[i]! + dt;
      const u = this.age[i]! / this.life[i]!;
      if (u >= 1) continue;
      const o = i * 3;
      const k = Math.exp(-this.drag[i]! * dt);
      this.vel[o] = this.vel[o]! * k;
      this.vel[o + 1] = this.vel[o + 1]! * k + this.grav[i]! * dt;
      this.vel[o + 2] = this.vel[o + 2]! * k;
      this.pos[o] = this.pos[o]! + this.vel[o]! * dt;
      this.pos[o + 1] = this.pos[o + 1]! + this.vel[o + 1]! * dt;
      this.pos[o + 2] = this.pos[o + 2]! + this.vel[o + 2]! * dt;
      // Pop in fast, shrink out: a cartoon spark envelope.
      const scale = this.size[i]! * Math.min(1, u * 8) * (1 - u * u);
      this.q.copy(camera.quaternion);
      if (this.spin[i]) this.q.multiply(this.spinQ.setFromAxisAngle(this.axis, this.spin[i]! * this.age[i]!));
      this.m.compose(this.p.fromArray(this.pos, o), this.q, this.s.setScalar(scale));
      this.mesh.setMatrixAt(live, this.m);
      this.mesh.setColorAt(live, this.c.fromArray(this.colors, o));
      this.drawnShape.setX(live, this.shape[i]!);
      live++;
    }
    this.live = live;
    this.mesh.count = live;
    if (live) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.mesh.instanceColor!.needsUpdate = true;
      this.drawnShape.needsUpdate = true;
    }
  }
}
