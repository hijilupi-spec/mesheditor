import { GaussianSplattingMesh } from '@babylonjs/core';
import type { MeshEditorAppHost } from '../services/MeshEditorAppHost';
import type { GaussianSplatPresetKind } from './GaussianSplatController';
import { getSplatCount } from './GaussianSplatUtils';

/**
 * UI service wiring `#dialog-gaussian-splat` to `GaussianSplatController`.
 */
export class GaussianSplatUIService {
  constructor(private readonly app: MeshEditorAppHost) {}

  public initGaussianSplatUI(): void {
    const dialog = this.app.getElement('dialog-gaussian-splat');
    if (!dialog || (dialog as any)._gaussianSplatInitialized) return;
    (dialog as any)._gaussianSplatInitialized = true;

    const ctrl = this.app.service.gaussianSplatController;

    // 1. Target Splat Cloud selector
    const splatSelect = this.app.getElement<HTMLSelectElement>('gsTargetSelect');
    splatSelect?.addEventListener('change', () => {
      const target = ctrl.resolveSplatMesh(splatSelect.value);
      if (target) {
        this.app.service.selectMesh(target);
      }
      this.updateGaussianSplatUI();
    });

    // 2. Import Splat File (.splat, .ply, .spz, .sog)
    const fileInput = this.app.getElement<HTMLInputElement>('gsFileInput');
    const flipYCheckbox = this.app.getElement<HTMLInputElement>('gsFlipYCheckbox');
    this.app.getElement('btnGSImportFile')?.addEventListener('click', () => fileInput?.click());
    fileInput?.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      try {
        const added = await ctrl.loadSplatFromFile(file, {
          replaceScene: false,
          flipY: !!flipYCheckbox?.checked,
        });
        this.app.updateOutliner();
        this.updateGaussianSplatUI();
        if (added.length > 0) {
          this.app.showToast(
            `Imported "${file.name}" (${getSplatCount(added[0]).toLocaleString()} splats).`,
            'success'
          );
        } else {
          this.app.showToast(`Imported "${file.name}".`, 'success');
        }
      } catch (err: any) {
        this.app.showToast(err?.message || 'Failed to import Gaussian Splat file.', 'error');
      }
      fileInput.value = '';
    });

    // 3. Create Procedural Splat Preset
    this.app.getElement('btnGSCreatePreset')?.addEventListener('click', () => {
      const preset = (this.app.getElement<HTMLSelectElement>('gsPresetSelect')?.value || 'cloud') as GaussianSplatPresetKind;
      const countVal = parseInt(this.app.getElement<HTMLInputElement>('gsPresetCountNum')?.value || '2500', 10);
      const radiusVal = parseFloat(this.app.getElement<HTMLInputElement>('gsPresetRadiusNum')?.value || '1.2');
      try {
        const mesh = ctrl.createProceduralPreset(preset, {
          splatCount: Number.isFinite(countVal) ? countVal : 2500,
          radius: Number.isFinite(radiusVal) ? radiusVal : 1.2,
        });
        this.app.updateOutliner();
        this.updateGaussianSplatUI();
        this.app.showToast(`Created "${mesh.name}" (${getSplatCount(mesh).toLocaleString()} splats).`, 'success');
      } catch (err: any) {
        this.app.showToast(err?.message || 'Failed to create Gaussian Splat preset.', 'error');
      }
    });

    // 4. Mesh -> Splats Conversion
    this.app.getElement('btnGSConvertMesh')?.addEventListener('click', () => {
      const sourceName = this.app.getElement<HTMLSelectElement>('gsSourceMeshSelect')?.value || '';
      const sourceMesh = ctrl.getConvertibleTriangleMeshes().find((m) => m.name === sourceName);
      if (!sourceMesh) {
        this.app.showToast('Please select a triangle mesh to convert.', 'warning');
        return;
      }
      const targetSplatCount = parseInt(this.app.getElement<HTMLInputElement>('gsConvertCountNum')?.value || '4000', 10);
      const mode = (this.app.getElement<HTMLSelectElement>('gsConvertModeSelect')?.value || 'surface') as 'surface' | 'volume';
      const splatStyle = (this.app.getElement<HTMLSelectElement>('gsConvertStyleSelect')?.value || 'default') as any;
      const removeSource = !!this.app.getElement<HTMLInputElement>('gsConvertRemoveSource')?.checked;

      try {
        const { splatMesh, splatCount } = ctrl.convertMeshToSplats(sourceMesh, {
          targetSplatCount: Number.isFinite(targetSplatCount) ? targetSplatCount : 4000,
          mode,
          splatStyle,
          removeSource,
        });
        this.app.updateOutliner();
        this.updateGaussianSplatUI();
        this.app.showToast(
          `Converted "${sourceMesh.name}" into "${splatMesh.name}" (${splatCount.toLocaleString()} splats).`,
          'success'
        );
      } catch (err: any) {
        this.app.showToast(err?.message || 'Failed to convert mesh to Gaussian Splats.', 'error');
      }
    });

    // 5. Render Settings (SH Degree, Min Pixel Size, Depth Sort, IBL Shadows)
    const shRange = this.app.getElement<HTMLInputElement>('gsShDegreeRange');
    const shVal = this.app.getElement<HTMLElement>('gsShDegreeVal');
    const minPxRange = this.app.getElement<HTMLInputElement>('gsMinPixelSizeRange');
    const minPxVal = this.app.getElement<HTMLElement>('gsMinPixelSizeVal');
    const disableSortChk = this.app.getElement<HTMLInputElement>('gsDisableDepthSortCheckbox');
    const iblShadowsChk = this.app.getElement<HTMLInputElement>('gsIblShadowsCheckbox');

    const applyActiveRenderSettings = () => {
      const active = this.resolveCurrentTargetMesh();
      if (!active) return;
      ctrl.setRenderSettings(active, {
        shDegree: shRange ? parseInt(shRange.value, 10) : undefined,
        minPixelSize: minPxRange ? parseFloat(minPxRange.value) : undefined,
        disableDepthSort: disableSortChk ? disableSortChk.checked : undefined,
        needsRotationScaleTextures: iblShadowsChk ? iblShadowsChk.checked : undefined,
      });
      if (shVal && shRange) shVal.textContent = String(active.shDegree);
      if (minPxVal && minPxRange) minPxVal.textContent = `${Number(minPxRange.value).toFixed(1)} px`;
    };

    shRange?.addEventListener('input', applyActiveRenderSettings);
    minPxRange?.addEventListener('input', applyActiveRenderSettings);
    disableSortChk?.addEventListener('change', applyActiveRenderSettings);
    iblShadowsChk?.addEventListener('change', applyActiveRenderSettings);

    // 6. Cleanup & Decimate
    this.app.getElement('btnGSCleanup')?.addEventListener('click', () => {
      const active = this.resolveCurrentTargetMesh();
      if (!active) {
        this.app.showToast('No active Gaussian Splat mesh selected.', 'warning');
        return;
      }
      const minOpacity = parseFloat(this.app.getElement<HTMLInputElement>('gsMinOpacityNum')?.value || '0.05');
      const maxScale = parseFloat(this.app.getElement<HTMLInputElement>('gsMaxScaleNum')?.value || '0');
      const sampleStep = parseInt(this.app.getElement<HTMLSelectElement>('gsSampleStepSelect')?.value || '1', 10);
      const cropRadius = parseFloat(this.app.getElement<HTMLInputElement>('gsCropRadiusNum')?.value || '0');

      try {
        const stats = ctrl.getSplatStats(active);
        const res = ctrl.cleanupSplats(active, {
          minOpacity: Number.isFinite(minOpacity) ? minOpacity : 0,
          maxScale: Number.isFinite(maxScale) && maxScale > 0 ? maxScale : undefined,
          sampleStep: Number.isFinite(sampleStep) ? sampleStep : 1,
          cropRadius: Number.isFinite(cropRadius) && cropRadius > 0 ? cropRadius : undefined,
          cropCenter: stats.worldBounds.center,
        });
        this.app.updateOutliner();
        this.updateGaussianSplatUI();
        this.app.showToast(
          `Cleaned "${active.name}": kept ${res.afterCount.toLocaleString()} / ${res.beforeCount.toLocaleString()} splats.`,
          'success'
        );
      } catch (err: any) {
        this.app.showToast(err?.message || 'Failed to clean Gaussian Splats.', 'error');
      }
    });

    // 7. Scale / Opacity / Color Tint Adjustment
    this.app.getElement('btnGSApplyAdjustment')?.addEventListener('click', () => {
      const active = this.resolveCurrentTargetMesh();
      if (!active) {
        this.app.showToast('No active Gaussian Splat mesh selected.', 'warning');
        return;
      }
      const scaleMult = parseFloat(this.app.getElement<HTMLInputElement>('gsScaleMultNum')?.value || '1');
      const opacityMult = parseFloat(this.app.getElement<HTMLInputElement>('gsOpacityMultNum')?.value || '1');
      const colorTint = this.app.getElement<HTMLInputElement>('gsTintColorInput')?.value || '#ffffff';
      const tintStrength = parseFloat(this.app.getElement<HTMLInputElement>('gsTintStrengthRange')?.value || '0');

      try {
        const count = ctrl.adjustSplats(active, {
          scaleMultiplier: Number.isFinite(scaleMult) ? scaleMult : 1,
          opacityMultiplier: Number.isFinite(opacityMult) ? opacityMult : 1,
          colorTint,
          tintStrength: Number.isFinite(tintStrength) ? tintStrength : 0,
        });
        this.updateGaussianSplatUI();
        this.app.showToast(`Adjusted ${count.toLocaleString()} splats in "${active.name}".`, 'success');
      } catch (err: any) {
        this.app.showToast(err?.message || 'Failed to adjust splats.', 'error');
      }
    });

    const tintStrengthRange = this.app.getElement<HTMLInputElement>('gsTintStrengthRange');
    const tintStrengthVal = this.app.getElement<HTMLElement>('gsTintStrengthVal');
    tintStrengthRange?.addEventListener('input', () => {
      if (tintStrengthVal) {
        tintStrengthVal.textContent = `${Math.round(parseFloat(tintStrengthRange.value) * 100)}%`;
      }
    });

    // 8. Bake Transform, Ground, Merge & Export
    this.app.getElement('btnGSBakeTransform')?.addEventListener('click', () => {
      const active = this.resolveCurrentTargetMesh();
      if (!active) {
        this.app.showToast('No active Gaussian Splat mesh selected.', 'warning');
        return;
      }
      try {
        ctrl.bakeTransform(active, false);
        this.updateGaussianSplatUI();
        this.app.showToast(`Baked world transform into "${active.name}" splat data.`, 'success');
      } catch (err: any) {
        this.app.showToast(err?.message || 'Failed to bake transform.', 'error');
      }
    });

    this.app.getElement('btnGSAlignGround')?.addEventListener('click', () => {
      const active = this.resolveCurrentTargetMesh();
      if (!active) {
        this.app.showToast('No active Gaussian Splat mesh selected.', 'warning');
        return;
      }
      ctrl.alignSplatToGround(active);
      this.app.service.events.onSceneModified?.();
      this.updateGaussianSplatUI();
      this.app.showToast(`Aligned "${active.name}" base to ground (Y = 0).`, 'success');
    });

    this.app.getElement('btnGSMergeAll')?.addEventListener('click', () => {
      const all = ctrl.getAllSplatMeshes();
      if (all.length < 2) {
        this.app.showToast('At least 2 Gaussian Splat meshes are required to merge.', 'warning');
        return;
      }
      try {
        const merged = ctrl.mergeSplatMeshes(all);
        this.app.updateOutliner();
        this.updateGaussianSplatUI();
        this.app.showToast(
          `Merged ${all.length} splat clouds into "${merged.name}" (${getSplatCount(merged).toLocaleString()} splats).`,
          'success'
        );
      } catch (err: any) {
        this.app.showToast(err?.message || 'Failed to merge Gaussian Splat meshes.', 'error');
      }
    });

    const handleExport = (format: 'splat' | 'ply') => {
      const active = this.resolveCurrentTargetMesh();
      if (!active) {
        this.app.showToast('No active Gaussian Splat mesh selected.', 'warning');
        return;
      }
      try {
        const blob = ctrl.exportSplatBlob(active, format, true);
        const safeBase = (active.name || 'gaussian_splat').replace(/[^a-zA-Z0-9_-]/g, '_');
        this.app.triggerDownloadBlob(blob, `${safeBase}.${format}`);
        this.app.showToast(`Exported "${active.name}" as .${format.toUpperCase()}!`, 'success');
      } catch (err: any) {
        this.app.showToast(err?.message || `Failed to export .${format}.`, 'error');
      }
    };

    this.app.getElement('btnGSExportSplat')?.addEventListener('click', () => handleExport('splat'));
    this.app.getElement('btnGSExportPly')?.addEventListener('click', () => handleExport('ply'));

    this.updateGaussianSplatUI();
  }

  private resolveCurrentTargetMesh(): GaussianSplattingMesh | null {
    const ctrl = this.app.service.gaussianSplatController;
    const selectEl = this.app.getElement<HTMLSelectElement>('gsTargetSelect');
    const selected = this.app.service.selectedMesh;
    if (selected && !selected.isDisposed() && selected instanceof GaussianSplattingMesh) {
      return selected;
    }
    if (selectEl?.value) {
      const bySelect = ctrl.resolveSplatMesh(selectEl.value);
      if (bySelect) return bySelect;
    }
    return ctrl.getActiveSplatMesh();
  }

  public updateGaussianSplatUI(): void {
    const ctrl = this.app.service.gaussianSplatController;
    const allSplats = ctrl.getAllSplatMeshes();
    const active = this.resolveCurrentTargetMesh();

    // Update target splat dropdown
    const splatSelect = this.app.getElement<HTMLSelectElement>('gsTargetSelect');
    if (splatSelect) {
      splatSelect.innerHTML = '';
      if (allSplats.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'No Gaussian Splats in scene';
        splatSelect.appendChild(opt);
      } else {
        for (const m of allSplats) {
          const opt = document.createElement('option');
          opt.value = m.name;
          const cnt = getSplatCount(m);
          opt.textContent = `${m.name} (${cnt.toLocaleString()} splats)`;
          splatSelect.appendChild(opt);
        }
        if (active) splatSelect.value = active.name;
      }
    }

    // Update source triangle mesh dropdown for Mesh -> Splats
    const meshSelect = this.app.getElement<HTMLSelectElement>('gsSourceMeshSelect');
    if (meshSelect) {
      const prevVal = meshSelect.value;
      const triangleMeshes = ctrl.getConvertibleTriangleMeshes();
      meshSelect.innerHTML = '';
      if (triangleMeshes.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'No triangle meshes available';
        meshSelect.appendChild(opt);
      } else {
        for (const m of triangleMeshes) {
          const opt = document.createElement('option');
          opt.value = m.name;
          const tris = Math.floor(m.getTotalIndices() / 3);
          opt.textContent = `${m.name} (${tris.toLocaleString()} tris)`;
          meshSelect.appendChild(opt);
        }
        const selectedTri = triangleMeshes.find((m) => m === this.app.service.selectedMesh);
        if (selectedTri) {
          meshSelect.value = selectedTri.name;
        } else if (prevVal && triangleMeshes.some((m) => m.name === prevVal)) {
          meshSelect.value = prevVal;
        }
      }
    }

    // Update status badge and render controls
    const badge = this.app.getElement('gsSelectedBadge');
    const shRange = this.app.getElement<HTMLInputElement>('gsShDegreeRange');
    const shVal = this.app.getElement<HTMLElement>('gsShDegreeVal');
    const minPxRange = this.app.getElement<HTMLInputElement>('gsMinPixelSizeRange');
    const minPxVal = this.app.getElement<HTMLElement>('gsMinPixelSizeVal');
    const disableSortChk = this.app.getElement<HTMLInputElement>('gsDisableDepthSortCheckbox');
    const iblShadowsChk = this.app.getElement<HTMLInputElement>('gsIblShadowsCheckbox');
    const btnMerge = this.app.getElement<HTMLButtonElement>('btnGSMergeAll');

    if (btnMerge) {
      btnMerge.disabled = allSplats.length < 2;
    }

    if (!active) {
      if (badge) {
        badge.textContent =
          'Import a .splat / .ply / .spz / .sog file, generate a volumetric preset, or convert a triangle mesh into Gaussian Splats.';
      }
      return;
    }

    const stats = ctrl.getSplatStats(active);
    if (badge) {
      badge.innerHTML = `<strong>${stats.name}</strong> &bull; ${stats.splatCount.toLocaleString()} splats &bull; SH ${stats.shDegree}/${stats.maxShDegree} &bull; ${stats.hasEditableData ? 'RAM Editable' : 'GPU Only'}`;
    }

    if (shRange) {
      shRange.max = String(Math.max(0, stats.maxShDegree));
      shRange.value = String(stats.shDegree);
      shRange.disabled = stats.maxShDegree <= 0;
    }
    if (shVal) shVal.textContent = String(stats.shDegree);

    if (minPxRange) minPxRange.value = String(stats.minPixelSize);
    if (minPxVal) minPxVal.textContent = `${stats.minPixelSize.toFixed(1)} px`;

    if (disableSortChk) disableSortChk.checked = stats.disableDepthSort;
    if (iblShadowsChk) iblShadowsChk.checked = stats.needsRotationScaleTextures;
  }
}
