// Telemetry & UI elements
const eventLog = document.getElementById('eventLog');
const telemetryMeshes = document.getElementById('telemetryMeshes');
const telemetrySelected = document.getElementById('telemetrySelected');
const telemetryFps = document.getElementById('telemetryFps');
const engineBadge = document.getElementById('engineBadge');
const editor = document.getElementById('editor');

function logEvent(type, message, category = 'info') {
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
function hexToRgbNorm(hex) {
  const bigint = parseInt(hex.replace('#', ''), 16);
  return [((bigint >> 16) & 255) / 255, ((bigint >> 8) & 255) / 255, (bigint & 255) / 255];
}

// 1. Asset Pipeline Plugin Definition
const assetPipelinePlugin = {
  id: 'studio.asset.pipeline',
  name: 'Asset Pipeline & Quality Check',
  version: '1.0.0',
  description: 'Validates polygon budgets and tags game-ready assets.',
  initialize(ctx) {
    logEvent('Plugin Registered', 'Asset Pipeline plugin initialized', 'plugin');

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
        mesh.metadata = Object.assign({}, mesh.metadata || {}, { productionReady: true, taggedAt: new Date().toISOString() });
        ctx.showToast(`Tagged '${mesh.name}' as Production Ready`, 'success');
        logEvent('Asset Tagged', `Mesh '${mesh.name}' tagged with production metadata`, 'plugin');
      }
    });
  }
};

// 2. Studio Lighting Presets Plugin Definition
const studioLightingPlugin = {
  id: 'studio.lighting.presets',
  name: 'Studio Lighting Presets',
  version: '1.0.0',
  description: 'Applies studio lighting presets.',
  initialize(ctx) {
    logEvent('Plugin Registered', 'Studio Lighting Presets plugin initialized', 'plugin');

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

// Bootstrap Host Application
async function initHost() {
  await customElements.whenDefined('mesh-editor');

  const onEditorReady = async () => {
    if (engineBadge) {
      engineBadge.textContent = 'Engine Ready';
      engineBadge.className = 'status-pill status-ready';
    }
    logEvent('editor-ready', 'MeshEditor custom element initialized', 'success');

    // Register demo plugins
    try {
      await editor.usePlugin(assetPipelinePlugin);
      await editor.usePlugin(studioLightingPlugin);
    } catch (err) {
      console.error('[HostApp] Plugin registration error:', err);
    }

    // Add initial demo cube if scene is empty
    const service = editor.getService();
    if (service && service.importedMeshes.length === 0) {
      service.createPrimitive({
        shape: 'Box',
        width: 1.5,
        height: 1.5,
        depth: 1.5,
        color: '#3b82f6',
        name: 'DemoBox'
      });
    }

    // Setup Telemetry FPS Loop
    const scene = editor.getScene();
    if (scene) {
      scene.onAfterRenderObservable.add(() => {
        const engine = scene.getEngine();
        if (telemetryFps && engine) {
          telemetryFps.textContent = engine.getFps().toFixed(0);
        }
      });
    }
  };

  if (editor.app) {
    onEditorReady();
  } else {
    editor.addEventListener('editor-ready', onEditorReady, { once: true });
  }

  // Subscribe to MeshEditor element events
  editor.addEventListener('selection-changed', (e) => {
    const mesh = e.detail?.selectedMesh;
    const name = mesh ? mesh.name : 'None';
    if (telemetrySelected) telemetrySelected.textContent = name;
    logEvent('selection-changed', `Active mesh: ${name}`, 'mesh');
  });

  editor.addEventListener('scene-modified', (e) => {
    const { meshCount, polyCount } = e.detail || {};
    if (telemetryMeshes) telemetryMeshes.textContent = `${meshCount || 0} (${(polyCount || 0).toLocaleString()} tris)`;
    logEvent('scene-modified', `Scene updated: ${meshCount} meshes, ${polyCount} triangles`, 'info');
  });

  editor.addEventListener('model-loaded', (e) => {
    logEvent('model-loaded', `Loaded 3D file: ${e.detail?.filename}`, 'success');
  });

  editor.addEventListener('model-saved', (e) => {
    logEvent('model-saved', `Saved model: ${e.detail?.filename} (${(e.detail?.blob?.size || 0)} bytes)`, 'success');
  });

  editor.addEventListener('model-exported', (e) => {
    logEvent('model-exported', `Exported format: ${e.detail?.format}`, 'success');
  });

  // Host Primitive Button Handlers using editor.getService().createPrimitive()
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
      const hex = swatch.dataset.color;
      if (!hex) return;
      const service = editor.getService();
      const selectedMesh = service?.selectedMesh;
      if (!selectedMesh) {
        logEvent('Material Swatch', 'Select a mesh first to change its color.', 'mesh');
        return;
      }
      const mat = selectedMesh.material;
      if (mat) {
        const [r, g, b] = hexToRgbNorm(hex);
        if ('albedoColor' in mat) {
          mat.albedoColor.set(r, g, b);
        } else if ('diffuseColor' in mat) {
          mat.diffuseColor.set(r, g, b);
        }
      }
      logEvent('Material Updated', `Applied color ${hex} to '${selectedMesh.name}'`, 'mesh');
    });
  });

  // Host Layout Toggles
  document.getElementById('toggleTopToolbar')?.addEventListener('change', (e) => {
    const toolbar = editor.querySelector('#top-toolbar');
    if (toolbar) toolbar.style.display = e.target.checked ? '' : 'none';
  });

  document.getElementById('toggleInspector')?.addEventListener('change', (e) => {
    const inspector = editor.querySelector('#rightSidebar') || editor.querySelector('#stackpanelRightSidebar');
    if (inspector) inspector.style.display = e.target.checked ? '' : 'none';
  });

  document.getElementById('toggleStats')?.addEventListener('change', (e) => {
    const footer = editor.querySelector('#footerStatusBar');
    if (footer) footer.style.display = e.target.checked ? '' : 'none';
  });
}

initHost().catch(console.error);
