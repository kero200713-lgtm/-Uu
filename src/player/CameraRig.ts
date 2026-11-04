import * as THREE from 'three';
import { Grid, BLOCK_CAM } from '../world/Grid';
import { settings } from '../core/Settings';

/**
 * Over-the-shoulder third-person camera with wall/ceiling collision, aim
 * zoom, smoothed distance recovery and trauma-based shake.
 */
export class CameraRig {
  yaw = 0; pitch = -0.12;
  aim = 0;              // 0..1 blend toward aim framing
  dist = 2.5;
  target = new THREE.Vector3();
  pos = new THREE.Vector3();
  trauma = 0;
  fovBase = 62;
  private t = 0;
  grid: Grid | null = null;
  ceiling = 3;
  indoor = false;
  cinematic: { pos: THREE.Vector3; look: THREE.Vector3; w: number } | null = null;
  private lookTmp = new THREE.Vector3();
  private fwdTmp = new THREE.Vector3();
  shoulder = 1; // +1 right, -1 left

  constructor(public cam: THREE.PerspectiveCamera) {}

  addLook(dx: number, dy: number) {
    const s = settings.data;
    const k = 0.0042 * (this.aim > 0.5 ? 0.6 : 1);
    this.yaw -= dx * k * s.sensX;
    this.pitch -= dy * k * s.sensY * (s.invertY ? -1 : 1);
    this.pitch = THREE.MathUtils.clamp(this.pitch, -1.05, 0.75);
  }

  shake(amount: number) { this.trauma = Math.min(1, this.trauma + amount * settings.data.screenShake); }

  forward(out = new THREE.Vector3()) {
    return out.set(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
  }

  update(dt: number, playerPos: THREE.Vector3, crouch: number, aiming: boolean) {
    this.t += dt;
    this.aim += ((aiming ? 1 : 0) - this.aim) * Math.min(1, dt * 9);
    const a = this.aim;
    const headH = THREE.MathUtils.lerp(1.6, 1.15, crouch);
    this.target.set(playerPos.x, playerPos.y + headH, playerPos.z);
    const side = THREE.MathUtils.lerp(0.42, 0.55, a) * this.shoulder;
    const back = THREE.MathUtils.lerp(2.55, 1.3, a);
    const up = THREE.MathUtils.lerp(0.12, 0.02, a);
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    const fwd = this.forward(this.fwdTmp);
    // right vector from yaw
    const rx = cy, rz = -sy;
    // shoulder pivot (avoid clipping through walls at the shoulder itself)
    const pivot = new THREE.Vector3(this.target.x + rx * side, this.target.y + up, this.target.z + rz * side);
    if (this.grid) {
      const sd = this.grid.raycast(this.target.x, this.target.z, rx * side, rz * side, Math.abs(side) + 0.2, BLOCK_CAM, false);
      if (sd >= 0) { const k = Math.max(0, sd - 0.25) / (Math.abs(side) + 0.0001); pivot.x = this.target.x + rx * side * k; pivot.z = this.target.z + rz * side * k; }
    }
    let want = back;
    const dir = new THREE.Vector3(-fwd.x, -fwd.y, -fwd.z);
    if (this.grid) {
      const horiz = Math.hypot(dir.x, dir.z) || 1;
      const hd = this.grid.raycast(pivot.x, pivot.z, dir.x, dir.z, back * horiz + 0.3, BLOCK_CAM, false);
      if (hd >= 0) want = Math.min(want, Math.max(0.35, (hd - 0.28) / horiz));
    }
    // ceiling / floor clamps
    const camY = pivot.y + dir.y * want;
    const maxY = this.indoor ? this.ceiling - 0.25 : 50;
    if (camY > maxY && dir.y > 0.01) want = Math.max(0.35, (maxY - pivot.y) / dir.y);
    if (camY < 0.25 && dir.y < -0.01) want = Math.max(0.35, (0.25 - pivot.y) / dir.y);
    // fast in, slow out
    this.dist += (want - this.dist) * Math.min(1, dt * (want < this.dist ? 22 : 3.5));
    this.pos.copy(pivot).addScaledVector(dir, this.dist);

    // shake
    const tr = this.trauma * this.trauma;
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const sx = (Math.sin(this.t * 37.0) + Math.sin(this.t * 21.3)) * 0.5 * tr * 0.08;
    const syy = (Math.sin(this.t * 31.7 + 1.3) + Math.sin(this.t * 17.1)) * 0.5 * tr * 0.06;
    this.cam.position.copy(this.pos);
    const look = this.lookTmp.copy(this.pos).addScaledVector(fwd, 10);
    look.x += sx * 10; look.y += syy * 10;
    if (this.cinematic) {
      const w = this.cinematic.w;
      this.cam.position.lerp(this.cinematic.pos, w);
      look.lerp(this.cinematic.look, w);
    }
    this.cam.lookAt(look);
    const fov = THREE.MathUtils.lerp(this.fovBase, 48, a);
    if (Math.abs(this.cam.fov - fov) > 0.05) { this.cam.fov = fov; this.cam.updateProjectionMatrix(); }
    return this.dist;
  }
}
