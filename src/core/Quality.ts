import type { QualityLevel } from './Settings';

export interface QualityPreset {
  level: QualityLevel;
  maxDpr: number;          // cap on devicePixelRatio
  renderScale: number;     // multiplier on top of DPR
  antialias: boolean;      // MSAA on the scene target
  shadows: boolean;        // flashlight shadows
  shadowMap: number;
  post: boolean;           // full-screen grading/grain/CA pass
  bloom: boolean;
  lights: number;          // size of the dynamic point-light pool
  far: number;             // camera far / draw distance (m)
  dust: number;            // dust particle count
  rain: number;            // rain streak count
  grass: number;           // decorative scatter density multiplier
  enemyAnimDist: number;   // beyond this, skinned animation runs at reduced rate
  anisotropy: number;
  lightCones: boolean;
}

export const PRESETS: Record<QualityLevel, QualityPreset> = {
  low: { level: 'low', maxDpr: 1.25, renderScale: 0.8, antialias: false, shadows: false, shadowMap: 256, post: false, bloom: false, lights: 3, far: 42, dust: 120, rain: 350, grass: 0.35, enemyAnimDist: 14, anisotropy: 1, lightCones: false },
  medium: { level: 'medium', maxDpr: 1.75, renderScale: 0.9, antialias: false, shadows: true, shadowMap: 512, post: true, bloom: false, lights: 5, far: 60, dust: 260, rain: 700, grass: 0.7, enemyAnimDist: 22, anisotropy: 2, lightCones: true },
  high: { level: 'high', maxDpr: 2.25, renderScale: 1, antialias: true, shadows: true, shadowMap: 1024, post: true, bloom: true, lights: 8, far: 80, dust: 450, rain: 1200, grass: 1, enemyAnimDist: 34, anisotropy: 4, lightCones: true },
};

/** Heuristic first-run choice. A runtime FPS governor refines it later. */
export function detectQuality(gl?: WebGLRenderingContext | WebGL2RenderingContext): QualityLevel {
  const nav: any = typeof navigator !== 'undefined' ? navigator : {};
  const mem = nav.deviceMemory || 4;
  const cores = nav.hardwareConcurrency || 4;
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent || '');
  let gpu = '';
  try {
    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      gpu = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
    }
  } catch { /* ignore */ }
  const g = gpu.toLowerCase();
  if (/swiftshader|llvmpipe|software/.test(g)) return 'low';
  if (!mobile) {
    if (/intel/.test(g) && !/arc|iris xe/.test(g)) return 'medium';
    return 'high';
  }
  // mobile GPUs
  if (/adreno \(tm\) (7[3-9]\d|8\d\d)|adreno 7[3-9]\d|apple gpu|mali-g7[1-9]|mali-g7\d\d|immortalis|xclipse/.test(g) && mem >= 6) return 'high';
  if (/adreno \(tm\) [1-5]\d\d|mali-[t4]|mali-g5[0-2]|powervr/.test(g) || mem <= 3 || cores <= 4) return 'low';
  return 'medium';
}
