# MeshEditor Web Component — StackBlitz & Vite Showcase

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/peer2p/mesheditor/tree/main/examples/web-component-showcase)

This showcase demonstrates how to integrate the `<mesh-editor>` custom element into any modern web application, framework (React, Vue, Angular, Svelte, Solid), or host studio environment.

---

## Features Demonstrated

1. **Declarative Custom Element**:
   - Zero-boilerplate mounting via `<mesh-editor>`.
   - Dynamic layout toggles (top toolbar, inspector panel, status bar).
2. **Modular Plugin Architecture**:
   - Dynamic plugin registration via `editor.usePlugin(pluginDefinition)`.
   - Injected custom Actions menu items (`Validate Polygon Budget`, `Tag as Production Asset`).
   - Injected custom Tools menu items (`Apply 3-Point Studio Lights`, `Apply Golden Hour Preset`).
   - Built-in toast notifications and status bar updates from plugins.
3. **Host-to-3D Viewport Control**:
   - Adding procedural 3D primitives (Cubes, Spheres, Cylinders, Toruses) into the active BabylonJS scene.
   - Live color palette swatches applied to the currently selected mesh.
4. **Bi-directional Event Stream**:
   - Listens to `editor-ready`, `scene-modified`, `selection-changed`, `model-loaded`, and `model-exported`.
   - Real-time scene telemetry (mesh count, polygon count, live rendering FPS).

---

## Running in StackBlitz

Click the button above or visit:
[https://stackblitz.com/github/peer2p/mesheditor/tree/main/examples/web-component-showcase](https://stackblitz.com/github/peer2p/mesheditor/tree/main/examples/web-component-showcase)

StackBlitz will boot a Node WebContainer, install dependencies, and launch Vite automatically.

---

## Running Locally

```bash
cd examples/web-component-showcase
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Alternative: Pure HTML / Zero-Install CDN Integration

If you prefer a zero-dependency HTML setup without a bundler, import the standalone bundle directly from GitHub Pages or unpkg:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>MeshEditor Standalone</title>
  <script src="https://peer2p.github.io/mesheditor/mesheditor-element.bundle.js"></script>
  <style>
    body, html { margin: 0; width: 100%; height: 100%; overflow: hidden; }
    mesh-editor { display: block; width: 100vw; height: 100vh; }
  </style>
</head>
<body>
  <mesh-editor></mesh-editor>
</body>
</html>
```
