import type { MeshEditorAppHost } from '../services/MeshEditorAppHost';
import { ModelCompressor, ModelCompressorOptions, ModelCompressorStats } from './ModelCompressor';

export class CompressModelUIService {
  public compressLoadedFile: File | null = null;
  public compressLoadedFiles: File[] = [];

  constructor(private readonly app: MeshEditorAppHost) {}

  public initCompressModelUI(): void {
    const dialog = this.app.getElement('dialog-compress-model');
    if (!dialog) return;

    const sourceSelect = this.app.getElement<HTMLSelectElement>('compressModelSourceSelect');
    const dropZone = this.app.getElement('compressDropZone');
    const dropZoneInner = this.app.getElement('compressDropZoneInner');
    const fileInput = this.app.getElement<HTMLInputElement>('compressFileInput');
    const browseLink = this.app.getElement('compressBrowseLink');
    const fileInfo = this.app.getElement('compressLoadedFileInfo');
    const fileNameEl = this.app.getElement('compressLoadedFileName');
    const fileSizeEl = this.app.getElement('compressLoadedFileSize');
    const btnClearFile = this.app.getElement('btnCompressClearFile');

    const presetSelect = this.app.getElement<HTMLSelectElement>('compressPresetSelect');
    const presetDesc = this.app.getElement('compressPresetDesc');
    const advancedBox = this.app.getElement('compressAdvancedSection');

    const chkWeld = this.app.getElement<HTMLInputElement>('chkCompressWeld');
    const chkDegenerate = this.app.getElement<HTMLInputElement>('chkCompressDegenerate');
    const chkUnused = this.app.getElement<HTMLInputElement>('chkCompressUnused');
    const chkDraco = this.app.getElement<HTMLInputElement>('chkCompressDraco');
    const sliderDecimate = this.app.getElement<HTMLInputElement>('sliderCompressDecimate');
    const decimateVal = this.app.getElement('compressDecimateValue');
    const chkWebP = this.app.getElement<HTMLInputElement>('chkCompressWebP');

    const formatSelect = this.app.getElement<HTMLSelectElement>('compressExportFormatSelect');
    const btnDownload = this.app.getElement('btnCompressDownload');
    const btnApplyScene = this.app.getElement('btnCompressApplyScene');

    // 1. Source selector
    sourceSelect?.addEventListener('change', () => {
      const isFile = sourceSelect.value === 'file';
      if (dropZone) dropZone.style.display = isFile ? 'block' : 'none';
      if (btnApplyScene) {
        btnApplyScene.innerHTML = isFile
          ? '<i class="app-icon" data-lucide="folder-input"></i> Load File into Scene'
          : '<i class="app-icon" data-lucide="check"></i> Apply to Scene';
        this.app.refreshIcons();
      }
      this.updateCompressModelUI();
    });

    // 2. Drag & Drop / File picking
    const handleFiles = (files: File[]) => {
      if (!files || files.length === 0) return;
      const modelExtensions = ['.glb', '.gltf', '.obj', '.stl', '.ply', '.fbx', '.dae'];
      const primary =
        files.find((f) => {
          const ext = '.' + (f.name.split('.').pop() || '').toLowerCase();
          return modelExtensions.includes(ext);
        }) || files[0];

      this.compressLoadedFiles = files;
      this.compressLoadedFile = primary;
      if (fileNameEl) fileNameEl.textContent = primary.name;
      if (fileSizeEl) fileSizeEl.textContent = this.formatBytes(primary.size);
      if (fileInfo) fileInfo.style.display = 'flex';
      if (dropZoneInner) dropZoneInner.style.display = 'none';
      this.app.refreshIcons();
      this.updateCompressModelUI();
    };

    browseLink?.addEventListener('click', (e) => {
      e.stopPropagation();
      fileInput?.click();
    });

    dropZone?.addEventListener('click', () => {
      if (!this.compressLoadedFile) fileInput?.click();
    });

    fileInput?.addEventListener('change', () => {
      if (fileInput.files && fileInput.files.length > 0) {
        handleFiles(Array.from(fileInput.files));
      }
    });

    dropZone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    });

    dropZone?.addEventListener('dragleave', () => {
      dropZone.classList.remove('dragover');
    });

    dropZone?.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        handleFiles(Array.from(e.dataTransfer.files));
      }
    });

    btnClearFile?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.compressLoadedFile = null;
      this.compressLoadedFiles = [];
      if (fileInput) fileInput.value = '';
      if (fileInfo) fileInfo.style.display = 'none';
      if (dropZoneInner) dropZoneInner.style.display = 'flex';
      this.updateCompressModelUI();
    });

    // 3. Preset changes
    presetSelect?.addEventListener('change', () => {
      const p = presetSelect.value;
      if (advancedBox) advancedBox.style.display = p === 'custom' ? 'flex' : 'none';

      if (presetDesc) {
        switch (p) {
          case 'lossless':
            presetDesc.textContent =
              'Removes duplicate vertices and unused geometry data without altering any polygons.';
            if (chkWeld) chkWeld.checked = true;
            if (chkDegenerate) chkDegenerate.checked = true;
            if (chkUnused) chkUnused.checked = true;
            if (chkDraco) chkDraco.checked = false;
            if (sliderDecimate) sliderDecimate.value = '0';
            if (decimateVal) decimateVal.textContent = '0% (Lossless)';
            break;
          case 'draco_balanced':
            presetDesc.textContent =
              'Cleaned geometry + Khronos Draco bitstream compression (GLB/GLTF) for up to 75% size reduction.';
            if (chkWeld) chkWeld.checked = true;
            if (chkDegenerate) chkDegenerate.checked = true;
            if (chkUnused) chkUnused.checked = true;
            if (chkDraco) chkDraco.checked = true;
            if (sliderDecimate) sliderDecimate.value = '0';
            if (decimateVal) decimateVal.textContent = '0% (Lossless)';
            if (formatSelect) formatSelect.value = 'glb';
            break;
          case 'draco_ultra':
            presetDesc.textContent =
              'Aggressive Draco quantization for maximum network streaming compression.';
            if (chkWeld) chkWeld.checked = true;
            if (chkDegenerate) chkDegenerate.checked = true;
            if (chkUnused) chkUnused.checked = true;
            if (chkDraco) chkDraco.checked = true;
            if (sliderDecimate) sliderDecimate.value = '0';
            if (decimateVal) decimateVal.textContent = '0% (Lossless)';
            if (formatSelect) formatSelect.value = 'glb';
            break;
          case 'decimate_50':
            presetDesc.textContent =
              'Reduces triangle count by 50% with Quadric Error Metrics, plus Draco compression.';
            if (chkWeld) chkWeld.checked = true;
            if (chkDegenerate) chkDegenerate.checked = true;
            if (chkUnused) chkUnused.checked = true;
            if (chkDraco) chkDraco.checked = true;
            if (sliderDecimate) sliderDecimate.value = '50';
            if (decimateVal) decimateVal.textContent = '50% (Decimation)';
            if (formatSelect) formatSelect.value = 'glb';
            break;
          case 'custom':
            presetDesc.textContent =
              'Custom configuration: configure welding, Draco, decimation, and texture compression.';
            break;
        }
      }
      this.updateCompressModelUI();
    });

    sliderDecimate?.addEventListener('input', () => {
      const v = parseInt(sliderDecimate.value, 10);
      if (decimateVal) decimateVal.textContent = v === 0 ? '0% (Lossless)' : `${v}% (Decimation)`;
      this.updateCompressModelUI();
    });

    // 4. Compress & Download
    btnDownload?.addEventListener('click', async () => {
      await this.executeCompressModel(true);
    });

    // 5. Apply to Scene
    btnApplyScene?.addEventListener('click', async () => {
      await this.executeCompressModel(false);
    });

    this.updateCompressModelUI();
  }

  public updateCompressModelUI(): void {
    const dialog = this.app.getElement('dialog-compress-model');
    if (!dialog) return;

    const sourceSelect = this.app.getElement<HTMLSelectElement>('compressModelSourceSelect');
    const isFile = sourceSelect?.value === 'file';
    const metricSize = this.app.getElement('compressMetricSize');
    const metricVerts = this.app.getElement('compressMetricVerts');
    const metricFaces = this.app.getElement('compressMetricFaces');
    const savingsBadge = this.app.getElement('compressSavingsBadge');
    const statusNotice = this.app.getElement('compressStatusNotice');

    if (isFile) {
      if (!this.compressLoadedFile) {
        if (metricSize) metricSize.textContent = '--';
        if (metricVerts) metricVerts.textContent = '--';
        if (metricFaces) metricFaces.textContent = '--';
        if (savingsBadge) savingsBadge.style.display = 'none';
        if (statusNotice) statusNotice.textContent = 'Drop a 3D model file above to analyze and compress.';
        return;
      }

      if (metricSize) metricSize.textContent = this.formatBytes(this.compressLoadedFile.size);
      if (statusNotice) {
        statusNotice.textContent = `File ready: "${this.compressLoadedFile.name}". Click Compress & Download.`;
      }
      return;
    }

    // Active scene mode
    const targetMeshes = this.app.service.selectedMesh
      ? [this.app.service.selectedMesh]
      : this.app.service.importedMeshes.filter((m) => !m.isDisposed() && m.isEnabled());

    if (targetMeshes.length === 0) {
      if (metricSize) metricSize.textContent = '0 B';
      if (metricVerts) metricVerts.textContent = '0';
      if (metricFaces) metricFaces.textContent = '0';
      if (savingsBadge) savingsBadge.style.display = 'none';
      if (statusNotice) statusNotice.textContent = 'No 3D objects in scene. Create or import a mesh first.';
      return;
    }

    let totalVerts = 0;
    let totalFaces = 0;
    for (const m of targetMeshes) {
      totalVerts += m.getTotalVertices();
      totalFaces += m.getTotalIndices() > 0 ? m.getTotalIndices() / 3 : 0;
    }

    const approxBytes = ModelCompressor.calculateMeshesBufferBytes(targetMeshes);
    if (metricSize) metricSize.textContent = this.formatBytes(approxBytes);
    if (metricVerts) metricVerts.textContent = totalVerts.toLocaleString();
    if (metricFaces) metricFaces.textContent = totalFaces.toLocaleString();
    if (statusNotice) {
      statusNotice.textContent = `${targetMeshes.length} object(s) ready. Select preset and click Compress.`;
    }
  }

  private displayCompressStats(data: {
    originalBytes: number;
    compressedBytes: number;
    savedPercent: number;
    originalVerts: number;
    compressedVerts: number;
    originalFaces: number;
    compressedFaces: number;
    weldedVerts: number;
    cleanedFaces: number;
  }): void {
    const metricSize = this.app.getElement('compressMetricSize');
    const metricVerts = this.app.getElement('compressMetricVerts');
    const metricFaces = this.app.getElement('compressMetricFaces');
    const savingsBadge = this.app.getElement('compressSavingsBadge');
    const statusNotice = this.app.getElement('compressStatusNotice');

    if (savingsBadge) {
      savingsBadge.textContent = `-${data.savedPercent}%`;
      savingsBadge.style.display = 'inline-block';
    }

    if (metricSize) {
      metricSize.textContent = `${this.formatBytes(data.compressedBytes)}`;
    }
    if (metricVerts) {
      metricVerts.textContent = `${data.compressedVerts.toLocaleString()}`;
    }
    if (metricFaces) {
      metricFaces.textContent = `${data.compressedFaces.toLocaleString()}`;
    }

    if (statusNotice) {
      statusNotice.innerHTML =
        `Saved <strong>${data.savedPercent}%</strong> (${this.formatBytes(data.originalBytes)} → ${this.formatBytes(data.compressedBytes)})<br>` +
        `Welded <strong>${data.weldedVerts.toLocaleString()}</strong> duplicate vertices, stripped <strong>${data.cleanedFaces}</strong> degenerate faces.`;
    }
  }

  private async executeCompressModel(download: boolean): Promise<void> {
    const sourceSelect = this.app.getElement<HTMLSelectElement>('compressModelSourceSelect');
    const isFile = sourceSelect?.value === 'file';
    const presetSelect = this.app.getElement<HTMLSelectElement>('compressPresetSelect');
    const formatSelect = this.app.getElement<HTMLSelectElement>('compressExportFormatSelect');
    const statusNotice = this.app.getElement('compressStatusNotice');

    const chkWeld = this.app.getElement<HTMLInputElement>('chkCompressWeld');
    const chkDegenerate = this.app.getElement<HTMLInputElement>('chkCompressDegenerate');
    const chkUnused = this.app.getElement<HTMLInputElement>('chkCompressUnused');
    const chkDraco = this.app.getElement<HTMLInputElement>('chkCompressDraco');
    const sliderDecimate = this.app.getElement<HTMLInputElement>('sliderCompressDecimate');
    const chkWebP = this.app.getElement<HTMLInputElement>('chkCompressWebP');

    const preset = (presetSelect?.value || 'lossless') as any;
    const exportFormat = (formatSelect?.value || 'glb') as any;
    const decimateRatio = sliderDecimate ? (100 - parseInt(sliderDecimate.value, 10)) / 100 : 1.0;

    const options: ModelCompressorOptions = ModelCompressor.resolveOptions({
      preset,
      weldVertices: chkWeld ? chkWeld.checked : true,
      removeDegenerateFaces: chkDegenerate ? chkDegenerate.checked : true,
      removeUnusedVertices: chkUnused ? chkUnused.checked : true,
      dracoCompression: chkDraco ? chkDraco.checked : (preset.includes('draco') || preset === 'decimate_50'),
      simplifyMesh: decimateRatio < 1.0,
      simplifyRatio: decimateRatio,
      optimizeTextures: chkWebP ? chkWebP.checked : false,
      exportFormat,
    });

    if (statusNotice) statusNotice.textContent = 'Compressing 3D model in browser...';
    this.app.service.events.onStatusChanged?.('Compressing 3D model...', true);

    try {
      if (isFile) {
        if (!this.compressLoadedFile) {
          this.app.showToast('Please select or drop a 3D file first.', 'warning');
          return;
        }

        const file = this.compressLoadedFile;
        const batchFiles = this.compressLoadedFiles.length > 0 ? this.compressLoadedFiles : [file];
        if (!download) {
          // "Apply to Scene" for file means load it into the editor scene!
          await this.app.service.loadFiles(batchFiles);
          await this.app.service.compressActiveModel(options);
          this.app.showToast(`Imported and compressed "${file.name}" into scene.`, 'success');
          this.updateCompressModelUI();
          return;
        }

        const loaded = await ModelCompressor.loadModelFromFile(file, this.app.service.engine, batchFiles);
        try {
          const stats = await ModelCompressor.optimizeMeshes(loaded.meshes, options);
          const exported = await ModelCompressor.exportCompressedModel(
            loaded.scene,
            loaded.meshes,
            file.name,
            options
          );

          this.triggerDownloadBlob(exported.blob, exported.filename);

          const savedBytes = Math.max(0, file.size - exported.size);
          const savedPercent = file.size > 0 ? Math.round((savedBytes / file.size) * 100) : 0;
          this.app.showToast(
            `Model compressed! Reduced by ${savedPercent}% (${this.formatBytes(file.size)} → ${this.formatBytes(exported.size)}).`,
            'success'
          );

          this.displayCompressStats({
            originalBytes: file.size,
            compressedBytes: exported.size,
            savedPercent,
            originalVerts: stats.originalVertices,
            compressedVerts: stats.compressedVertices,
            originalFaces: stats.originalFaces,
            compressedFaces: stats.compressedFaces,
            weldedVerts: stats.duplicateVerticesRemoved,
            cleanedFaces: stats.degenerateFacesRemoved,
          });
        } finally {
          loaded.dispose();
        }
      } else {
        // Scene mode
        if (download) {
          const targetMeshes = this.app.service.selectedMesh
            ? [this.app.service.selectedMesh]
            : this.app.service.importedMeshes.filter((m) => !m.isDisposed() && m.isEnabled());
          const beforeBytes = ModelCompressor.calculateMeshesBufferBytes(targetMeshes);
          const exported = await this.app.service.exportCompressedActiveModel(options);
          this.triggerDownloadBlob(exported.blob, exported.filename);

          const savedBytes = Math.max(0, beforeBytes - exported.size);
          const savedPercent = beforeBytes > 0 ? Math.round((savedBytes / beforeBytes) * 100) : 0;
          this.app.showToast(
            `Exported compressed model "${exported.filename}" (${this.formatBytes(exported.size)})!`,
            'success'
          );

          this.displayCompressStats({
            originalBytes: beforeBytes,
            compressedBytes: exported.size,
            savedPercent,
            originalVerts: targetMeshes.reduce((acc, m) => acc + m.getTotalVertices(), 0),
            compressedVerts: targetMeshes.reduce((acc, m) => acc + m.getTotalVertices(), 0),
            originalFaces: targetMeshes.reduce((acc, m) => acc + m.getTotalIndices() / 3, 0),
            compressedFaces: targetMeshes.reduce((acc, m) => acc + m.getTotalIndices() / 3, 0),
            weldedVerts: 0,
            cleanedFaces: 0,
          });
        } else {
          const stats = await this.app.service.compressActiveModel(options);
          this.app.showToast(
            `Compressed scene! Welded ${stats.duplicateVerticesRemoved} duplicate vertices, stripped ${stats.degenerateFacesRemoved} degenerate faces.`,
            'success'
          );

          this.displayCompressStats({
            originalBytes: stats.originalSizeBytes,
            compressedBytes: stats.compressedSizeBytes,
            savedPercent: stats.byteSavingsPercent,
            originalVerts: stats.originalVertices,
            compressedVerts: stats.compressedVertices,
            originalFaces: stats.originalFaces,
            compressedFaces: stats.compressedFaces,
            weldedVerts: stats.duplicateVerticesRemoved,
            cleanedFaces: stats.degenerateFacesRemoved,
          });
        }
      }
    } catch (err: any) {
      console.error('[MeshEditorApp] Model compression error:', err);
      this.app.showToast(`Compression failed: ${err.message || err}`, 'error');
      if (statusNotice) statusNotice.textContent = `Error: ${err.message || err}`;
    } finally {
      this.app.service.events.onStatusChanged?.('Ready');
    }
  }

  private triggerDownloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  private formatBytes(bytes: number): string {
    if (bytes <= 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}
