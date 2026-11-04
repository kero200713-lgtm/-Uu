import { defineConfig, type Plugin } from 'vite';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Stamps the service worker's cache name with a hash of the built files, so a
 * new deploy (e.g. a fresh iPad test build) never serves stale textures/models
 * from the previous one, while unchanged builds keep their offline cache.
 */
function swVersion(): Plugin {
  let outDir = 'dist';
  return {
    name: 'sw-version',
    apply: 'build',
    configResolved(c) { outDir = path.resolve(c.root, c.build.outDir); },
    closeBundle() {
      const sw = path.join(outDir, 'sw.js');
      if (!fs.existsSync(sw)) return;
      const h = createHash('sha1');
      const walk = (d: string) => {
        for (const f of fs.readdirSync(d).sort()) {
          const p = path.join(d, f);
          if (fs.statSync(p).isDirectory()) walk(p);
          else if (p !== sw) { h.update(path.relative(outDir, p)); h.update(fs.readFileSync(p)); }
        }
      };
      walk(outDir);
      const v = h.digest('hex').slice(0, 12);
      fs.writeFileSync(sw, fs.readFileSync(sw, 'utf8').replace(/const CACHE = '[^']*'/, `const CACHE = 'ugultu-${v}'`));
      fs.writeFileSync(path.join(outDir, 'version.txt'), v + '\n');
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [swVersion()],
  build: {
    // iPadOS/iOS 15 is the first Safari with WebGL 2 (required by three.js r170)
    target: ['es2020', 'safari15'],
    assetsInlineLimit: 0,
    assetsDir: 'js',
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: { manualChunks: { three: ['three'] } },
    },
  },
  server: { host: true },
});
