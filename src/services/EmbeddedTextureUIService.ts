import type { MeshEditorService } from '../MeshEditorService';
import type { ActiveTextureSlotInfo } from '../types';
import type { MeshEditorAppHost } from './MeshEditorAppHost';

export class EmbeddedTextureUIService {
  private activeAtlasPickerId: string | null = null;

  constructor(private readonly app: MeshEditorAppHost) {}

  public initEmbeddedTexturesUI(): void {
    const btnAdd = this.app.getElement<HTMLButtonElement>('btnEmbedAddTexture');
    const btnLoadAtlas = this.app.getElement<HTMLButtonElement>('btnEmbedLoadAtlas');
    const fileInput = this.app.getElement<HTMLInputElement>('embedTextureFileInput');
    const atlasInput = this.app.getElement<HTMLInputElement>('embedAtlasFileInput');

    const handleAtlasFiles = async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      try {
        const atlas = await this.app.service.importAtlasFiles(files);
        this.renderEmbeddedTextures();
        this.app.renderVoxelAtlasOptions();
        this.app.renderVoxelPalette();
        this.app.renderVoxelTextureGallery();
        this.renderAtlasTilePicker(atlas.id);
        this.app.showToast(`Loaded atlas "${atlas.name}" (${atlas.frames.length} tiles)`, 'success');
      } catch (err: any) {
        this.app.showToast(`Failed to load atlas: ${err.message}`, 'error');
      }
    };

    btnAdd?.addEventListener('click', () => {
      fileInput?.click();
    });

    fileInput?.addEventListener('change', async () => {
      const files = fileInput.files;
      if (!files || files.length === 0) return;

      const fileList = Array.from(files);
      const hasDescriptor = fileList.some((f) => /\.(json|tps|xml)$/i.test(f.name));
      if (hasDescriptor || fileList.length > 1) {
        await handleAtlasFiles(files);
      } else {
        for (const file of fileList) {
          try {
            await this.app.service.addTextureFromFile(file);
            this.app.showToast(`Embedded texture "${file.name}"`, 'success');
          } catch (err: any) {
            this.app.showToast(`Failed to add texture: ${err.message}`, 'error');
          }
        }
        this.renderEmbeddedTextures();
      }
      fileInput.value = '';
    });

    btnLoadAtlas?.addEventListener('click', () => {
      atlasInput?.click();
    });

    atlasInput?.addEventListener('change', async () => {
      await handleAtlasFiles(atlasInput.files);
      atlasInput.value = '';
    });
  }

  public renderActiveMaterialTextures(): void {
    const list = this.app.getElement<HTMLElement>('activeMaterialTexturesList');
    const matBadge = this.app.getElement<HTMLElement>('activeMaterialNameBadge');
    if (!list) return;

    const info = this.app.service.getActiveMaterialTexturesInfo();
    if (matBadge) {
      matBadge.textContent = info.hasMaterial ? info.materialName : 'No material';
      matBadge.title = info.hasMaterial ? `${info.materialName} (${info.materialType})` : 'No material selected';
    }

    list.innerHTML = '';

    if (!info.hasMaterial) {
      const empty = document.createElement('div');
      empty.className = 'active-texture-empty';
      empty.textContent = 'Select a mesh to inspect active textures.';
      list.appendChild(empty);
      return;
    }

    const createSlotRow = (
      slotData: ActiveTextureSlotInfo | null,
      fallbackLabel: string,
      onRemove?: () => void
    ): HTMLElement => {
      const row = document.createElement('div');
      row.className = slotData ? 'active-texture-slot is-assigned' : 'active-texture-slot';

      const thumb = document.createElement('div');
      thumb.className = 'active-texture-thumb';
      if (slotData?.url) {
        const img = document.createElement('img');
        img.src = slotData.url;
        img.alt = slotData.name;
        img.onerror = () => {
          thumb.innerHTML = '<i class="app-icon" data-lucide="image"></i>';
        };
        thumb.appendChild(img);
      } else {
        thumb.innerHTML = `<i class="app-icon" data-lucide="${slotData ? 'image' : 'image-off'}"></i>`;
      }

      const details = document.createElement('div');
      details.className = 'active-texture-info';

      const topRow = document.createElement('div');
      topRow.className = 'active-texture-top';

      const rolePill = document.createElement('span');
      const roleClass =
        slotData?.slot === 'normal'
          ? ' role-normal'
          : slotData?.slot === 'emissive'
            ? ' role-emissive'
            : '';
      rolePill.className = `active-texture-role${roleClass}`;
      rolePill.textContent = slotData ? slotData.label : fallbackLabel;

      const nameEl = document.createElement('span');
      nameEl.className = slotData ? 'active-texture-name' : 'active-texture-name is-none';
      nameEl.textContent = slotData ? slotData.name : 'None';
      if (slotData) {
        nameEl.title = slotData.name;
      }

      topRow.appendChild(rolePill);
      topRow.appendChild(nameEl);

      const dimEl = document.createElement('div');
      dimEl.className = 'active-texture-dim';
      if (slotData) {
        dimEl.textContent =
          slotData.width > 0 && slotData.height > 0 ? `${slotData.width}x${slotData.height}px` : 'Active texture';
      } else {
        dimEl.textContent = 'No texture assigned';
      }

      details.appendChild(topRow);
      details.appendChild(dimEl);

      row.appendChild(thumb);
      row.appendChild(details);

      if (slotData) {
        const actions = document.createElement('div');
        actions.className = 'active-texture-actions';

        if (slotData.url) {
          const btnDownload = document.createElement('button');
          btnDownload.type = 'button';
          btnDownload.className = 'active-texture-btn';
          btnDownload.title = `Download "${slotData.name}"`;
          btnDownload.setAttribute('aria-label', `Download ${slotData.name}`);
          btnDownload.innerHTML = '<i class="app-icon" data-lucide="download"></i>';
          btnDownload.addEventListener('click', (e) => {
            e.stopPropagation();
            this.app.service.downloadEmbeddedTexture({
              name: slotData.name,
              url: slotData.url,
              isAtlas: false,
            });
          });
          actions.appendChild(btnDownload);
        }

        if (onRemove) {
          const btnRemove = document.createElement('button');
          btnRemove.type = 'button';
          btnRemove.className = 'active-texture-btn danger';
          btnRemove.title = `Remove ${slotData.label.toLowerCase()} texture from material`;
          btnRemove.setAttribute('aria-label', `Remove ${slotData.name}`);
          btnRemove.innerHTML = '<i class="app-icon" data-lucide="x"></i>';
          btnRemove.addEventListener('click', (e) => {
            e.stopPropagation();
            onRemove();
          });
          actions.appendChild(btnRemove);
        }

        row.appendChild(actions);
      }

      return row;
    };

    if (info.extra.length > 0 && !info.albedo) {
      for (const extraSlot of info.extra) {
        list.appendChild(createSlotRow(extraSlot, extraSlot.label));
      }
    } else {
      const primaryLabel = info.materialType === 'Standard' ? 'Diffuse' : 'Albedo';
      list.appendChild(
        createSlotRow(info.albedo, primaryLabel, () => {
          this.app.service.removeTextureFromSelectedMaterial();
          this.app.updateMaterialGUI();
        })
      );
    }

    if (info.bump) {
      list.appendChild(
        createSlotRow(info.bump, 'Normal', () => {
          this.app.service.removeBumpTextureFromSelectedMaterial();
          this.app.updateMaterialGUI();
        })
      );
    }

    if (info.emissive) {
      list.appendChild(createSlotRow(info.emissive, 'Emissive'));
    }

    if (info.metallic) {
      list.appendChild(createSlotRow(info.metallic, 'Metallic'));
    }

    this.app.refreshIcons();
  }

  private syncEmbeddedTextureCardState(card: HTMLElement, tex: ReturnType<MeshEditorService['getEmbeddedTexturesInfo']>[number], selMat: ReturnType<MeshEditorService['getSelectedMaterial']>): void {
    const { isAlbedo, isBump, isOther } = this.app.service.isTextureAssignedToMaterial(selMat, tex);
    card.classList.toggle('active', !!(isAlbedo || isBump || isOther));

    const badge = card.querySelector<HTMLElement>('.embedded-texture-badge');
    if (badge) {
      if (tex.isAtlas) {
        badge.style.display = '';
        badge.style.background = '';
        badge.style.color = '';
        badge.textContent = `Atlas (${tex.framesCount || 16})`;
        badge.title = `${tex.name} (${tex.framesCount || 16} tiles)`;
      } else if (isAlbedo && isBump) {
        badge.style.display = '';
        badge.style.background = 'rgba(35, 134, 54, 0.25)';
        badge.style.color = '#3fb950';
        badge.textContent = 'Albedo + Normal';
        badge.title = `Active on selected material${tex.materialNames.length ? ` (${tex.materialNames.join(', ')})` : ''}`;
      } else if (isAlbedo) {
        badge.style.display = '';
        badge.style.background = 'rgba(35, 134, 54, 0.25)';
        badge.style.color = '#3fb950';
        badge.textContent = 'Active Albedo';
        badge.title = `Active Albedo on selected material${tex.materialNames.length ? ` (${tex.materialNames.join(', ')})` : ''}`;
      } else if (isBump) {
        badge.style.display = '';
        badge.style.background = 'rgba(163, 113, 247, 0.25)';
        badge.style.color = '#d2a8ff';
        badge.textContent = 'Active Normal';
        badge.title = `Active Normal/Bump on selected material${tex.materialNames.length ? ` (${tex.materialNames.join(', ')})` : ''}`;
      } else if (isOther) {
        badge.style.display = '';
        badge.style.background = 'rgba(56, 139, 253, 0.2)';
        badge.style.color = '#58a6ff';
        badge.textContent = 'Active Map';
        badge.title = `Active on selected material`;
      } else if (tex.materialsCount > 0) {
        badge.style.display = '';
        badge.style.background = 'rgba(56, 139, 253, 0.15)';
        badge.style.color = '#58a6ff';
        badge.textContent = `${tex.materialsCount} ${tex.materialsCount === 1 ? 'material' : 'materials'}`;
        badge.title = `In use by: ${tex.materialNames.join(', ')}`;
      } else {
        badge.style.display = 'none';
        badge.textContent = '';
        badge.title = '';
      }
    }

    const btnApply = card.querySelector<HTMLButtonElement>('.embedded-texture-btn-apply');
    if (btnApply) {
      btnApply.className = isAlbedo
        ? 'tool-btn-xs tool-btn-primary embedded-texture-btn-apply active'
        : 'tool-btn-xs tool-btn-primary embedded-texture-btn-apply';
      btnApply.title = isAlbedo
        ? 'Currently applied to selected material (click to re-apply)'
        : 'Apply texture to selected mesh material';
      btnApply.innerHTML = isAlbedo
        ? '<i class="app-icon" data-lucide="check"></i> Applied'
        : '<i class="app-icon" data-lucide="check"></i> Apply';
    }

    const btnBump = card.querySelector<HTMLButtonElement>('.embedded-texture-btn-bump');
    if (btnBump) {
      btnBump.className = isBump
        ? 'tool-btn-xs embedded-texture-btn-bump active'
        : 'tool-btn-xs embedded-texture-btn-bump';
      btnBump.title = isBump
        ? 'Active as Normal / Bump Map'
        : 'Apply as Normal / Bump Map to selected mesh material';
      btnBump.innerHTML = isBump
        ? '<i class="app-icon" data-lucide="layers"></i> Active'
        : '<i class="app-icon" data-lucide="layers"></i> Normal';
    }
  }

  public renderEmbeddedTextures(): void {
    const gallery = this.app.getElement<HTMLElement>('embeddedTexturesGallery');
    const countBadge = this.app.getElement<HTMLElement>('embeddedTexturesCount');
    if (!gallery) return;

    const textures = this.app.service.getEmbeddedTexturesInfo();
    if (countBadge) {
      countBadge.textContent = textures.length.toString();
    }

    const selMat = this.app.service.getSelectedMaterial();
    const currentCards = gallery.querySelectorAll<HTMLElement>('.embedded-texture-card');
    if (currentCards.length === textures.length && currentCards.length > 0) {
      let matches = true;
      for (let i = 0; i < textures.length; i++) {
        if (
          currentCards[i].getAttribute('data-url') !== textures[i].url ||
          currentCards[i].getAttribute('data-name') !== textures[i].name ||
          currentCards[i].getAttribute('data-atlas') !== String(!!textures[i].isAtlas)
        ) {
          matches = false;
          break;
        }
      }
      if (matches) {
        for (let i = 0; i < textures.length; i++) {
          this.syncEmbeddedTextureCardState(currentCards[i], textures[i], selMat);
        }
        this.app.refreshIcons();
        return;
      }
    }

    gallery.innerHTML = '';
    if (textures.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'textures-empty-state';
      empty.textContent = 'No custom textures embedded yet.';
      gallery.appendChild(empty);
      this.app.renderVoxelTextureGallery();
      return;
    }

    for (const tex of textures) {
      if (!tex.url) continue;
      const card = document.createElement('div');
      card.className = 'embedded-texture-card';
      card.setAttribute('data-url', tex.url);
      card.setAttribute('data-id', tex.id);
      card.setAttribute('data-name', tex.name);
      card.setAttribute('data-atlas', String(!!tex.isAtlas));
      if (tex.isAtlas) {
        card.classList.add('is-atlas');
      }

      const thumbWrapper = document.createElement('div');
      thumbWrapper.className = 'embedded-texture-thumb';

      const img = document.createElement('img');
      img.src = tex.url;
      img.alt = tex.name;
      img.style.imageRendering = tex.isAtlas ? 'pixelated' : 'auto';
      img.onerror = () => {
        card.style.display = 'none';
      };
      thumbWrapper.appendChild(img);

      const info = document.createElement('div');
      info.className = 'embedded-texture-info';

      const nameRow = document.createElement('div');
      nameRow.className = 'embedded-texture-name';
      nameRow.textContent = tex.name;
      nameRow.title = tex.name;

      const metaRow = document.createElement('div');
      metaRow.className = 'embedded-texture-meta';
      const dimSpan = document.createElement('span');
      dimSpan.textContent = `${tex.width}x${tex.height}px`;
      metaRow.appendChild(dimSpan);

      const badge = document.createElement('span');
      badge.className = 'embedded-texture-badge';
      badge.style.display = 'none';
      metaRow.appendChild(badge);

      info.appendChild(nameRow);
      info.appendChild(metaRow);

      const actions = document.createElement('div');
      actions.className = 'embedded-texture-actions';

      if (tex.isAtlas && tex.atlasId) {
        const atlas = this.app.service.textureAtlasManager.getAtlas(tex.atlasId);
        const tileCount = atlas ? atlas.frames.length : tex.framesCount || 16;

        const btnTiles = document.createElement('button');
        btnTiles.type = 'button';
        btnTiles.className = 'tool-btn-xs tool-btn-primary';
        btnTiles.title = `Browse and pick individual tiles from this atlas (${tileCount} tiles)`;
        btnTiles.innerHTML = `<i class="app-icon" data-lucide="grid-3x3"></i> Tiles (${tileCount})`;
        btnTiles.addEventListener('click', (e) => {
          e.stopPropagation();
          this.renderAtlasTilePicker(tex.atlasId!);
        });
        actions.appendChild(btnTiles);

        const btnApplyAll = document.createElement('button');
        btnApplyAll.type = 'button';
        btnApplyAll.className = 'tool-btn-xs';
        btnApplyAll.title = 'Apply entire atlas texture to material';
        btnApplyAll.innerHTML = '<i class="app-icon" data-lucide="check"></i> Apply';
        btnApplyAll.addEventListener('click', (e) => {
          e.stopPropagation();
          this.app.service.applyTextureToSelectedMaterial(tex.url, tex.name);
          this.app.updateMaterialGUI();
        });
        actions.appendChild(btnApplyAll);

        card.addEventListener('click', () => {
          this.renderAtlasTilePicker(tex.atlasId!);
        });
      } else {
        const btnApply = document.createElement('button');
        btnApply.type = 'button';
        btnApply.className = 'tool-btn-xs tool-btn-primary embedded-texture-btn-apply';
        btnApply.addEventListener('click', (e) => {
          e.stopPropagation();
          this.app.service.applyTextureToSelectedMaterial(tex.url, tex.name);
          this.app.updateMaterialGUI();
        });
        actions.appendChild(btnApply);

        const btnBump = document.createElement('button');
        btnBump.type = 'button';
        btnBump.className = 'tool-btn-xs embedded-texture-btn-bump';
        btnBump.addEventListener('click', (e) => {
          e.stopPropagation();
          this.app.service.applyBumpTextureToSelectedMaterial(tex.url, tex.name);
          this.app.updateMaterialGUI();
        });
        actions.appendChild(btnBump);

        card.addEventListener('click', () => {
          this.app.service.applyTextureToSelectedMaterial(tex.url, tex.name);
          this.app.updateMaterialGUI();
        });
      }

      const utilRow = document.createElement('div');
      utilRow.className = 'embedded-texture-util-actions';

      const btnDownload = document.createElement('button');
      btnDownload.type = 'button';
      btnDownload.className = 'tool-btn-xs embedded-texture-btn-download';
      btnDownload.title = tex.isAtlas ? `Download atlas "${tex.name}"` : `Download texture "${tex.name}"`;
      btnDownload.setAttribute('aria-label', `Download ${tex.name}`);
      btnDownload.innerHTML = '<i class="app-icon" data-lucide="download"></i> Save';
      btnDownload.addEventListener('click', (e) => {
        e.stopPropagation();
        this.app.service.downloadEmbeddedTexture(tex);
      });
      utilRow.appendChild(btnDownload);

      const btnDelete = document.createElement('button');
      btnDelete.type = 'button';
      btnDelete.className = 'tool-btn-xs embedded-texture-btn-delete';
      btnDelete.title = tex.isAtlas
        ? `Delete atlas "${tex.name}" from scene`
        : `Delete texture "${tex.name}" from scene`;
      btnDelete.setAttribute('aria-label', `Delete ${tex.name}`);
      btnDelete.innerHTML = '<i class="app-icon" data-lucide="trash-2"></i> Delete';
      btnDelete.addEventListener('click', (e) => {
        e.stopPropagation();
        const wasPickerOpenForAtlas = Boolean(
          tex.isAtlas && tex.atlasId && this.activeAtlasPickerId === tex.atlasId
        );
        const deleted = this.app.service.deleteEmbeddedTexture(tex);
        if (deleted) {
          if (wasPickerOpenForAtlas) {
            const pickerSection = this.app.getElement<HTMLElement>('atlasTilePickerSection');
            if (pickerSection) pickerSection.style.display = 'none';
            this.activeAtlasPickerId = null;
          }
          this.app.updateMaterialGUI();
          this.app.renderVoxelAtlasOptions();
          this.app.renderVoxelPalette();
        }
      });
      utilRow.appendChild(btnDelete);
      actions.appendChild(utilRow);

      card.appendChild(thumbWrapper);
      card.appendChild(info);
      card.appendChild(actions);

      this.syncEmbeddedTextureCardState(card, tex, selMat);
      gallery.appendChild(card);
    }

    this.app.refreshIcons();
    this.app.renderVoxelTextureGallery();
  }

  public renderAtlasTilePicker(atlasId: string): void {
    const section = this.app.getElement<HTMLElement>('atlasTilePickerSection');
    const title = this.app.getElement<HTMLElement>('atlasTilePickerTitle');
    const grid = this.app.getElement<HTMLElement>('atlasTilePickerGrid');
    const closeBtn = this.app.getElement<HTMLButtonElement>('btnCloseAtlasTilePicker');
    const selectedBar = this.app.getElement<HTMLElement>('atlasTileSelectedBar');
    const selectedPrev = this.app.getElement<HTMLElement>('atlasTileSelectedPreview');
    const selectedName = this.app.getElement<HTMLElement>('atlasTileSelectedName');
    const selectedDim = this.app.getElement<HTMLElement>('atlasTileSelectedDim');
    const btnApply = this.app.getElement<HTMLButtonElement>('btnApplyAtlasTileToMaterial');
    const btnVoxel = this.app.getElement<HTMLButtonElement>('btnUseAtlasTileInVoxel');
    if (!section || !grid) return;

    const atlas = this.app.service.textureAtlasManager.getAtlas(atlasId);
    if (!atlas) return;

    this.activeAtlasPickerId = atlasId;
    section.style.display = 'flex';
    if (title) {
      title.innerHTML = `<i class="app-icon" data-lucide="grid-3x3"></i> ${atlas.name} (${atlas.frames.length} tiles)`;
    }

    grid.innerHTML = '';
    if (closeBtn) {
      closeBtn.onclick = () => {
        section.style.display = 'none';
        this.activeAtlasPickerId = null;
      };
    }

    let activeFrameId: string | null = atlas.frames[0]?.id || null;

    const updateSelectedBar = (frame: any) => {
      if (!frame || !selectedBar) return;
      activeFrameId = frame.id;
      selectedBar.style.display = 'flex';

      const thumb =
        frame.thumbnailDataUrl ||
        this.app.service.textureAtlasManager.extractFrameDataUrl(atlas.id, frame.id) ||
        atlas.dataUrl;
      if (selectedPrev && thumb) {
        selectedPrev.style.backgroundImage = `url("${thumb}")`;
      }
      if (selectedName) {
        selectedName.textContent = frame.name;
      }
      if (selectedDim) {
        const dim = frame.pixelRect
          ? `${frame.pixelRect.w}x${frame.pixelRect.h}px`
          : `${atlas.tileSize}x${atlas.tileSize}px`;
        selectedDim.textContent = dim;
      }
    };

    for (const frame of atlas.frames) {
      const swatch = document.createElement('div');
      swatch.className = 'atlas-tile-picker-swatch';
      const dim = frame.pixelRect ? `${frame.pixelRect.w}x${frame.pixelRect.h}px` : `${atlas.tileSize}px`;
      swatch.title = `${frame.name} (${dim}) - Click to select, double-click to apply`;

      const thumb =
        frame.thumbnailDataUrl ||
        this.app.service.textureAtlasManager.extractFrameDataUrl(atlas.id, frame.id) ||
        atlas.dataUrl;
      if (thumb) {
        swatch.style.backgroundImage = `url("${thumb}")`;
      }

      if (frame.id === activeFrameId) {
        swatch.classList.add('active');
        updateSelectedBar(frame);
      }

      swatch.addEventListener('click', () => {
        grid.querySelectorAll('.atlas-tile-picker-swatch').forEach((s) => s.classList.remove('active'));
        swatch.classList.add('active');
        updateSelectedBar(frame);
      });

      swatch.addEventListener('dblclick', () => {
        this.app.service.applyAtlasFrameToSelectedMaterial(atlas.id, frame.id);
        this.app.updateMaterialGUI();
      });

      grid.appendChild(swatch);
    }

    if (btnApply) {
      btnApply.onclick = () => {
        if (!activeFrameId) return;
        this.app.service.applyAtlasFrameToSelectedMaterial(atlas.id, activeFrameId);
        this.app.updateMaterialGUI();
      };
    }

    if (btnVoxel) {
      btnVoxel.onclick = () => {
        if (!activeFrameId) return;
        this.app.service.useAtlasFrameInVoxelPainter(atlas.id, activeFrameId);
        this.app.toggleDialog('dialog-voxel-painter', true);
        this.app.renderVoxelAtlasOptions();
        this.app.renderVoxelPalette();
      };
    }

    this.app.refreshIcons();
  }
}
