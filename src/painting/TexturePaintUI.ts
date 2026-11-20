import type { Mesh } from '@babylonjs/core';

/**
 * Decentralized UI Controller for the 3D Texture Painter dialog (Phases 1-3).
 * Keeps MeshEditorApp lean while wiring all Paint, Layer Stack, 2D UV Canvas,
 * and Stencil Projection UI interactions.
 */
export function initTexturePaintDialogUI(app: any): void {
  const dialog: HTMLElement | null = app.getElement('dialog-texture-paint');
  if (!dialog || (dialog as any)._texturePaintInitialized) return;
  (dialog as any)._texturePaintInitialized = true;

  const ctrl = app.service.texturePaintController;

  // 1. Activate / Deactivate 3D Paint Mode
  const btnToggleMode = app.getElement('btnToggleTexturePaintMode') as HTMLButtonElement | null;
  btnToggleMode?.addEventListener('click', () => {
    const next = !ctrl.isActive;
    if (next) {
      app.activateExclusive3DTool('texture_painter');
    } else {
      ctrl.setActive(false);
      app.updatePanelButtonStates();
    }
    updateTexturePaintDialogUI(app);
  });

  // 2. Load Existing Texture / Auto-UV & Initialize Canvas
  const resSelect = app.getElement('texPaintResolutionSelect') as HTMLSelectElement | null;
  const btnInitCanvas = app.getElement('btnTexPaintInitCanvas') as HTMLButtonElement | null;
  let userPickedResolution = false;
  resSelect?.addEventListener('change', () => {
    userPickedResolution = true;
    ctrl.defaultResolution = parseInt(resSelect.value, 10) || 1024;
  });
  btnInitCanvas?.addEventListener('click', async () => {
    const mesh = ctrl.getActiveTargetMesh();
    if (!mesh) {
      app.showToast('Please select a 3D mesh first.', 'info');
      return;
    }
    const hadExistingTex = ctrl.hasExistingEditableTexture(mesh);
    const hasSession = Boolean(ctrl.getSession(mesh));
    const selectedRes = parseInt(resSelect?.value || '1024', 10) || 1024;
    ctrl.defaultResolution = selectedRes;

    const session = await ctrl.ensurePaintSessionAsync(mesh, {
      resolution: hadExistingTex && !userPickedResolution && !hasSession ? undefined : selectedRes,
      autoUnwrap: !hadExistingTex,
      preserveExistingTexture: true,
    });

    if (session && resSelect) {
      resSelect.value = String(session.resolution);
    }
    if (session?.loadedFromExistingTexture) {
      app.showToast(
        `Loaded existing texture from "${mesh.name}" (${session.resolution}x${session.resolution}) — ready to paint!`,
        'success'
      );
    } else if (session) {
      app.showToast(`Initialized ${session.resolution}x${session.resolution} UV paint canvas on "${mesh.name}".`, 'success');
    }
    updateTexturePaintDialogUI(app);
  });

  // 3. Tabs (Paint / Layers / Stencil)
  const tabs = Array.from(dialog.querySelectorAll<HTMLButtonElement>('[data-texpaint-tab]'));
  const panels: Record<string, HTMLElement | null> = {
    paint: app.getElement('texPaintTabPaint'),
    layers: app.getElement('texPaintTabLayers'),
    stencil: app.getElement('texPaintTabStencil'),
  };
  tabs.forEach((tabBtn) => {
    tabBtn.addEventListener('click', () => {
      const key = tabBtn.getAttribute('data-texpaint-tab') || 'paint';
      tabs.forEach((b) => {
        const isMatch = b === tabBtn;
        b.classList.toggle('active', isMatch);
        b.setAttribute('aria-selected', isMatch ? 'true' : 'false');
      });
      Object.entries(panels).forEach(([k, el]) => {
        if (el) el.style.display = k === key ? '' : 'none';
      });
      updateTexturePaintDialogUI(app);
    });
  });

  // 4. Paint Modes (Brush / Eraser / Smudge / Fill / Eyedropper / Stencil)
  const modeBtns = Array.from(dialog.querySelectorAll<HTMLButtonElement>('[data-texpaint-mode]'));
  modeBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.getAttribute('data-texpaint-mode') as any;
      if (!mode) return;
      ctrl.setMode(mode);
      if (mode === 'stencil' && !ctrl.stencil.pixels) {
        app.showToast('Load a stencil image on the Stencil tab to paint through it.', 'info');
      }
      updateTexturePaintDialogUI(app);
    });
  });

  // 5. PBR Channel Selector
  const channelSelect = app.getElement('texPaintChannelSelect') as HTMLSelectElement | null;
  channelSelect?.addEventListener('change', () => {
    ctrl.setChannel(channelSelect.value as any);
    updateTexturePaintDialogUI(app);
  });

  // 6. Color Picker, Hex Input, Swatches & Scalar Value
  const colorPicker = app.getElement('texPaintColorPicker') as HTMLInputElement | null;
  const colorHexInput = app.getElement('texPaintColorHexInput') as HTMLInputElement | null;
  const setBrushHex = (hex: string) => {
    const normalized = /^#[0-9a-fA-F]{6}$/.test(hex.trim()) ? hex.trim().toLowerCase() : ctrl.colorHex;
    ctrl.colorHex = normalized;
    if (colorPicker) colorPicker.value = normalized;
    if (colorHexInput && document.activeElement !== colorHexInput) colorHexInput.value = normalized;
    updateTexturePaintDialogUI(app);
  };
  colorPicker?.addEventListener('input', () => setBrushHex(colorPicker.value));
  colorHexInput?.addEventListener('change', () => {
    let val = colorHexInput.value.trim();
    if (!val.startsWith('#')) val = `#${val}`;
    setBrushHex(val);
  });
  dialog.querySelectorAll<HTMLButtonElement>('[data-swatch]').forEach((sw) => {
    sw.addEventListener('click', () => {
      const hex = sw.getAttribute('data-swatch');
      if (hex) setBrushHex(hex);
    });
  });

  const scalarRange = app.getElement('texPaintScalarRange') as HTMLInputElement | null;
  const scalarVal = app.getElement('texPaintScalarVal') as HTMLElement | null;
  scalarRange?.addEventListener('input', () => {
    const v = parseFloat(scalarRange.value);
    if (Number.isFinite(v)) {
      ctrl.channelValue = Math.max(0, Math.min(1, v));
      if (scalarVal) scalarVal.textContent = ctrl.channelValue.toFixed(2);
    }
  });

  // 7. Undo / Redo Paint Strokes
  app.getElement('btnTexPaintUndo')?.addEventListener('click', () => {
    const mesh = ctrl.getActiveTargetMesh();
    if (mesh && ctrl.undo(mesh)) {
      updateTexturePaintDialogUI(app);
    }
  });
  app.getElement('btnTexPaintRedo')?.addEventListener('click', () => {
    const mesh = ctrl.getActiveTargetMesh();
    if (mesh && ctrl.redo(mesh)) {
      updateTexturePaintDialogUI(app);
    }
  });

  // 8. Brush Tip, Radius, Hardness, Opacity & Checkboxes
  const alphaSelect = app.getElement('texPaintAlphaSelect') as HTMLSelectElement | null;
  alphaSelect?.addEventListener('change', () => {
    ctrl.brushAlpha = alphaSelect.value as any;
  });

  const radiusRange = app.getElement('texPaintRadiusRange') as HTMLInputElement | null;
  const radiusVal = app.getElement('texPaintRadiusVal') as HTMLElement | null;
  radiusRange?.addEventListener('input', () => {
    const v = parseFloat(radiusRange.value);
    if (Number.isFinite(v)) {
      ctrl.setRadius(v);
      if (radiusVal) radiusVal.textContent = v.toFixed(2);
    }
  });

  const hardnessRange = app.getElement('texPaintHardnessRange') as HTMLInputElement | null;
  const hardnessVal = app.getElement('texPaintHardnessVal') as HTMLElement | null;
  hardnessRange?.addEventListener('input', () => {
    const v = parseFloat(hardnessRange.value);
    if (Number.isFinite(v)) {
      ctrl.setHardness(v);
      if (hardnessVal) hardnessVal.textContent = `${Math.round(v * 100)}%`;
    }
  });

  const opacityRange = app.getElement('texPaintOpacityRange') as HTMLInputElement | null;
  const opacityVal = app.getElement('texPaintOpacityVal') as HTMLElement | null;
  opacityRange?.addEventListener('input', () => {
    const v = parseFloat(opacityRange.value);
    if (Number.isFinite(v)) {
      ctrl.setOpacity(v);
      if (opacityVal) opacityVal.textContent = `${Math.round(v * 100)}%`;
    }
  });

  const symCheck = app.getElement('texPaintSymmetryCheck') as HTMLInputElement | null;
  symCheck?.addEventListener('change', () => ctrl.setSymmetry(symCheck.checked));

  const islandFillCheck = app.getElement('texPaintIslandFillCheck') as HTMLInputElement | null;
  islandFillCheck?.addEventListener('change', () => {
    ctrl.islandFillOnly = islandFillCheck.checked;
  });

  const backfaceCheck = app.getElement('texPaintBackfaceCullCheck') as HTMLInputElement | null;
  backfaceCheck?.addEventListener('change', () => {
    ctrl.backfaceCull = backfaceCheck.checked;
  });

  const wireCheck = app.getElement('texPaintWireframeCheck') as HTMLInputElement | null;
  wireCheck?.addEventListener('change', () => {
    ctrl.showUvWireframe = wireCheck.checked;
    updateTexturePaintDialogUI(app);
  });

  // 9. Stylized AO & Gradient Base + Download PNG
  app.getElement('btnTexPaintStylizedBase')?.addEventListener('click', () => {
    const mesh = ctrl.getActiveTargetMesh();
    if (!mesh) {
      app.showToast('Please select a 3D mesh first.', 'info');
      return;
    }
    ctrl.applyStylizedBase(mesh, { baseColor: ctrl.colorHex });
    app.showToast(`Applied stylized hand-painted base shading to "${mesh.name}".`, 'success');
    updateTexturePaintDialogUI(app);
  });

  app.getElement('btnTexPaintDownloadPng')?.addEventListener('click', () => {
    const mesh = ctrl.getActiveTargetMesh();
    if (!mesh) {
      app.showToast('Please select a painted mesh first.', 'info');
      return;
    }
    const dataUrl = ctrl.getPaintedDataUrl(mesh, ctrl.channel);
    if (!dataUrl) {
      app.showToast('Initialize a paint canvas before downloading.', 'info');
      return;
    }
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${mesh.name}_${ctrl.channel}.png`;
    a.click();
    app.showToast(`Downloaded ${mesh.name}_${ctrl.channel}.png`, 'success');
  });

  // 10. Direct 2D UV Canvas Painting (Phase 2)
  const previewCanvas = app.getElement('texPaintPreviewCanvas') as HTMLCanvasElement | null;
  if (previewCanvas) {
    let painting2D = false;
    const paintAtEvent = (evt: PointerEvent, isFirst: boolean) => {
      const mesh = ctrl.getActiveTargetMesh();
      if (!mesh) return;
      const rect = previewCanvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const u = Math.max(0, Math.min(1, (evt.clientX - rect.left) / rect.width));
      const v = Math.max(0, Math.min(1, 1 - (evt.clientY - rect.top) / rect.height));
      ctrl.paint2DAtUV(mesh, u, v, { pushUndo: isFirst });
    };

    previewCanvas.addEventListener('pointerdown', (evt) => {
      if (evt.button !== 0) return;
      painting2D = true;
      previewCanvas.setPointerCapture?.(evt.pointerId);
      paintAtEvent(evt, true);
    });
    previewCanvas.addEventListener('pointermove', (evt) => {
      if (!painting2D) return;
      paintAtEvent(evt, false);
    });
    const stop2D = () => {
      if (!painting2D) return;
      painting2D = false;
      const mesh = ctrl.getActiveTargetMesh();
      if (mesh) ctrl.finalize2DStroke(mesh);
    };
    previewCanvas.addEventListener('pointerup', stop2D);
    previewCanvas.addEventListener('pointercancel', stop2D);
  }

  // 11. Layer Stack Controls (Phase 2)
  const newLayerChannel = app.getElement('texPaintNewLayerChannel') as HTMLSelectElement | null;
  app.getElement('btnTexPaintAddLayer')?.addEventListener('click', () => {
    const mesh = ctrl.getActiveTargetMesh();
    if (!mesh) {
      app.showToast('Please select a 3D mesh first.', 'info');
      return;
    }
    const ch = (newLayerChannel?.value || 'albedo') as any;
    ctrl.addLayer(mesh, { channel: ch });
    updateTexturePaintDialogUI(app);
  });

  const layerBlendSelect = app.getElement('texPaintLayerBlendSelect') as HTMLSelectElement | null;
  layerBlendSelect?.addEventListener('change', () => {
    const mesh = ctrl.getActiveTargetMesh();
    const session = ctrl.getSession(mesh);
    if (mesh && session) {
      ctrl.updateLayerProperties(mesh, session.activeLayerId, { blendMode: layerBlendSelect.value as any });
    }
  });

  const layerOpacityRange = app.getElement('texPaintLayerOpacityRange') as HTMLInputElement | null;
  const layerOpacityVal = app.getElement('texPaintLayerOpacityVal') as HTMLElement | null;
  let layerOpacityDragStart: { mesh: Mesh; layerId: string; opacity: number } | null = null;
  layerOpacityRange?.addEventListener('input', () => {
    const v = parseFloat(layerOpacityRange.value);
    if (layerOpacityVal && Number.isFinite(v)) layerOpacityVal.textContent = `${Math.round(v * 100)}%`;
    const mesh = ctrl.getActiveTargetMesh();
    const session = ctrl.getSession(mesh);
    if (mesh && session && Number.isFinite(v)) {
      if (!layerOpacityDragStart) {
        const active = ctrl.getActiveLayer(session);
        if (active) {
          layerOpacityDragStart = { mesh, layerId: active.id, opacity: active.opacity };
        }
      }
      ctrl.service.runWithoutRecording(() => {
        ctrl.updateLayerProperties(mesh, session.activeLayerId, { opacity: v });
      });
    }
  });
  layerOpacityRange?.addEventListener('change', () => {
    const v = parseFloat(layerOpacityRange.value);
    if (layerOpacityDragStart && Number.isFinite(v)) {
      const start = layerOpacityDragStart;
      layerOpacityDragStart = null;
      if (Math.abs(start.opacity - v) > 1e-4) {
        // Temporarily restore start opacity without recording, then commit single undo entry
        ctrl.service.runWithoutRecording(() => {
          ctrl.updateLayerProperties(start.mesh, start.layerId, { opacity: start.opacity });
        });
        ctrl.updateLayerProperties(start.mesh, start.layerId, { opacity: v });
      }
    }
  });

  app.getElement('btnTexPaintLayerUp')?.addEventListener('click', () => {
    const mesh = ctrl.getActiveTargetMesh();
    const session = ctrl.getSession(mesh);
    if (mesh && session) ctrl.moveLayer(mesh, session.activeLayerId, 'up');
  });
  app.getElement('btnTexPaintLayerDown')?.addEventListener('click', () => {
    const mesh = ctrl.getActiveTargetMesh();
    const session = ctrl.getSession(mesh);
    if (mesh && session) ctrl.moveLayer(mesh, session.activeLayerId, 'down');
  });
  app.getElement('btnTexPaintLayerDuplicate')?.addEventListener('click', () => {
    const mesh = ctrl.getActiveTargetMesh();
    const session = ctrl.getSession(mesh);
    if (mesh && session) ctrl.duplicateLayer(mesh, session.activeLayerId);
  });
  app.getElement('btnTexPaintFlattenLayers')?.addEventListener('click', () => {
    const mesh = ctrl.getActiveTargetMesh();
    if (mesh && ctrl.flattenAlbedoLayers(mesh)) {
      app.showToast('Flattened albedo layers.', 'success');
    }
  });
  app.getElement('btnTexPaintDeleteLayer')?.addEventListener('click', () => {
    const mesh = ctrl.getActiveTargetMesh();
    const session = ctrl.getSession(mesh);
    if (mesh && session) {
      if (!ctrl.deleteLayer(mesh, session.activeLayerId)) {
        app.showToast('Cannot delete the last remaining layer.', 'info');
      }
    }
  });

  // 12. Stencil Projection Controls (Phase 3)
  const stencilFileInput = app.getElement('texPaintStencilFileInput') as HTMLInputElement | null;
  app.getElement('btnTexPaintUploadStencil')?.addEventListener('click', () => stencilFileInput?.click());
  stencilFileInput?.addEventListener('change', () => {
    const file = stencilFileInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      if (typeof reader.result === 'string') {
        await ctrl.loadStencilFromUrl(reader.result, file.name);
        ctrl.setMode('stencil');
        app.showToast(`Loaded stencil "${file.name}".`, 'success');
        updateTexturePaintDialogUI(app);
      }
    };
    reader.readAsDataURL(file);
    stencilFileInput.value = '';
  });

  const stencilPresetSelect = app.getElement('texPaintStencilPresetSelect') as HTMLSelectElement | null;
  app.getElement('btnTexPaintLoadStencilPreset')?.addEventListener('click', async () => {
    const selectedUrl = stencilPresetSelect?.value;
    if (!selectedUrl) return;
    const optText = stencilPresetSelect.options[stencilPresetSelect.selectedIndex]?.text || 'Stencil';
    await ctrl.loadStencilFromUrl(selectedUrl, optText);
    ctrl.setMode('stencil');
    app.showToast(`Loaded stencil "${optText}".`, 'success');
    updateTexturePaintDialogUI(app);
  });

  app.getElement('btnTexPaintClearStencil')?.addEventListener('click', () => {
    ctrl.clearStencil();
    updateTexturePaintDialogUI(app);
  });

  const stencilVisibleCheck = app.getElement('texPaintStencilVisibleCheck') as HTMLInputElement | null;
  stencilVisibleCheck?.addEventListener('change', () => {
    ctrl.stencil.visible = stencilVisibleCheck.checked;
    updateTexturePaintStencilOverlayUI(app);
  });

  const stencilOpacityRange = app.getElement('texPaintStencilOpacityRange') as HTMLInputElement | null;
  const stencilOpacityVal = app.getElement('texPaintStencilOpacityVal') as HTMLElement | null;
  stencilOpacityRange?.addEventListener('input', () => {
    const v = parseFloat(stencilOpacityRange.value);
    if (Number.isFinite(v)) {
      ctrl.stencil.opacity = v;
      if (stencilOpacityVal) stencilOpacityVal.textContent = `${Math.round(v * 100)}%`;
      updateTexturePaintStencilOverlayUI(app);
    }
  });

  const stencilScaleRange = app.getElement('texPaintStencilScaleRange') as HTMLInputElement | null;
  const stencilScaleVal = app.getElement('texPaintStencilScaleVal') as HTMLElement | null;
  stencilScaleRange?.addEventListener('input', () => {
    const v = parseFloat(stencilScaleRange.value);
    if (Number.isFinite(v)) {
      ctrl.stencil.scale = v;
      if (stencilScaleVal) stencilScaleVal.textContent = `${Math.round(v * 100)}%`;
      updateTexturePaintStencilOverlayUI(app);
    }
  });

  const stencilRotRange = app.getElement('texPaintStencilRotRange') as HTMLInputElement | null;
  const stencilRotVal = app.getElement('texPaintStencilRotVal') as HTMLElement | null;
  stencilRotRange?.addEventListener('input', () => {
    const v = parseFloat(stencilRotRange.value);
    if (Number.isFinite(v)) {
      ctrl.stencil.rotationDeg = v;
      if (stencilRotVal) stencilRotVal.textContent = `${Math.round(v)}°`;
      updateTexturePaintStencilOverlayUI(app);
    }
  });

  const stencilOffXRange = app.getElement('texPaintStencilOffXRange') as HTMLInputElement | null;
  const stencilOffYRange = app.getElement('texPaintStencilOffYRange') as HTMLInputElement | null;
  const stencilOffVal = app.getElement('texPaintStencilOffVal') as HTMLElement | null;
  const syncStencilOffset = () => {
    ctrl.stencil.offsetX = parseFloat(stencilOffXRange?.value || '0') || 0;
    ctrl.stencil.offsetY = parseFloat(stencilOffYRange?.value || '0') || 0;
    if (stencilOffVal) {
      stencilOffVal.textContent = `${Math.round(ctrl.stencil.offsetX * 100)}%, ${Math.round(ctrl.stencil.offsetY * 100)}%`;
    }
    updateTexturePaintStencilOverlayUI(app);
  };
  stencilOffXRange?.addEventListener('input', syncStencilOffset);
  stencilOffYRange?.addEventListener('input', syncStencilOffset);

  app.getElement('btnTexPaintResetStencil')?.addEventListener('click', () => {
    ctrl.resetStencilTransform();
    updateTexturePaintDialogUI(app);
  });

  app.getElement('btnTexPaintProjectWholeStencil')?.addEventListener('click', () => {
    const mesh = ctrl.getActiveTargetMesh();
    if (!mesh) {
      app.showToast('Please select a 3D mesh first.', 'info');
      return;
    }
    if (!ctrl.stencil.pixels) {
      app.showToast('Load a stencil image first.', 'info');
      return;
    }
    try {
      const res = ctrl.projectWholeStencil(mesh, { face: 'camera' });
      app.showToast(`Projected stencil onto "${res.meshName}" (${res.texelsPainted} texels).`, 'success');
      updateTexturePaintDialogUI(app);
    } catch (err: any) {
      app.showToast(`Stencil projection failed: ${err?.message || err}`, 'error');
    }
  });

  // Controller reactive callbacks
  ctrl.onStateChanged = () => {
    app.updatePanelButtonStates();
    updateTexturePaintDialogUI(app);
  };
  ctrl.onCanvasUpdated = () => {
    const preview = app.getElement('texPaintPreviewCanvas') as HTMLCanvasElement | null;
    if (preview) {
      ctrl.renderPreviewToCanvas(ctrl.getActiveTargetMesh(), preview);
    }
  };
  ctrl.onColorPicked = (hex: string) => {
    if (colorPicker) colorPicker.value = hex;
    if (colorHexInput) colorHexInput.value = hex;
    app.showToast(`Picked color ${hex}`, 'info');
    updateTexturePaintDialogUI(app);
  };
  ctrl.onStencilChanged = () => {
    updateTexturePaintStencilOverlayUI(app);
  };

  updateTexturePaintDialogUI(app);
}

export function updateTexturePaintDialogUI(app: any): void {
  const dialog: HTMLElement | null = app.getElement('dialog-texture-paint');
  if (!dialog) return;
  if (dialog.style.display === 'none') {
    updateTexturePaintStencilOverlayUI(app);
    return;
  }

  const ctrl = app.service.texturePaintController;
  const mesh = ctrl.getActiveTargetMesh();
  const session = ctrl.getSession(mesh);

  // Active mode button
  const btnToggleMode = app.getElement('btnToggleTexturePaintMode') as HTMLButtonElement | null;
  const modeLabel = app.getElement('texPaintModeLabel') as HTMLElement | null;
  if (btnToggleMode) btnToggleMode.classList.toggle('active', ctrl.isActive);
  if (modeLabel) {
    modeLabel.textContent = ctrl.isActive ? '3D Paint Mode Active (Click to Pause)' : 'Activate 3D Paint Mode';
  }

  // Target status & context-aware Load/Init button label
  const targetStatus = app.getElement('texPaintTargetStatus') as HTMLElement | null;
  const initLabel = app.getElement('texPaintInitCanvasLabel') as HTMLElement | null;
  const hasExistingTex = ctrl.hasExistingEditableTexture(mesh);
  if (targetStatus) {
    if (!mesh) {
      targetStatus.textContent = 'Target: No mesh selected';
    } else if (session) {
      const originTag = session.loadedFromExistingTexture ? ' · existing texture' : '';
      targetStatus.textContent = `Target: ${mesh.name} (${session.resolution}px, ${session.islandCount} UV islands${originTag})`;
    } else if (hasExistingTex) {
      targetStatus.textContent = `Target: ${mesh.name} (existing texture detected — paint directly or click Edit Existing)`;
    } else {
      targetStatus.textContent = `Target: ${mesh.name} (click mesh or Init Canvas to begin)`;
    }
  }
  if (initLabel) {
    if (session) {
      initLabel.textContent = 'Resize Canvas';
    } else if (hasExistingTex) {
      initLabel.textContent = 'Edit Existing Texture';
    } else {
      initLabel.textContent = 'Auto-UV & Init Canvas';
    }
  }

  // Mode buttons
  dialog.querySelectorAll<HTMLButtonElement>('[data-texpaint-mode]').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-texpaint-mode') === ctrl.mode);
  });

  // Channel select + color vs scalar toggle
  const channelSelect = app.getElement('texPaintChannelSelect') as HTMLSelectElement | null;
  if (channelSelect) channelSelect.value = ctrl.channel;
  const isScalar = ctrl.channel === 'roughness' || ctrl.channel === 'metallic';
  const colorGroup = app.getElement('texPaintColorGroup') as HTMLElement | null;
  const scalarGroup = app.getElement('texPaintScalarGroup') as HTMLElement | null;
  if (colorGroup) colorGroup.style.display = isScalar ? 'none' : '';
  if (scalarGroup) scalarGroup.style.display = isScalar ? '' : 'none';

  const colorPicker = app.getElement('texPaintColorPicker') as HTMLInputElement | null;
  const colorHexInput = app.getElement('texPaintColorHexInput') as HTMLInputElement | null;
  if (colorPicker) colorPicker.value = ctrl.colorHex;
  if (colorHexInput && document.activeElement !== colorHexInput) colorHexInput.value = ctrl.colorHex;
  dialog.querySelectorAll<HTMLButtonElement>('[data-swatch]').forEach((sw) => {
    sw.classList.toggle('active', sw.getAttribute('data-swatch')?.toLowerCase() === ctrl.colorHex.toLowerCase());
  });

  const scalarRange = app.getElement('texPaintScalarRange') as HTMLInputElement | null;
  const scalarVal = app.getElement('texPaintScalarVal') as HTMLElement | null;
  if (scalarRange) scalarRange.value = String(ctrl.channelValue);
  if (scalarVal) scalarVal.textContent = ctrl.channelValue.toFixed(2);

  // Layer badge & Layer list
  const layers = ctrl.getLayersSummary(mesh);
  const layerBadge = app.getElement('texPaintLayerCountBadge') as HTMLElement | null;
  if (layerBadge) layerBadge.textContent = String(layers.length);

  const layerList = app.getElement('texPaintLayerList') as HTMLElement | null;
  if (layerList) {
    if (layers.length === 0) {
      layerList.innerHTML =
        '<div class="tool-sublabel" style="padding: 12px; text-align: center;">Initialize canvas to manage layers</div>';
    } else {
      layerList.innerHTML = '';
      for (let i = layers.length - 1; i >= 0; i--) {
        const l = layers[i];
        const row = document.createElement('div');
        row.className = `texpaint-layer-item${l.isActive ? ' active' : ''}`;

        const eyeBtn = document.createElement('button');
        eyeBtn.type = 'button';
        eyeBtn.className = `texpaint-layer-eye${l.visible ? ' visible' : ''}`;
        eyeBtn.title = l.visible ? 'Hide Layer' : 'Show Layer';
        eyeBtn.textContent = l.visible ? '●' : '○';
        eyeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (mesh) ctrl.updateLayerProperties(mesh, l.id, { visible: !l.visible });
        });

        const nameSpan = document.createElement('span');
        nameSpan.className = 'texpaint-layer-name';
        nameSpan.textContent = l.name;

        const metaSpan = document.createElement('span');
        metaSpan.className = 'texpaint-layer-meta';
        metaSpan.textContent = `${l.channel.slice(0, 3)} · ${Math.round(l.opacity * 100)}%`;

        row.appendChild(eyeBtn);
        row.appendChild(nameSpan);
        row.appendChild(metaSpan);
        row.addEventListener('click', () => {
          if (mesh) ctrl.selectLayer(mesh, l.id);
        });
        layerList.appendChild(row);
      }
    }
  }

  const activeLayer = layers.find((l: any) => l.isActive);
  const layerBlendSelect = app.getElement('texPaintLayerBlendSelect') as HTMLSelectElement | null;
  const layerOpacityRange = app.getElement('texPaintLayerOpacityRange') as HTMLInputElement | null;
  const layerOpacityVal = app.getElement('texPaintLayerOpacityVal') as HTMLElement | null;
  if (activeLayer) {
    if (layerBlendSelect) layerBlendSelect.value = activeLayer.blendMode;
    if (layerOpacityRange) layerOpacityRange.value = String(activeLayer.opacity);
    if (layerOpacityVal) layerOpacityVal.textContent = `${Math.round(activeLayer.opacity * 100)}%`;
  }

  // Populate Stencil presets from Decal / Scene textures
  const stencilPresetSelect = app.getElement('texPaintStencilPresetSelect') as HTMLSelectElement | null;
  if (stencilPresetSelect) {
    const options = app.service.decalController.getAvailableTextures();
    if (stencilPresetSelect.options.length !== options.length + 1) {
      const prevVal = stencilPresetSelect.value;
      stencilPresetSelect.innerHTML = '<option value="">-- Pick Decal / Scene Texture --</option>';
      for (const opt of options) {
        const o = document.createElement('option');
        o.value = opt.url;
        o.textContent = opt.name;
        stencilPresetSelect.appendChild(o);
      }
      stencilPresetSelect.value = prevVal;
    }
  }

  const stencilNameBadge = app.getElement('texPaintStencilNameBadge') as HTMLElement | null;
  if (stencilNameBadge) {
    stencilNameBadge.textContent = ctrl.stencil.name ? `Loaded: ${ctrl.stencil.name}` : 'No stencil loaded';
  }
  const stencilOpacityRange = app.getElement('texPaintStencilOpacityRange') as HTMLInputElement | null;
  const stencilOpacityVal = app.getElement('texPaintStencilOpacityVal') as HTMLElement | null;
  const stencilScaleRange = app.getElement('texPaintStencilScaleRange') as HTMLInputElement | null;
  const stencilScaleVal = app.getElement('texPaintStencilScaleVal') as HTMLElement | null;
  const stencilRotRange = app.getElement('texPaintStencilRotRange') as HTMLInputElement | null;
  const stencilRotVal = app.getElement('texPaintStencilRotVal') as HTMLElement | null;
  const stencilOffXRange = app.getElement('texPaintStencilOffXRange') as HTMLInputElement | null;
  const stencilOffYRange = app.getElement('texPaintStencilOffYRange') as HTMLInputElement | null;
  const stencilOffVal = app.getElement('texPaintStencilOffVal') as HTMLElement | null;
  if (stencilOpacityRange) stencilOpacityRange.value = String(ctrl.stencil.opacity);
  if (stencilOpacityVal) stencilOpacityVal.textContent = `${Math.round(ctrl.stencil.opacity * 100)}%`;
  if (stencilScaleRange) stencilScaleRange.value = String(ctrl.stencil.scale);
  if (stencilScaleVal) stencilScaleVal.textContent = `${Math.round(ctrl.stencil.scale * 100)}%`;
  if (stencilRotRange) stencilRotRange.value = String(ctrl.stencil.rotationDeg);
  if (stencilRotVal) stencilRotVal.textContent = `${Math.round(ctrl.stencil.rotationDeg)}°`;
  if (stencilOffXRange) stencilOffXRange.value = String(ctrl.stencil.offsetX);
  if (stencilOffYRange) stencilOffYRange.value = String(ctrl.stencil.offsetY);
  if (stencilOffVal) {
    stencilOffVal.textContent = `${Math.round(ctrl.stencil.offsetX * 100)}%, ${Math.round(ctrl.stencil.offsetY * 100)}%`;
  }

  // 2D Preview Canvas
  const previewCanvas = app.getElement('texPaintPreviewCanvas') as HTMLCanvasElement | null;
  if (previewCanvas) {
    ctrl.renderPreviewToCanvas(mesh, previewCanvas);
  }

  updateTexturePaintStencilOverlayUI(app);
}

export function updateTexturePaintStencilOverlayUI(app: any): void {
  const overlay = app.getElement('texturePaintStencilOverlay') as HTMLElement | null;
  const img = app.getElement('texturePaintStencilOverlayImg') as HTMLImageElement | null;
  if (!overlay || !img) return;

  const ctrl = app.service.texturePaintController;
  const shouldShow = ctrl.isActive && ctrl.stencil.enabled && ctrl.stencil.visible && Boolean(ctrl.stencil.dataUrl);
  if (!shouldShow) {
    overlay.style.display = 'none';
    return;
  }

  overlay.style.display = 'flex';
  if (img.src !== ctrl.stencil.dataUrl) {
    img.src = ctrl.stencil.dataUrl;
  }

  const vpW = window.innerWidth || 1024;
  const vpH = window.innerHeight || 768;
  const minDim = Math.min(vpW, vpH);
  const sizePx = Math.max(24, Math.round(minDim * ctrl.stencil.scale));
  const aspect = ctrl.stencil.width > 0 && ctrl.stencil.height > 0 ? ctrl.stencil.width / ctrl.stencil.height : 1;
  const wPx = Math.round(sizePx * Math.min(1, aspect));
  const hPx = Math.round(sizePx / Math.max(1, aspect));

  img.style.width = `${wPx}px`;
  img.style.height = `${hPx}px`;
  img.style.opacity = String(ctrl.stencil.opacity);
  img.style.transform = `translate(${Math.round(ctrl.stencil.offsetX * vpW)}px, ${Math.round(ctrl.stencil.offsetY * vpH)}px) rotate(${ctrl.stencil.rotationDeg}deg)`;
}
