import type { Mesh } from '@babylonjs/core';
import type { MeshEditorAppHost } from '../services/MeshEditorAppHost';

export class HeightmapUIService {
  private activeHeightmapPaintTab: 'height' | 'mix' = 'height';
  private lastSyncedHeightmapMesh: Mesh | null = null;
  private heightmapPaintBackup: {
    heightmap: Uint8ClampedArray;
    mixmap: Uint8ClampedArray;
    hasCustomMixMap: boolean;
  } | null = null;

  constructor(private readonly app: MeshEditorAppHost) {}

  private renderRgbaToCanvas(rgba: Uint8ClampedArray, srcSize: number, canvas: HTMLCanvasElement | null): void {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx || srcSize <= 0) return;

    if (canvas.width === srcSize && canvas.height === srcSize) {
      const imgData = ctx.createImageData(srcSize, srcSize);
      imgData.data.set(rgba.subarray(0, srcSize * srcSize * 4));
      ctx.putImageData(imgData, 0, 0);
      return;
    }

    const offscreen = document.createElement('canvas');
    offscreen.width = srcSize;
    offscreen.height = srcSize;
    const offCtx = offscreen.getContext('2d');
    if (!offCtx) return;
    const imgData = offCtx.createImageData(srcSize, srcSize);
    imgData.data.set(rgba.subarray(0, srcSize * srcSize * 4));
    offCtx.putImageData(imgData, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(offscreen, 0, 0, canvas.width, canvas.height);
    offscreen.remove();
  }

  public openHeightmapPaintModal(initialTab: 'height' | 'mix' = 'height'): void {
    const modal = this.app.getElement<HTMLElement>('heightmapPaintModal');
    if (!modal) return;
    const ctrl = this.app.service.heightmapController;

    this.heightmapPaintBackup = {
      heightmap: new Uint8ClampedArray(ctrl.heightmapRgba),
      mixmap: new Uint8ClampedArray(ctrl.mixmapRgba),
      hasCustomMixMap: ctrl.hasCustomMixMap,
    };

    this.switchHeightmapPaintModalTab(initialTab);
    modal.classList.add('active');
    this.app.refreshIcons();
  }

  private switchHeightmapPaintModalTab(tab: 'height' | 'mix'): void {
    this.activeHeightmapPaintTab = tab;
    const ctrl = this.app.service.heightmapController;

    const tabHeight = this.app.getElement<HTMLButtonElement>('paintModalTabHeight');
    const tabMix = this.app.getElement<HTMLButtonElement>('paintModalTabMix');
    const grayControls = this.app.getElement<HTMLElement>('paintModalGrayscaleControls');
    const mixControls = this.app.getElement<HTMLElement>('paintModalMixControls');
    const hint = this.app.getElement<HTMLElement>('heightmapPaintCanvasHint');
    const paintCanvas = this.app.getElement<HTMLCanvasElement>('heightmapPaintCanvas');

    tabHeight?.classList.toggle('active', tab === 'height');
    tabMix?.classList.toggle('active', tab === 'mix');

    if (grayControls) grayControls.style.display = tab === 'height' ? 'flex' : 'none';
    if (mixControls) mixControls.style.display = tab === 'mix' ? 'flex' : 'none';

    if (hint) {
      hint.textContent =
        tab === 'height'
          ? 'Painting on black ground in grayscale: White raises terrain, Black lowers it.'
          : 'Painting RGB splat weights: Red = Texture 1, Green = Texture 2 (Path), Blue = Texture 3.';
    }

    this.renderRgbaToCanvas(
      tab === 'height' ? ctrl.heightmapRgba : ctrl.mixmapRgba,
      ctrl.mapSize,
      paintCanvas,
    );
  }

  public initHeightmapUI(): void {
    const dialog = this.app.getElement('dialog-heightmap');
    if (!dialog || (dialog as any)._heightmapInitialized) return;
    (dialog as any)._heightmapInitialized = true;

    const ctrl = this.app.service.heightmapController;

    // 1. Dialog 2-Tab Switcher (Heightmap [Default] & Mix Texture RGB)
    const tabBtnHeight = this.app.getElement<HTMLButtonElement>('heightmapTabBtnHeight');
    const tabBtnMix = this.app.getElement<HTMLButtonElement>('heightmapTabBtnMix');
    const tabPaneHeight = this.app.getElement<HTMLElement>('heightmapTabPaneHeight');
    const tabPaneMix = this.app.getElement<HTMLElement>('heightmapTabPaneMix');

    const switchDialogTab = (tab: 'height' | 'mix') => {
      if (tabBtnHeight) {
        tabBtnHeight.classList.toggle('tool-btn-primary', tab === 'height');
      }
      if (tabBtnMix) {
        tabBtnMix.classList.toggle('tool-btn-primary', tab === 'mix');
      }
      if (tabPaneHeight) tabPaneHeight.style.display = tab === 'height' ? 'flex' : 'none';
      if (tabPaneMix) tabPaneMix.style.display = tab === 'mix' ? 'flex' : 'none';
    };

    tabBtnHeight?.addEventListener('click', () => switchDialogTab('height'));
    tabBtnMix?.addEventListener('click', () => switchDialogTab('mix'));

    // 2. Preview Canvas & Paint Editor Launchers
    const heightPreview = this.app.getElement<HTMLCanvasElement>('heightmapPreviewCanvas');
    const mixPreview = this.app.getElement<HTMLCanvasElement>('mixmapPreviewCanvas');
    heightPreview?.addEventListener('click', () => this.openHeightmapPaintModal('height'));
    mixPreview?.addEventListener('click', () => this.openHeightmapPaintModal('mix'));

    this.app.getElement('btnOpenHeightmapPainter')?.addEventListener('click', () => {
      this.openHeightmapPaintModal('height');
    });
    this.app.getElement('btnOpenMixmapPainter')?.addEventListener('click', () => {
      this.openHeightmapPaintModal('mix');
    });

    // 3. Upload Heightmap & Mixmap
    const heightFileInput = this.app.getElement<HTMLInputElement>('heightmapFileInput');
    const mixFileInput = this.app.getElement<HTMLInputElement>('mixmapFileInput');

    const readImageFileAsDataUrl = (file: File): Promise<string> =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Failed to read image file.'));
        reader.readAsDataURL(file);
      });

    this.app.getElement('btnUploadHeightmap')?.addEventListener('click', () => heightFileInput?.click());
    this.app.getElement('btnPaintUploadHeight')?.addEventListener('click', () => heightFileInput?.click());
    heightFileInput?.addEventListener('change', async () => {
      const file = heightFileInput.files?.[0];
      if (!file) return;
      try {
        const dataUrl = await readImageFileAsDataUrl(file);
        await ctrl.loadHeightmapFromUrl(dataUrl);
        this.renderRgbaToCanvas(
          this.activeHeightmapPaintTab === 'height' ? ctrl.heightmapRgba : ctrl.mixmapRgba,
          ctrl.mapSize,
          this.app.getElement<HTMLCanvasElement>('heightmapPaintCanvas'),
        );
        if (ctrl.getActiveTerrainMesh()) {
          await ctrl.buildOrUpdateTerrainMesh(this.readHeightmapFormDimensions());
        }
        this.updateHeightmapUI();
        this.app.showToast(`Loaded heightmap "${file.name}"`, 'success');
      } catch (err: any) {
        this.app.showToast(err?.message || 'Failed to load heightmap image.', 'error');
      }
      heightFileInput.value = '';
    });

    this.app.getElement('btnUploadMixmap')?.addEventListener('click', () => mixFileInput?.click());
    this.app.getElement('btnPaintUploadMix')?.addEventListener('click', () => mixFileInput?.click());
    mixFileInput?.addEventListener('change', async () => {
      const file = mixFileInput.files?.[0];
      if (!file) return;
      try {
        const dataUrl = await readImageFileAsDataUrl(file);
        await ctrl.loadMixmapFromUrl(dataUrl);
        this.renderRgbaToCanvas(
          this.activeHeightmapPaintTab === 'height' ? ctrl.heightmapRgba : ctrl.mixmapRgba,
          ctrl.mapSize,
          this.app.getElement<HTMLCanvasElement>('heightmapPaintCanvas'),
        );
        if (ctrl.getActiveTerrainMesh()) {
          await ctrl.buildOrUpdateTerrainMesh(this.readHeightmapFormDimensions());
        }
        this.updateHeightmapUI();
        this.app.showToast(`Loaded mix texture "${file.name}"`, 'success');
      } catch (err: any) {
        this.app.showToast(err?.message || 'Failed to load mix texture image.', 'error');
      }
      mixFileInput.value = '';
    });

    // 4. Presets & Auto-Mix
    const presetSelect = this.app.getElement<HTMLSelectElement>('heightmapPresetSelect');
    this.app.getElement('btnApplyHeightmapPreset')?.addEventListener('click', async () => {
      const preset = (presetSelect?.value || 'island') as any;
      ctrl.applyPreset(preset);
      await ctrl.buildOrUpdateTerrainMesh(this.readHeightmapFormDimensions());
      this.updateHeightmapUI();
      this.app.showToast(`Applied "${preset}" heightmap preset.`, 'success');
    });

    this.app.getElement('btnGenerateMixmapFromHeight')?.addEventListener('click', async () => {
      ctrl.regenerateMixmapFromHeightmap();
      if (ctrl.getActiveTerrainMesh()) {
        await ctrl.buildOrUpdateTerrainMesh(this.readHeightmapFormDimensions());
      }
      this.updateHeightmapUI();
      this.app.showToast('Regenerated RGB mixmap from heightmap.', 'info');
    });

    // 5. Individual 3-Texture Assignment & Immediate Re-render
    const texSlots: Array<{ slot: 1 | 2 | 3; selectId: string; scaleId: string; uploadBtnId: string; fileId: string }> = [
      { slot: 1, selectId: 'heightmapTex1Select', scaleId: 'heightmapTex1ScaleNum', uploadBtnId: 'btnUploadTerrainTex1', fileId: 'terrainTex1FileInput' },
      { slot: 2, selectId: 'heightmapTex2Select', scaleId: 'heightmapTex2ScaleNum', uploadBtnId: 'btnUploadTerrainTex2', fileId: 'terrainTex2FileInput' },
      { slot: 3, selectId: 'heightmapTex3Select', scaleId: 'heightmapTex3ScaleNum', uploadBtnId: 'btnUploadTerrainTex3', fileId: 'terrainTex3FileInput' },
    ];

    for (const item of texSlots) {
      const selEl = this.app.getElement<HTMLSelectElement>(item.selectId);
      const scaleEl = this.app.getElement<HTMLInputElement>(item.scaleId);
      const uploadBtn = this.app.getElement<HTMLButtonElement>(item.uploadBtnId);
      const fileEl = this.app.getElement<HTMLInputElement>(item.fileId);

      selEl?.addEventListener('change', async () => {
        if (!selEl.value) return;
        await ctrl.setTerrainTexture(item.slot, selEl.value, undefined, true);
        this.updateHeightmapUI();
        this.app.showToast(`Assigned Terrain Texture ${item.slot} and re-rendered mesh.`, 'info');
      });

      scaleEl?.addEventListener('change', async () => {
        const val = parseFloat(scaleEl.value) || 10;
        await ctrl.setTerrainTextureScale(item.slot, val, true);
      });

      uploadBtn?.addEventListener('click', () => fileEl?.click());
      fileEl?.addEventListener('change', async () => {
        const file = fileEl.files?.[0];
        if (!file) return;
        try {
          await ctrl.addCustomTextureFromFile(file, item.slot);
          this.updateHeightmapUI();
          this.app.showToast(`Assigned uploaded Texture ${item.slot} ("${file.name}") and re-rendered mesh.`, 'success');
        } catch (err: any) {
          this.app.showToast(err?.message || 'Failed to load terrain texture.', 'error');
        }
        fileEl.value = '';
      });
    }

    // 6. Dimensions & Build Button
    const subRange = this.app.getElement<HTMLInputElement>('heightmapSubdivisionsRange');
    const subNum = this.app.getElement<HTMLInputElement>('heightmapSubdivisionsNum');
    const maxRange = this.app.getElement<HTMLInputElement>('heightmapMaxHeightRange');
    const maxNum = this.app.getElement<HTMLInputElement>('heightmapMaxHeightNum');

    const syncRangeNum = (range: HTMLInputElement | null, num: HTMLInputElement | null, onUpdate?: (v: number) => void) => {
      range?.addEventListener('input', () => {
        if (num) num.value = range.value;
        onUpdate?.(parseFloat(range.value));
      });
      num?.addEventListener('change', () => {
        if (range) range.value = num.value;
        onUpdate?.(parseFloat(num.value));
      });
    };
    syncRangeNum(subRange, subNum);
    syncRangeNum(maxRange, maxNum);

    this.app.getElement('btnBuildHeightmapTerrain')?.addEventListener('click', async () => {
      const dims = this.readHeightmapFormDimensions();
      const mesh = await ctrl.buildOrUpdateTerrainMesh(dims);
      this.updateHeightmapUI();
      this.app.showToast(`Built Heightmap Terrain "${mesh.name}" (${mesh.getTotalVertices()} vertices).`, 'success');
    });

    // 7. Paint Modal Setup & Interactive Canvas Painting
    const modal = this.app.getElement<HTMLElement>('heightmapPaintModal');
    if (modal && !(modal as any)._paintInitialized) {
      (modal as any)._paintInitialized = true;

      this.app.getElement('paintModalTabHeight')?.addEventListener('click', () => {
        this.switchHeightmapPaintModalTab('height');
      });
      this.app.getElement('paintModalTabMix')?.addEventListener('click', () => {
        this.switchHeightmapPaintModalTab('mix');
      });

      const brushSizeRange = this.app.getElement<HTMLInputElement>('heightmapBrushSizeRange');
      const brushSizeNum = this.app.getElement<HTMLInputElement>('heightmapBrushSizeNum');
      syncRangeNum(brushSizeRange, brushSizeNum, (v) => {
        ctrl.brushSize = Math.max(1, Math.min(150, v || 28));
      });

      const brushSmoothRange = this.app.getElement<HTMLInputElement>('heightmapBrushSmoothnessRange');
      const brushSmoothNum = this.app.getElement<HTMLInputElement>('heightmapBrushSmoothnessNum');
      syncRangeNum(brushSmoothRange, brushSmoothNum, (v) => {
        ctrl.brushSmoothness = Math.max(0, Math.min(1, (v || 0) / 100));
      });

      const grayRange = this.app.getElement<HTMLInputElement>('heightmapBrushGrayRange');
      const grayValLabel = this.app.getElement<HTMLElement>('heightmapBrushGrayVal');
      const setBrushGray = (val: number) => {
        const clamped = Math.max(0, Math.min(255, Math.round(val)));
        ctrl.brushGrayValue = clamped;
        if (grayRange) grayRange.value = String(clamped);
        if (grayValLabel) {
          grayValLabel.textContent =
            clamped === 255 ? '255 (White)' : clamped === 0 ? '0 (Black)' : String(clamped);
        }
        this.app.getElement('btnPaintGrayWhite')?.classList.toggle('active', clamped === 255);
        this.app.getElement('btnPaintGrayMid')?.classList.toggle('active', clamped === 128);
        this.app.getElement('btnPaintGrayBlack')?.classList.toggle('active', clamped === 0);
      };

      grayRange?.addEventListener('input', () => setBrushGray(Number(grayRange.value)));
      this.app.getElement('btnPaintGrayWhite')?.addEventListener('click', () => setBrushGray(255));
      this.app.getElement('btnPaintGrayMid')?.addEventListener('click', () => setBrushGray(128));
      this.app.getElement('btnPaintGrayBlack')?.addEventListener('click', () => setBrushGray(0));

      const setMixChannel = (ch: 'r' | 'g' | 'b' | 'custom', customHex?: string) => {
        ctrl.brushRgbChannel = ch;
        if (customHex && /^#[0-9a-fA-F]{6}$/.test(customHex)) {
          const clean = customHex.slice(1);
          ctrl.brushCustomRgb = [
            parseInt(clean.slice(0, 2), 16),
            parseInt(clean.slice(2, 4), 16),
            parseInt(clean.slice(4, 6), 16),
          ];
        }
        this.app.getElement('btnPaintChannelRed')?.classList.toggle('active', ch === 'r');
        this.app.getElement('btnPaintChannelGreen')?.classList.toggle('active', ch === 'g');
        this.app.getElement('btnPaintChannelBlue')?.classList.toggle('active', ch === 'b');
      };

      this.app.getElement('btnPaintChannelRed')?.addEventListener('click', () => setMixChannel('r'));
      this.app.getElement('btnPaintChannelGreen')?.addEventListener('click', () => setMixChannel('g'));
      this.app.getElement('btnPaintChannelBlue')?.addEventListener('click', () => setMixChannel('b'));
      const customColorPicker = this.app.getElement<HTMLInputElement>('heightmapPaintCustomColor');
      customColorPicker?.addEventListener('input', () => setMixChannel('custom', customColorPicker.value));

      const paintCanvas = this.app.getElement<HTMLCanvasElement>('heightmapPaintCanvas');
      const refreshPaintCanvas = () => {
        this.renderRgbaToCanvas(
          this.activeHeightmapPaintTab === 'height' ? ctrl.heightmapRgba : ctrl.mixmapRgba,
          ctrl.mapSize,
          paintCanvas,
        );
      };

      this.app.getElement('btnPaintClearBlack')?.addEventListener('click', () => {
        ctrl.clearHeightmapToBlack();
        refreshPaintCanvas();
        this.updateHeightmapUI();
      });

      this.app.getElement('btnPaintResetMixFromHeight')?.addEventListener('click', () => {
        ctrl.regenerateMixmapFromHeightmap();
        refreshPaintCanvas();
        this.updateHeightmapUI();
      });

      this.app.getElement('btnPaintUndoStroke')?.addEventListener('click', () => {
        if (ctrl.undoPaintSnapshot()) {
          refreshPaintCanvas();
          this.updateHeightmapUI();
        }
      });

      // Interactive pointer painting on 2D canvas
      let isPainting = false;
      let lastPx = 0;
      let lastPy = 0;

      const getCanvasCoords = (ev: PointerEvent | MouseEvent): [number, number] => {
        if (!paintCanvas) return [0, 0];
        const rect = paintCanvas.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          const x = ((ev.clientX - rect.left) / rect.width) * ctrl.mapSize;
          const y = ((ev.clientY - rect.top) / rect.height) * ctrl.mapSize;
          return [Math.max(0, Math.min(ctrl.mapSize - 1, x)), Math.max(0, Math.min(ctrl.mapSize - 1, y))];
        }
        const ox = (ev as any).offsetX ?? ev.clientX ?? ctrl.mapSize / 2;
        const oy = (ev as any).offsetY ?? ev.clientY ?? ctrl.mapSize / 2;
        return [
          Math.max(0, Math.min(ctrl.mapSize - 1, ox)),
          Math.max(0, Math.min(ctrl.mapSize - 1, oy)),
        ];
      };

      const startPaint = (ev: PointerEvent | MouseEvent) => {
        if ('button' in ev && ev.button !== 0) return;
        isPainting = true;
        const [px, py] = getCanvasCoords(ev);
        lastPx = px;
        lastPy = py;
        ctrl.beginPaintStroke(this.activeHeightmapPaintTab);
        if (this.activeHeightmapPaintTab === 'height') {
          ctrl.paintHeightmapStamp(px, py);
        } else {
          ctrl.paintMixmapStamp(px, py);
        }
        refreshPaintCanvas();
      };

      const movePaint = (ev: PointerEvent | MouseEvent) => {
        if (!isPainting) return;
        const [px, py] = getCanvasCoords(ev);
        if (this.activeHeightmapPaintTab === 'height') {
          ctrl.paintHeightmapStroke(lastPx, lastPy, px, py);
        } else {
          ctrl.paintMixmapStroke(lastPx, lastPy, px, py);
        }
        lastPx = px;
        lastPy = py;
        refreshPaintCanvas();
      };

      const finishPaint = () => {
        if (!isPainting) return;
        isPainting = false;
        ctrl.endPaintStroke();
        refreshPaintCanvas();
        this.updateHeightmapUI();
      };

      paintCanvas?.addEventListener('pointerdown', startPaint);
      paintCanvas?.addEventListener('pointermove', movePaint);
      paintCanvas?.addEventListener('pointerup', finishPaint);
      paintCanvas?.addEventListener('pointerleave', finishPaint);
      window.addEventListener('pointerup', finishPaint);

      const closeModalCancel = () => {
        if (this.heightmapPaintBackup) {
          ctrl.heightmapRgba.set(this.heightmapPaintBackup.heightmap);
          ctrl.mixmapRgba.set(this.heightmapPaintBackup.mixmap);
          ctrl.hasCustomMixMap = this.heightmapPaintBackup.hasCustomMixMap;
          ctrl.autoGenerateMixMap = !this.heightmapPaintBackup.hasCustomMixMap;
          this.heightmapPaintBackup = null;
        }
        modal.classList.remove('active');
        this.updateHeightmapUI();
      };

      this.app.getElement('btnCancelHeightmapPaint')?.addEventListener('click', closeModalCancel);
      this.app.getElement('btnCloseHeightmapPaintModal')?.addEventListener('click', closeModalCancel);

      // OK button: Commit painted heightmap/mixmap and immediately redraw the 3D terrain mesh
      this.app.getElement('btnConfirmHeightmapPaint')?.addEventListener('click', async () => {
        this.heightmapPaintBackup = null;
        modal.classList.remove('active');
        const dims = this.readHeightmapFormDimensions();
        const mesh = await ctrl.buildOrUpdateTerrainMesh(dims);
        this.updateHeightmapUI();
        this.app.showToast(`Redrawn 3D Heightmap Terrain "${mesh.name}" from painted maps.`, 'success');
      });
    }

    ctrl.onMapsChanged = () => {
      this.updateHeightmapUI();
    };
    ctrl.onTerrainUpdated = () => {
      this.updateHeightmapUI();
    };

    this.updateHeightmapUI();
  }

  private readHeightmapFormDimensions() {
    const widthEl = this.app.getElement<HTMLInputElement>('heightmapWidthNum');
    const heightEl = this.app.getElement<HTMLInputElement>('heightmapHeightNum');
    const subEl = this.app.getElement<HTMLInputElement>('heightmapSubdivisionsNum');
    const minEl = this.app.getElement<HTMLInputElement>('heightmapMinHeightNum');
    const maxEl = this.app.getElement<HTMLInputElement>('heightmapMaxHeightNum');
    const s1El = this.app.getElement<HTMLInputElement>('heightmapTex1ScaleNum');
    const s2El = this.app.getElement<HTMLInputElement>('heightmapTex2ScaleNum');
    const s3El = this.app.getElement<HTMLInputElement>('heightmapTex3ScaleNum');

    return {
      width: Math.max(1, parseFloat(widthEl?.value || '100') || 100),
      height: Math.max(1, parseFloat(heightEl?.value || '100') || 100),
      subdivisions: Math.max(2, Math.min(256, parseInt(subEl?.value || '100', 10) || 100)),
      minHeight: parseFloat(minEl?.value || '0') || 0,
      maxHeight: parseFloat(maxEl?.value || '10') || 10,
      textureScale: [
        parseFloat(s1El?.value || '10') || 10,
        parseFloat(s2El?.value || '10') || 10,
        parseFloat(s3El?.value || '10') || 10,
      ] as [number, number, number],
    };
  }

  public updateHeightmapUI(): void {
    const dialog = this.app.getElement('dialog-heightmap');
    if (!dialog) return;

    const ctrl = this.app.service.heightmapController;
    const sel = this.app.service.selectedMesh;
    if (sel && ctrl.isHeightmapMesh(sel) && sel !== this.lastSyncedHeightmapMesh) {
      this.lastSyncedHeightmapMesh = sel;
      ctrl.syncFromMesh(sel);
    }

    const activeTerrain = ctrl.getActiveTerrainMesh();
    const badge = this.app.getElement<HTMLElement>('heightmapSelectedBadge');
    if (badge) {
      if (activeTerrain) {
        badge.innerHTML = `Active Terrain: <strong>${this.app.escapeHtml(activeTerrain.name)}</strong> (${activeTerrain.getTotalVertices().toLocaleString()} verts)`;
      } else {
        badge.innerHTML =
          'Paint or upload a grayscale heightmap, configure 3 terrain textures, and build your 3D terrain mesh.';
      }
    }

    // Render 2D map previews
    this.renderRgbaToCanvas(ctrl.heightmapRgba, ctrl.mapSize, this.app.getElement<HTMLCanvasElement>('heightmapPreviewCanvas'));
    this.renderRgbaToCanvas(ctrl.mixmapRgba, ctrl.mapSize, this.app.getElement<HTMLCanvasElement>('mixmapPreviewCanvas'));

    // Populate 3 terrain texture selects & thumbnails
    const available = ctrl.getAvailableTextures();
    const slotDefs: Array<{ slot: 1 | 2 | 3; selectId: string; thumbId: string; scaleId: string; current: string; scaleVal: number }> = [
      {
        slot: 1,
        selectId: 'heightmapTex1Select',
        thumbId: 'heightmapTex1Thumb',
        scaleId: 'heightmapTex1ScaleNum',
        current: ctrl.config.terrainTextureName1,
        scaleVal: ctrl.config.terrainTextureScale.x,
      },
      {
        slot: 2,
        selectId: 'heightmapTex2Select',
        thumbId: 'heightmapTex2Thumb',
        scaleId: 'heightmapTex2ScaleNum',
        current: ctrl.config.terrainTextureName2,
        scaleVal: ctrl.config.terrainTextureScale.y,
      },
      {
        slot: 3,
        selectId: 'heightmapTex3Select',
        thumbId: 'heightmapTex3Thumb',
        scaleId: 'heightmapTex3ScaleNum',
        current: ctrl.config.terrainTextureName3,
        scaleVal: ctrl.config.terrainTextureScale.z,
      },
    ];

    for (const s of slotDefs) {
      const selectEl = this.app.getElement<HTMLSelectElement>(s.selectId);
      const resolved = ctrl.resolveTextureOption(s.current, s.slot === 1 ? 'rock' : s.slot === 2 ? 'grass' : 'sand');
      if (selectEl) {
        const currentOpts = Array.from(selectEl.options).map((o) => o.value);
        const targetOpts = available.map((t) => t.id);
        const needsRebuild =
          currentOpts.length !== targetOpts.length ||
          targetOpts.some((id, idx) => currentOpts[idx] !== id);
        if (needsRebuild) {
          selectEl.innerHTML = '';
          for (const opt of available) {
            const el = document.createElement('option');
            el.value = opt.id;
            el.textContent = opt.name;
            selectEl.appendChild(el);
          }
        }
        if (needsRebuild || document.activeElement !== selectEl) {
          selectEl.value = resolved.id;
        }
      }

      const thumbEl = this.app.getElement<HTMLElement>(s.thumbId);
      if (thumbEl) {
        thumbEl.style.backgroundImage = `url("${resolved.previewDataUrl || resolved.url}")`;
      }

      const scaleEl = this.app.getElement<HTMLInputElement>(s.scaleId);
      if (scaleEl && document.activeElement !== scaleEl) {
        scaleEl.value = String(s.scaleVal);
      }
    }

    // Sync dimension & elevation fields
    const widthEl = this.app.getElement<HTMLInputElement>('heightmapWidthNum');
    const heightEl = this.app.getElement<HTMLInputElement>('heightmapHeightNum');
    const subRange = this.app.getElement<HTMLInputElement>('heightmapSubdivisionsRange');
    const subNum = this.app.getElement<HTMLInputElement>('heightmapSubdivisionsNum');
    const minEl = this.app.getElement<HTMLInputElement>('heightmapMinHeightNum');
    const maxRange = this.app.getElement<HTMLInputElement>('heightmapMaxHeightRange');
    const maxNum = this.app.getElement<HTMLInputElement>('heightmapMaxHeightNum');

    if (widthEl && document.activeElement !== widthEl) widthEl.value = String(ctrl.config.width);
    if (heightEl && document.activeElement !== heightEl) heightEl.value = String(ctrl.config.height);
    if (subRange) subRange.value = String(ctrl.config.subdivisions);
    if (subNum && document.activeElement !== subNum) subNum.value = String(ctrl.config.subdivisions);
    if (minEl && document.activeElement !== minEl) minEl.value = String(ctrl.config.minHeight);
    if (maxRange) maxRange.value = String(ctrl.config.maxHeight);
    if (maxNum && document.activeElement !== maxNum) maxNum.value = String(ctrl.config.maxHeight);
  }
}
