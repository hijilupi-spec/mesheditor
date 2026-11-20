import type { MeshEditorAppHost } from '../services/MeshEditorAppHost';

export class VoxelPainterUIService {
  constructor(private readonly app: MeshEditorAppHost) {}

  public initVoxelPainterUI(): void {
    const btnPaint = this.app.getElement<HTMLButtonElement>('btnVoxelModePaint');
    const btnErase = this.app.getElement<HTMLButtonElement>('btnVoxelModeErase');
    const btnPick = this.app.getElement<HTMLButtonElement>('btnVoxelModePick');
    const sizeInput = this.app.getElement<HTMLInputElement>('voxelSizeInput');
    const intervalInput = this.app.getElement<HTMLInputElement>('voxelIntervalInput');
    const atlasSelect = this.app.getElement<HTMLSelectElement>('voxelAtlasSelect');
    const btnLoadAtlas = this.app.getElement<HTMLButtonElement>('btnVoxelLoadAtlas');
    const atlasFileInput = this.app.getElement<HTMLInputElement>('voxelAtlasFileInput');
    const btnBake = this.app.getElement<HTMLButtonElement>('btnVoxelBake');
    const btnClear = this.app.getElement<HTMLButtonElement>('btnVoxelClear');
    const btnImport = this.app.getElement<HTMLButtonElement>('btnVoxelImportJson');
    const btnExport = this.app.getElement<HTMLButtonElement>('btnVoxelExportJson');
    const jsonFileInput = this.app.getElement<HTMLInputElement>('voxelJsonFileInput');
    const countBadge = this.app.getElement<HTMLElement>('voxelBlocksCount');

    const updateModeButtons = (mode: 'paint' | 'erase' | 'pick') => {
      btnPaint?.classList.toggle('active', mode === 'paint');
      btnErase?.classList.toggle('active', mode === 'erase');
      btnPick?.classList.toggle('active', mode === 'pick');
    };

    btnPaint?.addEventListener('click', () => {
      this.app.activateExclusive3DTool('voxel_painter');
      this.app.service.voxelPainter.setMode('paint');
      updateModeButtons('paint');
      this.app.updatePanelButtonStates();
    });
    btnErase?.addEventListener('click', () => {
      this.app.activateExclusive3DTool('voxel_painter');
      this.app.service.voxelPainter.setMode('erase');
      updateModeButtons('erase');
      this.app.updatePanelButtonStates();
    });
    btnPick?.addEventListener('click', () => {
      this.app.activateExclusive3DTool('voxel_painter');
      this.app.service.voxelPainter.setMode('pick');
      updateModeButtons('pick');
      this.app.updatePanelButtonStates();
    });

    sizeInput?.addEventListener('input', () => {
      const val = parseFloat(sizeInput.value);
      if (!isNaN(val) && val > 0) {
        this.app.service.voxelPainter.setVoxelSize(val);
      }
    });

    intervalInput?.addEventListener('input', () => {
      const val = parseInt(intervalInput.value, 10);
      if (!isNaN(val) && val >= 50) {
        this.app.service.voxelPainter.paintIntervalMs = val;
      }
    });

    atlasSelect?.addEventListener('change', () => {
      const atlasId = atlasSelect.value;
      if (atlasId) {
        this.app.service.voxelPainter.useTextureAtlas(atlasId);
        this.renderVoxelPalette();
        this.renderVoxelTextureGallery();
      }
    });

    const handleAtlasFiles = async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      try {
        const atlas = await this.app.service.importAtlasFiles(files);
        this.renderVoxelAtlasOptions();
        this.app.service.voxelPainter.useTextureAtlas(atlas.id);
        this.renderVoxelPalette();
        this.renderVoxelTextureGallery();
        this.app.renderEmbeddedTextures();
        this.app.showToast(`Loaded atlas "${atlas.name}" (${atlas.frames.length} tiles)`, 'success');
      } catch (err: any) {
        this.app.showToast(`Failed to load atlas: ${err.message}`, 'error');
      }
    };

    btnLoadAtlas?.addEventListener('click', () => {
      atlasFileInput?.click();
    });

    atlasFileInput?.addEventListener('change', async () => {
      await handleAtlasFiles(atlasFileInput.files);
      atlasFileInput.value = '';
    });

    const btnAddTex = this.app.getElement<HTMLButtonElement>('btnVoxelAddTexture');
    const texFileInput = this.app.getElement<HTMLInputElement>('voxelTextureFileInput');

    btnAddTex?.addEventListener('click', () => {
      texFileInput?.click();
    });

    texFileInput?.addEventListener('change', async () => {
      const files = texFileInput.files;
      if (!files || files.length === 0) return;

      const fileList = Array.from(files);
      const hasDescriptor = fileList.some((f) => /\.(json|tps|xml)$/i.test(f.name));
      if (hasDescriptor || fileList.length > 1) {
        await handleAtlasFiles(files);
      } else {
        const file = fileList[0];
        try {
          const tex = await this.app.service.addTextureFromFile(file);
          const url = (tex as any).url || (tex as any)._buffer || '';
          const name = file.name.replace(/\.[^/.]+$/, '');
          this.app.service.voxelPainter.addTexturePaletteItem(name, url, tex);
          this.renderVoxelPalette();
          this.renderVoxelTextureGallery();
          this.app.renderEmbeddedTextures();
          this.app.showToast(`Added texture "${name}" to voxel palette`, 'success');
        } catch (err: any) {
          this.app.showToast(`Failed to load texture: ${err.message}`, 'error');
        }
      }
      texFileInput.value = '';
    });

    btnBake?.addEventListener('click', () => {
      const mesh = this.app.service.voxelPainter.bakeToMesh();
      if (mesh) {
        this.app.showToast(`Baked voxel mesh with ${this.app.service.voxelPainter.blocks.size} blocks`, 'success');
        this.app.updateOutliner();
        this.app.updateMeshGUI();
      } else {
        this.app.showToast('No voxel blocks to bake', 'warning');
      }
    });

    btnClear?.addEventListener('click', () => {
      this.app.service.voxelPainter.clear();
      this.app.showToast('Voxel blocks cleared', 'info');
    });

    btnImport?.addEventListener('click', () => {
      jsonFileInput?.click();
    });

    jsonFileInput?.addEventListener('change', async () => {
      const file = jsonFileInput.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        this.app.service.voxelPainter.loadVoxelData(data);
        this.renderVoxelPalette();
        this.app.showToast(`Imported ${this.app.service.voxelPainter.blocks.size} voxel blocks`, 'success');
      } catch (err: any) {
        this.app.showToast(`Failed to import voxels: ${err.message}`, 'error');
      } finally {
        jsonFileInput.value = '';
      }
    });

    btnExport?.addEventListener('click', async () => {
      const data = this.app.service.voxelPainter.exportVoxelData();
      const jsonStr = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const filename = 'voxels.json';

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      this.app.showToast('Exported voxel data to JSON', 'info');
    });

    this.app.service.voxelPainter.onBlocksChanged = (count) => {
      if (countBadge) {
        countBadge.textContent = `${count} Block${count === 1 ? '' : 's'}`;
      }
    };

    this.app.service.voxelPainter.onPaletteChanged = () => {
      this.renderVoxelPalette();
      this.renderVoxelTextureGallery();
    };

    this.app.service.voxelPainter.onAtlasChanged = () => {
      this.renderVoxelAtlasOptions();
      this.renderVoxelTextureGallery();
    };

    this.app.service.voxelPainter.onModeChanged = (mode) => {
      updateModeButtons(mode);
    };

    this.renderVoxelAtlasOptions();
    this.renderVoxelPalette();
    this.renderVoxelTextureGallery();
  }

  public renderVoxelAtlasOptions(): void {
    const select = this.app.getElement<HTMLSelectElement>('voxelAtlasSelect');
    if (!select) return;

    const atlases = this.app.service.textureAtlasManager.getAtlases();
    const currentAtlas = this.app.service.voxelPainter.currentAtlas;
    const currentId = currentAtlas ? currentAtlas.id : '';

    select.innerHTML = '';
    for (const atlas of atlases) {
      const opt = document.createElement('option');
      opt.value = atlas.id;
      opt.textContent = `${atlas.name} (${atlas.frames.length} tiles)`;
      if (atlas.id === currentId) {
        opt.selected = true;
      }
      select.appendChild(opt);
    }
  }

  public renderVoxelPalette(): void {
    const grid = this.app.getElement<HTMLElement>('voxelPaletteGrid');
    const selectedLabel = this.app.getElement<HTMLElement>('voxelSelectedMaterialName');
    const activeThumb = this.app.getElement<HTMLElement>('voxelActiveThumb');
    const activeTitle = this.app.getElement<HTMLElement>('voxelActiveTitle');
    const activeType = this.app.getElement<HTMLElement>('voxelActiveType');
    if (!grid) return;

    grid.innerHTML = '';
    const palette = this.app.service.voxelPainter.getActivePaletteItems();
    const currentId = this.app.service.voxelPainter.currentPaletteId;

    const activeItem = palette.find((p) => p.id === currentId) || palette[0];
    const updateActivePreview = (item: any) => {
      if (!item) return;
      if (selectedLabel) selectedLabel.textContent = item.name;
      if (activeTitle) activeTitle.textContent = item.name;
      if (activeType) {
        activeType.textContent = item.atlasTile
          ? 'Atlas Tile'
          : item.textureUrl || item.texture
            ? 'Texture Image'
            : 'Solid Color';
      }
      if (activeThumb) {
        const thumb =
          item.atlasTile?.thumbnailDataUrl ||
          (item.atlasTile && item.atlasId
            ? this.app.service.textureAtlasManager.extractFrameDataUrl(item.atlasId, item.atlasTile.id)
            : null) ||
          item.textureUrl;
        if (thumb) {
          activeThumb.style.backgroundImage = `url("${thumb}")`;
          activeThumb.style.backgroundColor = 'transparent';
        } else if (item.color) {
          activeThumb.style.backgroundImage = 'none';
          activeThumb.style.backgroundColor = item.color;
        }
      }
    };

    if (activeItem) {
      updateActivePreview(activeItem);
    }

    for (const item of palette) {
      const swatch = document.createElement('div');
      swatch.className = 'voxel-palette-swatch';
      const dim = item.atlasTile?.pixelRect ? ` (${item.atlasTile.pixelRect.w}x${item.atlasTile.pixelRect.h}px)` : '';
      swatch.title = `${item.name}${dim}`;
      if (item.id === currentId) {
        swatch.classList.add('active');
      }

      const thumb =
        item.atlasTile?.thumbnailDataUrl ||
        (item.atlasTile && item.atlasId
          ? this.app.service.textureAtlasManager.extractFrameDataUrl(item.atlasId, item.atlasTile.id)
          : null) ||
        item.textureUrl;
      if (thumb) {
        swatch.style.backgroundImage = `url("${thumb}")`;
        swatch.style.backgroundSize = 'cover';
        swatch.style.imageRendering = 'pixelated';
      } else if (item.color) {
        swatch.style.backgroundColor = item.color;
      }

      swatch.addEventListener('click', () => {
        this.app.service.voxelPainter.currentPaletteId = item.id;
        grid.querySelectorAll('.voxel-palette-swatch').forEach((s) => s.classList.remove('active'));
        swatch.classList.add('active');
        updateActivePreview(item);
        this.renderVoxelTextureGallery();
      });

      grid.appendChild(swatch);
    }
  }

  public renderVoxelTextureGallery(): void {
    const gallery = this.app.getElement<HTMLElement>('voxelTextureGallery');
    if (!gallery) return;

    gallery.innerHTML = '';
    const atlases = this.app.service.textureAtlasManager.getAtlases();
    const currentAtlasId = this.app.service.voxelPainter.currentAtlasId;
    const currentPaletteId = this.app.service.voxelPainter.currentPaletteId;
    const embeddedTextures = this.app.service.getEmbeddedTexturesInfo();

    // 1. Atlas cards
    for (const atlas of atlases) {
      const card = document.createElement('div');
      card.className = 'voxel-texture-card';
      if (atlas.id === currentAtlasId) {
        card.classList.add('active');
      }
      card.title = `Atlas: ${atlas.name} (${atlas.frames.length} tiles) - Click to load`;

      const img = document.createElement('img');
      img.className = 'voxel-texture-card-thumb';
      img.src = atlas.frames[0]?.thumbnailDataUrl || atlas.dataUrl || '';
      img.alt = atlas.name;
      img.onerror = () => {
        card.style.display = 'none';
      };

      const name = document.createElement('div');
      name.className = 'voxel-texture-card-name';
      name.textContent = atlas.name;

      card.appendChild(img);
      card.appendChild(name);

      card.addEventListener('click', () => {
        this.app.service.voxelPainter.useTextureAtlas(atlas.id);
        this.renderVoxelAtlasOptions();
        this.renderVoxelPalette();
        this.renderVoxelTextureGallery();
      });

      gallery.appendChild(card);
    }

    // 2. Individual embedded textures
    for (const tex of embeddedTextures) {
      if (tex.isAtlas) continue;
      if (!tex.url) continue;

      const card = document.createElement('div');
      card.className = 'voxel-texture-card';
      const activeItem = this.app.service.voxelPainter.palette.get(currentPaletteId);
      if (activeItem?.textureUrl === tex.url) {
        card.classList.add('active');
      }
      card.title = `Texture: ${tex.name} (${tex.width}x${tex.height}px) - Click to paint with this`;

      const img = document.createElement('img');
      img.className = 'voxel-texture-card-thumb';
      img.src = tex.url;
      img.alt = tex.name;
      img.onerror = () => {
        card.style.display = 'none';
      };

      const name = document.createElement('div');
      name.className = 'voxel-texture-card-name';
      name.textContent = tex.name;

      card.appendChild(img);
      card.appendChild(name);

      card.addEventListener('click', () => {
        this.app.service.voxelPainter.addTexturePaletteItem(tex.name, tex.url);
        this.renderVoxelPalette();
        this.renderVoxelTextureGallery();
      });

      gallery.appendChild(card);
    }
  }
}
