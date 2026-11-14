import 'mesheditor';
import 'mesheditor/style.css';
import type { MeshEditorElement, MeshEditorPlugin, MeshEditorPluginContext } from 'mesheditor';
import * as BABYLON from '@babylonjs/core';

// Log helper
const eventLog = document.getElementById('eventLog') as HTMLElement;
function logEvent(type: string, message: string, category: 'info' | 'success' | 'mesh' | 'plugin' = 'info') {
  if (!eventLog) return;
  const time = new Date().toLocaleTimeString();
  const entry = document.createElement('div');
  entry.className = `event-entry event-${category}`;
  entry.innerHTML = `<span class="event-time">[${time}]</span><strong>${type}</strong>: ${message}`;
  eventLog.prepend(entry);
}

document.getElementById('btnClearLog')?.addEventListener('click', () => {
  if (eventLog) eventLog.innerHTML = '';
});

// Telemetry DOM elements
const telemetryMeshes = document.getElementById('telemetryMeshes') as HTMLElement;
const telemetrySelected = document.getElementById('telemetrySelected') as HTMLElement;
const telemetryFps = document.getElementById('telemetryFps') as HTMLElement;
const engineBadge = document.getElementById('engineBadge') as HTMLElement;

// Main Editor reference
const editor = document.getElementById('editor') as MeshEditorElement;

// 1. Asset Pipeline Plugin
const assetPipelinePlugin: MeshEditorPlugin = {
  id: 'studio.asset.pipeline',
  name: 'Asset Pipeline & Quality Check',
  version: '1.0.0',
  description: 'Validates polygon budgets and tags game-ready assets.',
  initialize(ctx: MeshEditorPluginContext) {
    logEvent('Plugin Initialized', 'Asset Pipeline plugin registered', 'plugin');

    ctx.registerActionMenuItem({
      id: 'menuActionValidateBudget',
      label: 'Validate Polygon Budget',
      icon: 'check-circle-2',
      shortcut: '⌥V',
      onClick: () => {
        const meshes = ctx.service.importedMeshes;
        let polyCount = 0;
        for (const m of meshes) {
          polyCount += Math.floor((m.getTotalIndices ? m.getTotalIndices() : 0) / 3);
        }
        const maxBudget = 50000;
        if (polyCount <= maxBudget) {
          ctx.showToast(`Mesh budget OK: ${polyCount.toLocaleString()} / ${maxBudget.toLocaleString()} triangles`, 'success');
        } else {
          ctx.showToast(`Warning: ${polyCount.toLocaleString()} triangles exceeds budget (${maxBudget.toLocaleString()})`, 'warning');
        }
        logEvent('Pipeline Check', `Triangle count: ${polyCount} (Budget: ${maxBudget})`, 'plugin');
      }
    });

    ctx.registerActionMenuItem({
      id: 'menuActionTagAsset',
      label: 'Tag as Production Asset',
      icon: 'tag',
      onClick: () => {
        const mesh = ctx.service.selectedMesh;
        if (!mesh) {
          ctx.showToast('Please select a mesh first.', 'warning');
          return;
        }
        mesh.metadata = { ...(mesh.metadata || {}), productionReady: true, taggedAt: new Date().toISOString() };
        ctx.showToast(`Tagged '${mesh.name}' as Production Ready`, 'success');
        logEvent('Asset Tagged', `Mesh '${mesh.name}' tagged with metadata`, 'plugin');
      }
    });
  }
};

// 2. Studio Lighting Plugin
const studioLightingPlugin: MeshEditorPlugin = {
  id: 'studio.lighting.presets',
  name: 'Studio Lighting Presets',
  version: '1.0.0',
  description: 'Applies studio 3-point and cinematic sunset lighting environments.',
  initialize(ctx: MeshEditorPluginContext) {
    logEvent('Plugin Initialized', 'Studio Lighting Presets plugin registered', 'plugin');

    ctx.registerToolMenuItem({
      id: 'menuToolLightingStudio',
      label: 'Apply 3-Point Studio Lights',
      icon: 'sun',
      onClick: () => {
        const scene = ctx.getScene();
        if (!scene) return;

        // Clear existing custom lights if any
        scene.lights.forEach((l: BABYLON.Light) => {
          if (l.name.startsWith('custom_studio_')) l.dispose();
        });

        // Key light
        const key = new BABYLON.DirectionalLight('custom_studio_key', new BABYLON.Vector3(-1, -2, -1), scene);
        key.intensity = 1.2;
        key.diffuse = new BABYLON.Color3(1.0, 0.95, 0.9);

        // Fill light
        const fill = new BABYLON.DirectionalLight('custom_studio_fill', new BABYLON.Vector3(2, -1, 1), scene);
        fill.intensity = 0.5;
        fill.diffuse = new BABYLON.Color3(0.8, 0.85, 1.0);

        // Rim/back light
        const rim = new BABYLON.DirectionalLight('custom_studio_rim', new BABYLON.Vector3(0, 1, 2), scene);
        rim.intensity = 0.8;
        rim.diffuse = new BABYLON.Color3(1.0, 1.0, 1.0);

        ctx.showToast('Applied 3-Point Studio Lighting', 'info');
        logEvent('Lighting Preset', 'Applied 3-Point Studio Lighting rig', 'plugin');
      }
    });

    ctx.registerToolMenuItem({
      id: 'menuToolLightingSunset',
      label: 'Apply Golden Hour Preset',
      icon: 'sunset',
      onClick: () => {
        const scene = ctx.getScene();
        if (!scene) return;

        scene.lights.forEach((l: BABYLON.Light) => {
          if (l.name.startsWith('custom_studio_')) l.dispose();
        });

        const sun = new BABYLON.DirectionalLight('custom_studio_sun', new BABYLON.Vector3(-2, -0.6, -1), scene);
        sun.intensity = 1.6;
        sun.diffuse = new BABYLON.Color3(1.0, 0.65, 0.3);

        const ambient = new BABYLON.HemisphericLight('custom_studio_ambient', new BABYLON.Vector3(0, 1, 0), scene);
        ambient.intensity = 0.4;
        ambient.diffuse = new BABYLON.Color3(0.4, 0.2, 0.5);

        ctx.showToast('Applied Golden Hour Preset', 'info');
        logEvent('Lighting Preset', 'Applied Golden Hour lighting rig', 'plugin');
      }
    });
  }
};

// Bootstrap function
async function initHost() {
  await customElements.whenDefined('mesh-editor');

  const onEditorReady = async () => {
    engineBadge.textContent = 'Engine Ready';
    engineBadge.className = 'status-pill status-ready';
    logEvent('editor-ready', 'MeshEditor host initialized successfully', 'success');

    // Register plugins
    try {
      await editor.usePlugin(assetPipelinePlugin);
      await editor.usePlugin(studioLightingPlugin);
    } catch (err) {
      console.error('Plugin registration error:', err);
    }

    // Set up telemetry updates
    const scene = editor.getScene();
    if (scene) {
      scene.onAfterRenderObservable.add(() => {
        const engine = scene.getEngine();
        if (telemetryFps && engine) {
          telemetryFps.textContent = engine.getFps().toFixed(0);
        }
      });
    }

    // Add initial showcase cube if scene is empty
    const service = editor.getService();
    if (service && scene && service.importedMeshes.length === 0) {
      const box = BABYLON.MeshBuilder.CreateBox('DemoCube', { size: 1.5 }, scene);
      box.position.y = 0.75;
      const mat = new BABYLON.StandardMaterial('DemoCubeMat', scene);
      mat.diffuseColor = new BABYLON.Color3(0.23, 0.51, 0.96); // #3b82f6
      box.material = mat;
      service.addMesh(box);
    }
  };

  // Check if editor is already ready (in case event already fired)
  if (editor.getApp()) {
    onEditorReady();
  } else {
    editor.addEventListener('editor-ready', onEditorReady, { once: true });
  }

  // Subscribe to MeshEditor element custom events
  editor.addEventListener('selection-changed', (e: any) => {
    const mesh = e.detail?.selectedMesh;
    const name = mesh ? mesh.name : 'None';
    if (telemetrySelected) telemetrySelected.textContent = name;
    logEvent('selection-changed', `Selected node: ${name}`, 'mesh');
  });

  editor.addEventListener('scene-modified', (e: any) => {
    const { meshCount, polyCount } = e.detail || {};
    if (telemetryMeshes) telemetryMeshes.textContent = `${meshCount || 0} (${polyCount || 0} tris)`;
    logEvent('scene-modified', `Scene updated: ${meshCount} meshes, ${polyCount} triangles`, 'info');
  });

  editor.addEventListener('model-loaded', (e: any) => {
    logEvent('model-loaded', `Loaded model: ${e.detail?.filename}`, 'success');
  });

  editor.addEventListener('model-exported', (e: any) => {
    logEvent('model-exported', `Exported format: ${e.detail?.format}`, 'success');
  });

  // Host Primitive Button Handlers
  document.getElementById('btnAddCube')?.addEventListener('click', () => {
    const scene = editor.getScene();
    const service = editor.getService();
    if (!scene || !service) return;

    const mesh = BABYLON.MeshBuilder.CreateBox(`Box_${Date.now().toString().slice(-4)}`, { size: 1.2 }, scene);
    mesh.position.set((Math.random() - 0.5) * 3, 0.6, (Math.random() - 0.5) * 3);
    const mat = new BABYLON.StandardMaterial(`Mat_${mesh.name}`, scene);
    mat.diffuseColor = new BABYLON.Color3(Math.random(), Math.random(), Math.random());
    mesh.material = mat;
    service.addMesh(mesh);
  });

  document.getElementById('btnAddSphere')?.addEventListener('click', () => {
    const scene = editor.getScene();
    const service = editor.getService();
    if (!scene || !service) return;

    const mesh = BABYLON.MeshBuilder.CreateSphere(`Sphere_${Date.now().toString().slice(-4)}`, { diameter: 1.2 }, scene);
    mesh.position.set((Math.random() - 0.5) * 3, 0.6, (Math.random() - 0.5) * 3);
    const mat = new BABYLON.StandardMaterial(`Mat_${mesh.name}`, scene);
    mat.diffuseColor = new BABYLON.Color3(Math.random(), Math.random(), Math.random());
    mesh.material = mat;
    service.addMesh(mesh);
  });

  document.getElementById('btnAddCylinder')?.addEventListener('click', () => {
    const scene = editor.getScene();
    const service = editor.getService();
    if (!scene || !service) return;

    const mesh = BABYLON.MeshBuilder.CreateCylinder(`Cylinder_${Date.now().toString().slice(-4)}`, { height: 1.5, diameter: 1 }, scene);
    mesh.position.set((Math.random() - 0.5) * 3, 0.75, (Math.random() - 0.5) * 3);
    const mat = new BABYLON.StandardMaterial(`Mat_${mesh.name}`, scene);
    mat.diffuseColor = new BABYLON.Color3(Math.random(), Math.random(), Math.random());
    mesh.material = mat;
    service.addMesh(mesh);
  });

  document.getElementById('btnAddTorus')?.addEventListener('click', () => {
    const scene = editor.getScene();
    const service = editor.getService();
    if (!scene || !service) return;

    const mesh = BABYLON.MeshBuilder.CreateTorus(`Torus_${Date.now().toString().slice(-4)}`, { diameter: 1.2, thickness: 0.35 }, scene);
    mesh.position.set((Math.random() - 0.5) * 3, 0.6, (Math.random() - 0.5) * 3);
    const mat = new BABYLON.StandardMaterial(`Mat_${mesh.name}`, scene);
    mat.diffuseColor = new BABYLON.Color3(Math.random(), Math.random(), Math.random());
    mesh.material = mat;
    service.addMesh(mesh);
  });

  // Color Swatches Handler
  document.querySelectorAll('.color-swatch').forEach((swatch) => {
    swatch.addEventListener('click', () => {
      const hex = (swatch as HTMLElement).dataset.color;
      if (!hex) return;
      const service = editor.getService();
      const scene = editor.getScene();
      const selectedMesh = service?.selectedMesh;
      if (!selectedMesh || !scene) {
        logEvent('Material Swatch', 'No mesh selected to apply color.', 'mesh');
        return;
      }
      const color = BABYLON.Color3.FromHexString(hex);
      if (selectedMesh.material && selectedMesh.material instanceof BABYLON.StandardMaterial) {
        selectedMesh.material.diffuseColor = color;
      } else {
        const mat = new BABYLON.StandardMaterial(`Mat_${selectedMesh.name}_${Date.now()}`, scene);
        mat.diffuseColor = color;
        selectedMesh.material = mat;
      }
      logEvent('Material Changed', `Applied color ${hex} to '${selectedMesh.name}'`, 'mesh');
    });
  });

  // Host Layout Toggles
  document.getElementById('toggleTopToolbar')?.addEventListener('change', (e) => {
    const checked = (e.target as HTMLInputElement).checked;
    const toolbar = editor.querySelector('#top-toolbar') as HTMLElement | null;
    if (toolbar) toolbar.style.display = checked ? '' : 'none';
  });

  document.getElementById('toggleInspector')?.addEventListener('change', (e) => {
    const checked = (e.target as HTMLInputElement).checked;
    const inspector = editor.querySelector('#rightSidebar') as HTMLElement | null;
    if (inspector) inspector.style.display = checked ? '' : 'none';
  });

  document.getElementById('toggleStats')?.addEventListener('change', (e) => {
    const checked = (e.target as HTMLInputElement).checked;
    const footer = editor.querySelector('#footerStatusBar') as HTMLElement | null;
    if (footer) footer.style.display = checked ? '' : 'none';
  });
}

initHost().catch(console.error);

