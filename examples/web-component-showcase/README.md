# MeshEditor Web Component — Instant StackBlitz Showcase

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/peer2p/mesheditor/tree/main/examples/web-component-showcase)

This showcase demonstrates how to embed and customize the `<mesh-editor>` Web Component in any web application or studio interface with **zero setup and zero build step**.

---

## Run Instantly in StackBlitz

Click the badge above or navigate to:
**[https://stackblitz.com/github/peer2p/mesheditor/tree/main/examples/web-component-showcase](https://stackblitz.com/github/peer2p/mesheditor/tree/main/examples/web-component-showcase)**

- **Instant Zero-Install**: No `npm install`, no Node.js compilation delay, and no network timeouts.
- **Full 3D Workbench**: Includes Babylon.js runtime and all MeshEditor tools.
- **Live Code Editing**: Edit `index.html`, `main.js`, and `style.css` in StackBlitz with immediate live preview updates.

---

## Features Demonstrated

1. **Declarative Custom Element**:
   - Zero-boilerplate mounting via `<mesh-editor id="editor" grid="true" layout="floating"></mesh-editor>`.
   - Host toggles for top toolbar, inspector sidebar, and status footer.
2. **Modular Plugin Architecture**:
   - Dynamic plugin registration via `editor.usePlugin(pluginDefinition)`.
   - Custom Actions menu items (`Validate Polygon Budget`, `Tag as Production Asset`).
   - Custom Tools menu items (`Apply Dark Studio Mode`, `Apply Warm Studio Mode`).
   - Built-in toast notifications and status bar updates from plugins.
3. **Host-to-3D Viewport Control**:
   - Creating procedural 3D primitives (Cubes, Spheres, Cylinders, Toruses) via `service.createPrimitive()`.
   - Live color palette swatches applied to the currently selected mesh.
4. **Bi-directional Event Stream**:
   - Listens to `editor-ready`, `scene-modified`, `selection-changed`, `model-loaded`, `model-saved`, and `model-exported`.
   - Real-time telemetry: mesh count, triangle count, and live rendering FPS.

---

## Local Preview

Because this showcase is completely static, you can run it with any local static server:

```bash
# Using Python
python3 -m http.server 3000 --directory examples/web-component-showcase

# Or using npx serve
npx serve examples/web-component-showcase
```

Open [http://localhost:3000](http://localhost:3000) in your browser.
