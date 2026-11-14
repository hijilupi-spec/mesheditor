import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';

const currentDir = typeof __dirname !== 'undefined' ? __dirname : path.dirname(new URL(import.meta.url).pathname);
const isMonorepo = fs.existsSync(path.resolve(currentDir, '../../dist-lib'));

export default defineConfig({
  server: {
    port: 3000,
    open: true
  },
  resolve: isMonorepo
    ? {
        alias: {
          'mesheditor/style.css': path.resolve(currentDir, '../../dist-lib/mesheditor.css'),
          'mesheditor': path.resolve(currentDir, '../../dist-lib/esm/index.js')
        }
      }
    : {},
  optimizeDeps: {
    include: ['earcut'],
    exclude: [
      '@babylonjs/core',
      '@babylonjs/loaders',
      '@babylonjs/materials',
      '@babylonjs/serializers',
      'mesheditor'
    ]
  }
});
