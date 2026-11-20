import type { MeshEditorAppHost } from '../services/MeshEditorAppHost';

export class DecalUIService {
  constructor(private readonly app: MeshEditorAppHost) {}

  public initDecalUI(): void {
    const dialog = this.app.getElement('dialog-decal');
    if (!dialog || (dialog as any)._decalInitialized) return;
    (dialog as any)._decalInitialized = true;

    const btnToggleMode = this.app.getElement<HTMLButtonElement>('btnToggleDecalPaintMode');
    const btnModeStamp = this.app.getElement<HTMLButtonElement>('btnDecalModeStamp');
    const btnModeErase = this.app.getElement<HTMLButtonElement>('btnDecalModeErase');
    const texSelect = this.app.getElement<HTMLSelectElement>('decalTextureSelect');
    const btnUpload = this.app.getElement<HTMLButtonElement>('btnUploadDecalImage');
    const fileInput = this.app.getElement<HTMLInputElement>('decalImageFileInput');
    const sizeRange = this.app.getElement<HTMLInputElement>('decalSizeRange');
    const sizeNum = this.app.getElement<HTMLInputElement>('decalSizeNum');
    const angleRange = this.app.getElement<HTMLInputElement>('decalAngleRange');
    const angleNum = this.app.getElement<HTMLInputElement>('decalAngleNum');
    const opacityRange = this.app.getElement<HTMLInputElement>('decalOpacityRange');
    const opacityVal = this.app.getElement<HTMLElement>('decalOpacityVal');
    const tintPicker = this.app.getElement<HTMLInputElement>('decalTintColorPicker');
    const cullCheck = this.app.getElement<HTMLInputElement>('decalCullBackFacesCheck');
    const faceSelect = this.app.getElement<HTMLSelectElement>('decalFaceSelect');

    btnToggleMode?.addEventListener('click', () => {
      const next = !this.app.service.decalController.isActive;
      if (next) {
        this.app.activateExclusive3DTool('decal_painter');
      } else {
        this.app.service.decalController.setActive(false);
      }
      this.updateDecalUI();
      this.app.updatePanelButtonStates();
    });

    btnModeStamp?.addEventListener('click', () => {
      this.app.service.decalController.interactionMode = 'stamp';
      this.updateDecalUI();
    });

    btnModeErase?.addEventListener('click', () => {
      this.app.service.decalController.interactionMode = 'erase';
      this.updateDecalUI();
    });

    texSelect?.addEventListener('change', () => {
      const opt = this.app.service.decalController
        .getAvailableTextures()
        .find((t) => t.url === texSelect.value || t.id === texSelect.value);
      if (opt) {
        this.app.service.decalController.setTexture(opt.url, opt.name);
        this.updateDecalUI();
      }
    });

    btnUpload?.addEventListener('click', () => fileInput?.click());
    fileInput?.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      try {
        const tex = await this.app.service.addTextureFromFile(file);
        if (tex.url) {
          this.app.service.decalController.setTexture(tex.url, file.name);
          this.updateDecalUI();
        }
      } catch (err: any) {
        this.app.showToast(err?.message || 'Failed to load decal image.', 'error');
      }
      fileInput.value = '';
    });

    sizeRange?.addEventListener('input', () => {
      const v = parseFloat(sizeRange.value) || 0.6;
      if (sizeNum) sizeNum.value = String(v);
      this.app.service.decalController.setUniformSize(v);
    });
    sizeNum?.addEventListener('change', () => {
      const v = parseFloat(sizeNum.value) || 0.6;
      if (sizeRange) sizeRange.value = String(v);
      this.app.service.decalController.setUniformSize(v);
    });

    angleRange?.addEventListener('input', () => {
      const deg = parseFloat(angleRange.value) || 0;
      if (angleNum) angleNum.value = String(deg);
      this.app.service.decalController.setAngleDegrees(deg);
    });
    angleNum?.addEventListener('change', () => {
      const deg = parseFloat(angleNum.value) || 0;
      if (angleRange) angleRange.value = String(deg);
      this.app.service.decalController.setAngleDegrees(deg);
    });

    opacityRange?.addEventListener('input', () => {
      const v = parseFloat(opacityRange.value) || 1.0;
      this.app.service.decalController.config.opacity = v;
      if (opacityVal) opacityVal.textContent = `${Math.round(v * 100)}%`;
    });

    tintPicker?.addEventListener('input', () => {
      this.app.service.decalController.config.tintColor = tintPicker.value;
    });

    cullCheck?.addEventListener('change', () => {
      this.app.service.decalController.config.cullBackFaces = cullCheck.checked;
    });

    this.app.getElement('btnPlaceDecalOnSelected')?.addEventListener('click', () => {
      try {
        const face = (faceSelect?.value || 'front') as any;
        const decal = this.app.service.decalController.placeDecal({ face });
        this.app.showToast(`Stamped decal "${this.app.service.decalController.config.textureName}" (${decal.name})`, 'success');
        this.updateDecalUI();
      } catch (err: any) {
        this.app.showToast(err?.message || 'Select a target mesh first.', 'warning');
      }
    });

    this.app.getElement('btnMergeDecalsIntoMesh')?.addEventListener('click', () => {
      const unmerged = this.app.service.decalController.getUnmergedDecals();
      if (unmerged.length === 0) {
        this.app.showToast('No unmerged decals in scene to merge.', 'info');
        return;
      }
      const res = this.app.service.decalController.mergeAllDecalsIntoMeshes();
      this.app.showToast(
        `Merged ${res.mergedDecalCount} decal(s) into ${res.affectedMeshes.join(', ')}!`,
        'success',
      );
      this.updateDecalUI();
    });

    this.app.getElement('btnClearUnmergedDecals')?.addEventListener('click', () => {
      const removed = this.app.service.decalController.clearUnmergedDecals();
      if (removed > 0) {
        this.app.showToast(`Removed ${removed} unmerged decal(s).`, 'info');
      } else {
        this.app.showToast('No unmerged decals to remove.', 'info');
      }
      this.updateDecalUI();
    });

    this.app.service.decalController.onDecalsChanged = () => {
      this.updateDecalUI();
    };
    this.app.service.decalController.onConfigChanged = () => {
      this.updateDecalUI();
      this.app.updatePanelButtonStates();
    };

    this.updateDecalUI();
  }

  public updateDecalUI(): void {
    const dialog = this.app.getElement('dialog-decal');
    if (!dialog) return;

    const ctrl = this.app.service.decalController;
    const btnToggleMode = this.app.getElement<HTMLButtonElement>('btnToggleDecalPaintMode');
    const btnModeStamp = this.app.getElement<HTMLButtonElement>('btnDecalModeStamp');
    const btnModeErase = this.app.getElement<HTMLButtonElement>('btnDecalModeErase');
    const modeLabel = this.app.getElement<HTMLElement>('decalPaintModeLabel');
    if (btnToggleMode && modeLabel) {
      if (ctrl.isActive) {
        btnToggleMode.classList.add('tool-btn-primary');
        btnToggleMode.classList.remove('sculpt-btn');
        modeLabel.textContent = 'Paint Mode: Active (Click / Tap Mesh)';
      } else {
        btnToggleMode.classList.remove('tool-btn-primary');
        btnToggleMode.classList.add('sculpt-btn');
        modeLabel.textContent = 'Activate Decal Paint Mode';
      }
    }
    btnModeStamp?.classList.toggle('active', ctrl.interactionMode === 'stamp');
    btnModeErase?.classList.toggle('active', ctrl.interactionMode === 'erase');

    const available = ctrl.getAvailableTextures();
    const texSelect = this.app.getElement<HTMLSelectElement>('decalTextureSelect');
    if (texSelect) {
      texSelect.innerHTML = '';
      for (const opt of available) {
        const el = document.createElement('option');
        el.value = opt.url;
        el.textContent = opt.name;
        if (opt.url === ctrl.config.textureUrl) {
          el.selected = true;
        }
        texSelect.appendChild(el);
      }
    }

    const gallery = this.app.getElement<HTMLElement>('decalTextureGallery');
    if (gallery) {
      const currentBtns = gallery.querySelectorAll<HTMLButtonElement>('button');
      if (currentBtns.length === available.length && currentBtns.length > 0) {
        let matches = true;
        for (let i = 0; i < available.length; i++) {
          if (currentBtns[i].getAttribute('data-url') !== available[i].url) {
            matches = false;
            break;
          }
        }
        if (matches) {
          for (let i = 0; i < available.length; i++) {
            const isSelected = available[i].url === ctrl.config.textureUrl;
            currentBtns[i].style.borderColor = isSelected ? '#3b82f6' : 'rgba(255,255,255,0.12)';
          }
        } else {
          gallery.innerHTML = '';
          for (const opt of available) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.title = opt.name;
            btn.setAttribute('data-url', opt.url);
            const isSelected = opt.url === ctrl.config.textureUrl;
            btn.style.cssText = `
              height: 46px;
              border-radius: 5px;
              border: 2px solid ${isSelected ? '#3b82f6' : 'rgba(255,255,255,0.12)'};
              background-color: #161b22;
              background-image: url("${opt.previewDataUrl || opt.url}");
              background-size: contain;
              background-repeat: no-repeat;
              background-position: center;
              cursor: pointer;
              padding: 0;
            `;
            btn.addEventListener('click', () => {
              ctrl.setTexture(opt.url, opt.name);
            });
            gallery.appendChild(btn);
          }
        }
      } else {
        gallery.innerHTML = '';
        for (const opt of available) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.title = opt.name;
          btn.setAttribute('data-url', opt.url);
          const isSelected = opt.url === ctrl.config.textureUrl;
          btn.style.cssText = `
            height: 46px;
            border-radius: 5px;
            border: 2px solid ${isSelected ? '#3b82f6' : 'rgba(255,255,255,0.12)'};
            background-color: #161b22;
            background-image: url("${opt.previewDataUrl || opt.url}");
            background-size: contain;
            background-repeat: no-repeat;
            background-position: center;
            cursor: pointer;
            padding: 0;
          `;
          btn.addEventListener('click', () => {
            ctrl.setTexture(opt.url, opt.name);
          });
          gallery.appendChild(btn);
        }
      }
    }

    const sizeRange = this.app.getElement<HTMLInputElement>('decalSizeRange');
    const sizeNum = this.app.getElement<HTMLInputElement>('decalSizeNum');
    const angleRange = this.app.getElement<HTMLInputElement>('decalAngleRange');
    const angleNum = this.app.getElement<HTMLInputElement>('decalAngleNum');

    if (sizeRange) sizeRange.value = String(ctrl.config.sizeX);
    if (sizeNum && document.activeElement !== sizeNum) sizeNum.value = String(ctrl.config.sizeX);
    const deg = ctrl.getAngleDegrees();
    if (angleRange) angleRange.value = String(deg);
    if (angleNum && document.activeElement !== angleNum) angleNum.value = String(deg);

    const unmergedCount = ctrl.getUnmergedDecals().length;
    const countBadge = this.app.getElement<HTMLElement>('decalUnmergedCountBadge');
    if (countBadge) {
      countBadge.textContent = `${unmergedCount} unmerged decal${unmergedCount === 1 ? '' : 's'}`;
    }
  }
}
