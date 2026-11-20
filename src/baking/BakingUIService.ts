import type { Mesh } from '@babylonjs/core';
import type { MeshEditorAppHost } from '../services/MeshEditorAppHost';

export class BakingUIService {
  constructor(private readonly app: MeshEditorAppHost) {}

  public initBakingUI(): void {
    const dialog = this.app.getElement('dialog-baking');
    if (!dialog) return;

    const sliderCage = this.app.getElement<HTMLInputElement>('sliderBakeCageOffset');
    const valCage = this.app.getElement('bakeCageOffsetVal');
    const chkShowCage = this.app.getElement<HTMLInputElement>('chkBakeShowCage');
    const selectLow = this.app.getElement<HTMLSelectElement>('selectBakeLowPoly');
    const selectHigh = this.app.getElement<HTMLSelectElement>('selectBakeHighPoly');
    const selectRes = this.app.getElement<HTMLSelectElement>('selectBakeResolution');
    const selectPad = this.app.getElement<HTMLSelectElement>('selectBakePadding');
    const chkFlipY = this.app.getElement<HTMLInputElement>('chkBakeFlipY');
    const chkApply = this.app.getElement<HTMLInputElement>('chkBakeApplyMaterial');
    const chkAutoUnwrap = this.app.getElement<HTMLInputElement>('chkBakeAutoUnwrap');
    const selectPreviewChannel = this.app.getElement<HTMLSelectElement>('selectBakePreviewChannel');
    const previewCanvas = this.app.getElement<HTMLCanvasElement>('bakePreviewCanvas');

    const resolveLowPoly = (): Mesh | null => {
      const val = selectLow?.value || 'selected';
      if (val !== 'selected') {
        const found = this.app.service.importedMeshes.find((m) => m.name === val && !m.isDisposed() && (!m.isEnabled || m.isEnabled()));
        if (found) return found;
      }
      return (
        this.app.service.selectedMesh ||
        this.app.service.importedMeshes.find((m) => !this.app.service.isEditorHelper(m) && !m.isDisposed() && (!m.isEnabled || m.isEnabled())) ||
        null
      );
    };

    const resolveHighPoly = (low: Mesh | null): Mesh | null => {
      const val = selectHigh?.value || 'self';
      if (val !== 'self') {
        const found = this.app.service.importedMeshes.find((m) => m.name === val && !m.isDisposed() && (!m.isEnabled || m.isEnabled()));
        if (found) return found;
      }
      return low;
    };

    selectLow?.addEventListener('change', () => this.updateBakingUI());
    selectHigh?.addEventListener('change', () => this.updateBakingUI());

    this.app.getElement('btnBakeQuickUnwrap')?.addEventListener('click', () => {
      const low = resolveLowPoly();
      if (!low) {
        this.app.showToast('Please select a Low-Poly mesh first.', 'warning');
        return;
      }
      if (this.app.service.uvUnwrapController) {
        this.app.service.uvUnwrapController.unwrapMesh(low);
        this.updateBakingUI();
        this.app.showToast(`Unwrapped and packed UV islands for "${low.name}".`, 'success');
      }
    });

    if (sliderCage) {
      sliderCage.addEventListener('input', () => {
        const dist = parseFloat(sliderCage.value) || 0.04;
        if (valCage) valCage.textContent = dist.toFixed(3);
        this.app.service.textureBaker.cageExtrusion = dist;
        if (chkShowCage?.checked) {
          this.app.service.textureBaker.updateCagePreview(resolveLowPoly(), dist, true);
        }
      });
    }

    if (chkShowCage) {
      chkShowCage.addEventListener('change', () => {
        const dist = sliderCage ? parseFloat(sliderCage.value) || 0.04 : 0.04;
        this.app.service.textureBaker.updateCagePreview(resolveLowPoly(), dist, chkShowCage.checked);
      });
    }

    this.app.getElement('btnBakeAutoCage')?.addEventListener('click', () => {
      const low = resolveLowPoly();
      if (!low) {
        this.app.showToast('Please select a Low-Poly mesh first.', 'warning');
        return;
      }
      const high = resolveHighPoly(low);
      const optimal = this.app.service.textureBaker.computeAutoCageDistance(low, high);
      if (sliderCage) sliderCage.value = optimal.toString();
      if (valCage) valCage.textContent = optimal.toFixed(3);
      if (chkShowCage?.checked) {
        this.app.service.textureBaker.updateCagePreview(low, optimal, true);
      }
      this.app.showToast(`Auto-calculated optimal Cage extrusion: ${optimal.toFixed(3)}m.`, 'info');
    });

    if (selectPreviewChannel && previewCanvas) {
      selectPreviewChannel.addEventListener('change', () => {
        const ch = selectPreviewChannel.value === 'ao' ? 'ao' : 'normal';
        this.app.service.textureBaker.renderBakePreviewToCanvas(previewCanvas, ch);
      });
    }

    this.app.getElement('btnExecuteBake')?.addEventListener('click', async () => {
      const low = resolveLowPoly();
      if (!low) {
        this.app.showToast('Please select a target Low-Poly mesh to bake.', 'warning');
        return;
      }
      const high = resolveHighPoly(low);
      const resolution = (parseInt(selectRes?.value || '512', 10) || 512) as
        | 128
        | 256
        | 512
        | 1024
        | 2048;
      const cageExtrusion = sliderCage ? parseFloat(sliderCage.value) || 0.04 : 0.04;
      const paddingPx = parseInt(selectPad?.value || '4', 10) || 4;
      const flipNormalY = !!chkFlipY?.checked;
      const applyToMaterial = chkApply ? chkApply.checked : true;
      const autoUnwrapIfOverlapping = chkAutoUnwrap ? chkAutoUnwrap.checked : false;

      try {
        const res = await this.app.service.textureBaker.bakeTextures({
          lowPolyMesh: low,
          highPolyMesh: high,
          resolution,
          cageExtrusion,
          paddingPx,
          flipNormalY,
          applyToMaterial,
          autoUnwrapIfOverlapping,
        });

        const statusEl = this.app.getElement('bakeStatusText');
        const statsEl = this.app.getElement('bakeRayStats');
        if (statusEl) statusEl.textContent = `Baked ${res.resolution}×${res.resolution}`;
        if (statsEl) {
          statsEl.textContent = `${res.rayHitCount.toLocaleString()} rays (${res.coveragePercent}%)`;
        }
        if (previewCanvas) {
          const ch = selectPreviewChannel?.value === 'ao' ? 'ao' : 'normal';
          this.app.service.textureBaker.renderBakePreviewToCanvas(previewCanvas, ch);
        }
        this.app.showToast(
          `Baked Normal & AO Maps (${res.resolution}×${res.resolution}) onto "${low.name}".`,
          'success'
        );
      } catch (err: any) {
        this.app.showToast(`Baking failed: ${err.message || err}`, 'error');
      }
    });

    const downloadDataUrl = (url: string, filename: string) => {
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    };

    this.app.getElement('btnDownloadNormalMap')?.addEventListener('click', () => {
      const last = this.app.service.textureBaker.lastBakeResult;
      if (!last) {
        this.app.showToast('Please run Bake Normal & AO Maps first.', 'warning');
        return;
      }
      downloadDataUrl(last.normalMapDataUrl, `${last.lowPolyMeshName}_NormalMap.png`);
    });

    this.app.getElement('btnDownloadAOMap')?.addEventListener('click', () => {
      const last = this.app.service.textureBaker.lastBakeResult;
      if (!last) {
        this.app.showToast('Please run Bake Normal & AO Maps first.', 'warning');
        return;
      }
      downloadDataUrl(last.aoMapDataUrl, `${last.lowPolyMeshName}_AOMap.png`);
    });

    this.updateBakingUI();
  }

  public updateBakingUI(): void {
    const dialog = this.app.getElement('dialog-baking');
    if (!dialog) return;

    const selectLow = this.app.getElement<HTMLSelectElement>('selectBakeLowPoly');
    const selectHigh = this.app.getElement<HTMLSelectElement>('selectBakeHighPoly');
    const validMeshes = this.app.service.importedMeshes.filter(
      (m) => !this.app.service.isEditorHelper(m) && !m.isDisposed() && (!m.isEnabled || m.isEnabled())
    );

    if (selectLow) {
      const prev = selectLow.value;
      selectLow.innerHTML = `<option value="selected">Selected Mesh</option>`;
      for (const m of validMeshes) {
        const opt = document.createElement('option');
        opt.value = m.name;
        opt.textContent = m.name;
        selectLow.appendChild(opt);
      }
      if (prev && Array.from(selectLow.options).some((o) => o.value === prev)) {
        selectLow.value = prev;
      }
    }

    if (selectHigh) {
      const prev = selectHigh.value;
      selectHigh.innerHTML = `<option value="self">Self (Bevel & Cavity Detail)</option>`;
      for (const m of validMeshes) {
        const opt = document.createElement('option');
        opt.value = m.name;
        opt.textContent = m.name;
        selectHigh.appendChild(opt);
      }
      if (prev && Array.from(selectHigh.options).some((o) => o.value === prev)) {
        selectHigh.value = prev;
      }
    }

    const warningEl = this.app.getElement('bakeUVWarning');
    if (warningEl) {
      const targetMesh =
        selectLow && selectLow.value !== 'selected'
          ? validMeshes.find((m) => m.name === selectLow.value)
          : this.app.service.selectedMesh || validMeshes[0];

      if (targetMesh && this.app.service.uvUnwrapController) {
        const stats = this.app.service.uvUnwrapController.analyzeUVs(targetMesh);
        warningEl.style.display = stats.overlapDetected ? 'block' : 'none';
      } else {
        warningEl.style.display = 'none';
      }
    }
  }
}
