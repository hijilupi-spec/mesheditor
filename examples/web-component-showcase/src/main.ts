import 'mesheditor';
import 'mesheditor/style.css';
import type { MeshEditorElement, MeshEditorPlugin, MeshEditorPluginContext } from 'mesheditor';

// Telemetry & UI elements
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

// Helper for normalizing hex colors to [r, g, b] (0..1)
function hexToRgbNorm(hex: string): [number, number, number] {
  const bigint = parseInt(hex.replace('#', ''), 16);
  return [((bigint >> 16) & 255) / 255, ((bigint >> 8) & 255) / 255, (bigint & 255) / 255];
}

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
        const meshes = ctx.service.importedMeshes || [];
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

// 2. Studio Lighting Presets Plugin
const studioLightingPlugin: MeshEditorPlugin = {
  id: 'studio.lighting.presets',
  name: 'Studio Lighting Presets',
  version: '1.0.0',
  description: 'Applies studio lighting presets and clear colors.',
  initialize(ctx: MeshEditorPluginContext) {
    logEvent('Plugin Initialized', 'Studio Lighting Presets plugin registered', 'plugin');

    ctx.registerToolMenuItem({
      id: 'menuToolLightingDarkStudio',
      label: 'Apply Dark Studio Mode',
      icon: 'moon',
      onClick: () => {
        ctx.service.setClearColor('#0d1117');
        ctx.showToast('Applied Dark Studio Mode', 'info');
        logEvent('Lighting Preset', 'Clear color set to #0d1117', 'plugin');
      }
    });

    ctx.registerToolMenuItem({
      id: 'menuToolLightingWarmStudio',
      label: 'Apply Warm Studio Mode',
      icon: 'sun',
      onClick: () => {
        ctx.service.setClearColor('#1f1915');
        ctx.showToast('Applied Warm Studio Mode', 'info');
        logEvent('Lighting Preset', 'Clear color set to #1f1915', 'plugin');
      }
    });
  }
};

// Bootstrap function
async function initHost() {
  await customElements.whenDefined('mesh-editor');

  const onEditorReady = async () => {
    if (engineBadge) {
      engineBadge.textContent = 'Engine Ready';
      engineBadge.className = 'status-pill status-ready';
    }
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
    if (service && service.importedMeshes.length === 0) {
      service.createPrimitive({
        shape: 'Box',
        width: 1.5,
        height: 1.5,
        depth: 1.5,
        color: '#3b82f6',
        name: 'DemoCube'
      });
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

  // Host Primitive Button Handlers using service.createPrimitive()
  document.getElementById('btnAddCube')?.addEventListener('click', () => {
    const service = editor.getService();
    if (!service) return;
    service.createPrimitive({
      shape: 'Box',
      width: 1.2,
      height: 1.2,
      depth: 1.2,
      color: '#3b82f6',
      name: 'Cube'
    });
  });

  document.getElementById('btnAddSphere')?.addEventListener('click', () => {
    const service = editor.getService();
    if (!service) return;
    service.createPrimitive({
      shape: 'Sphere',
      size: 1.2,
      color: '#10b981',
      name: 'Sphere'
    });
  });

  document.getElementById('btnAddCylinder')?.addEventListener('click', () => {
    const service = editor.getService();
    if (!service) return;
    service.createPrimitive({
      shape: 'Cylinder',
      height: 1.6,
      diameter: 1.0,
      color: '#f59e0b',
      name: 'Cylinder'
    });
  });

  document.getElementById('btnAddTorus')?.addEventListener('click', () => {
    const service = editor.getService();
    if (!service) return;
    service.createPrimitive({
      shape: 'Torus',
      diameter: 1.3,
      thickness: 0.35,
      color: '#8b5cf6',
      name: 'Torus'
    });
  });

  // Color Swatches Handler
  document.querySelectorAll('.color-swatch').forEach((swatch) => {
    swatch.addEventListener('click', () => {
      const hex = (swatch as HTMLElement).dataset.color;
      if (!hex) return;
      const service = editor.getService();
      const selectedMesh = service?.selectedMesh;
      if (!selectedMesh) {
        logEvent('Material Swatch', 'No mesh selected to apply color.', 'mesh');
        return;
      }
      const mat = selectedMesh.material as any;
      if (mat) {
        const [r, g, b] = hexToRgbNorm(hex);
        if (mat.albedoColor) {
          mat.albedoColor.set(r, g, b);
        } else if (mat.diffuseColor) {
          mat.diffuseColor.set(r, g, b);
        }
      }
      logEvent('Material Changed', `Applied color ${hex} to '${selectedMesh.name}'`, 'mesh');
    });
  });

  // Pop out full preview in new tab
  document.getElementById('btnOpenNewTab')?.addEventListener('click', () => {
    window.open(window.location.href, '_blank');
  });

  // Host Plugin Action Buttons
  document.getElementById('btnToggleAssetPlugin')?.addEventListener('click', () => {
    const service = editor.getService();
    const app = editor.getApp();
    const meshes = service?.importedMeshes || [];
    let polyCount = 0;
    for (const m of meshes) {
      polyCount += Math.floor((m.getTotalIndices ? m.getTotalIndices() : 0) / 3);
    }
    const maxBudget = 50000;
    if (polyCount <= maxBudget) {
      app?.showToast(`Mesh budget OK: ${polyCount.toLocaleString()} / ${maxBudget.toLocaleString()} triangles`, 'success');
    } else {
      app?.showToast(`Warning: ${polyCount.toLocaleString()} triangles exceeds budget (${maxBudget.toLocaleString()})`, 'warning');
    }
    logEvent('Plugin Action', `Asset Pipeline: ${polyCount} triangles validated against budget (${maxBudget})`, 'plugin');
  });

  let warmLighting = false;
  document.getElementById('btnToggleLightingPlugin')?.addEventListener('click', () => {
    const service = editor.getService();
    const app = editor.getApp();
    warmLighting = !warmLighting;
    const color = warmLighting ? '#1f1915' : '#0d1117';
    service?.setClearColor(color);
    const modeName = warmLighting ? 'Warm Studio Mode (#1f1915)' : 'Dark Studio Mode (#0d1117)';
    app?.showToast(`Applied ${modeName}`, 'info');
    logEvent('Plugin Action', `Studio Lighting switched to ${modeName}`, 'plugin');
  });

  // Host Layout Toggles
  document.getElementById('toggleTopToolbar')?.addEventListener('change', (e) => {
    const checked = (e.target as HTMLInputElement).checked;
    if (typeof (editor as any).setToolbarVisible === 'function') {
      (editor as any).setToolbarVisible(checked);
    } else {
      const toolbar = (editor.querySelector('#top-toolbar') || editor.querySelector('header')) as HTMLElement | null;
      if (toolbar) {
        if (checked) toolbar.style.removeProperty('display');
        else toolbar.style.setProperty('display', 'none', 'important');
      }
    }
    logEvent('Layout Changed', `Top toolbar ${checked ? 'shown' : 'hidden'}`, 'info');
  });

  document.getElementById('toggleOutliner')?.addEventListener('change', (e) => {
    const checked = (e.target as HTMLInputElement).checked;
    const outliner = editor.querySelector('#dialog-outliner') as HTMLElement | null;
    if (outliner) {
      if (checked) outliner.style.removeProperty('display');
      else outliner.style.setProperty('display', 'none', 'important');
    }
    logEvent('Layout Changed', `Scene outliner ${checked ? 'shown' : 'hidden'}`, 'info');
  });

  document.getElementById('toggleInspector')?.addEventListener('change', (e) => {
    const checked = (e.target as HTMLInputElement).checked;
    if (typeof (editor as any).setInspectorVisible === 'function') {
      (editor as any).setInspectorVisible(checked);
    } else {
      const inspector = (editor.querySelector('#stackpanelRightSidebar') || editor.querySelector('.stackpanel-sidebar')) as HTMLElement | null;
      if (inspector) {
        if (checked) inspector.style.removeProperty('display');
        else inspector.style.setProperty('display', 'none', 'important');
      }
    }
    logEvent('Layout Changed', `Inspector sidebar ${checked ? 'shown' : 'hidden'}`, 'info');
  });

  document.getElementById('toggleStats')?.addEventListener('change', (e) => {
    const checked = (e.target as HTMLInputElement).checked;
    if (typeof (editor as any).setStatusVisible === 'function') {
      (editor as any).setStatusVisible(checked);
    } else {
      const footer = (editor.querySelector('#bottom-bar') || editor.querySelector('footer')) as HTMLElement | null;
      if (footer) {
        if (checked) footer.style.removeProperty('display');
        else footer.style.setProperty('display', 'none', 'important');
      }
    }
    logEvent('Layout Changed', `Status footer ${checked ? 'shown' : 'hidden'}`, 'info');
  });
}

initHost().catch(console.error);
