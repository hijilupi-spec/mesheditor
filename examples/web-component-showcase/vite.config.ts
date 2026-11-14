import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';

const isMonorepo = fs.existsSync(path.resolve(__dirname, '../../dist-lib'));

export default defineConfig({
  server: {
    port: 3000,
    open: true
  },
  resolve: isMonorepo
    ? {
        alias: {
          'mesheditor/style.css': path.resolve(__dirname, '../../dist-lib/mesheditor.css'),
          'mesheditor': path.resolve(__dirname, '../../dist-lib/esm/index.js')
        }
      }
    : {},
  optimizeDeps: {
    exclude: [
      '@babylonjs/core',
      '@babylonjs/loaders',
      '@babylonjs/materials',
      '@babylonjs/serializers',
      'mesheditor'
    ]
  }
});
