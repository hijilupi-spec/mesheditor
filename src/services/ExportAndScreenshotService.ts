import type { ExportOptions, ScreenshotMode } from '../types';
import type { MeshEditorAppHost } from './MeshEditorAppHost';

export class ExportAndScreenshotService {
  public selectedScreenshotMode: ScreenshotMode = 'current';

  constructor(private readonly app: MeshEditorAppHost) {}

  public initExportDialog(): void {
    const modal = this.app.getElement('exportModal');
    if (!modal) return;

    const btnClose = this.app.getElement('btnCloseExport');
    const btnCancel = this.app.getElement('btnCancelExport');
    const btnConfirm = this.app.getElement('btnConfirmExport');
    const filenameInput = this.app.getElement<HTMLInputElement>('exportFilenameInput');
    const selectedOnlyCheckbox = this.app.getElement<HTMLInputElement>('exportSelectedOnlyCheckbox');
    const formatCards = modal.querySelectorAll<HTMLElement>('.export-format-option');

    btnClose?.addEventListener('click', () => this.closeExportDialog());
    btnCancel?.addEventListener('click', () => this.closeExportDialog());

    formatCards.forEach((card) => {
      card.addEventListener('click', () => {
        const format = card.getAttribute('data-format') as ExportOptions['format'] | null;
        if (!format) return;

        formatCards.forEach((c) => c.classList.remove('active'));
        card.classList.add('active');

        const radio = card.querySelector<HTMLInputElement>('input[type="radio"]');
        if (radio) radio.checked = true;

        this.app.service.exportParams.format = format;
        const badge = this.app.getElement('exportExtensionBadge');
        if (badge) badge.textContent = '.' + format;
      });
    });

    selectedOnlyCheckbox?.addEventListener('change', () => {
      this.app.service.exportParams.selectedOnly = selectedOnlyCheckbox.checked;
      this.updateExportScopeDetails();
    });

    btnConfirm?.addEventListener('click', () => {
      this.confirmExport();
    });

    filenameInput?.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.confirmExport();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.closeExportDialog();
      }
    });
  }

  public openExportDialog(): void {
    const modal = this.app.getElement('exportModal');
    if (!modal) return;

    const filenameInput = this.app.getElement<HTMLInputElement>('exportFilenameInput');
    if (filenameInput) {
      filenameInput.value = (this.app.service.exportParams.filename || 'model_edited').trim();
    }

    const currentFormat = (this.app.service.exportParams.format || 'glb').toLowerCase();
    const formatCards = modal.querySelectorAll<HTMLElement>('.export-format-option');
    formatCards.forEach((card) => {
      const format = card.getAttribute('data-format');
      const isSelected = format === currentFormat;
      card.classList.toggle('active', isSelected);
      const radio = card.querySelector<HTMLInputElement>('input[type="radio"]');
      if (radio) radio.checked = isSelected;
    });

    const badge = this.app.getElement('exportExtensionBadge');
    if (badge) {
      badge.textContent = '.' + currentFormat;
    }

    const selectedOnlyCheckbox = this.app.getElement<HTMLInputElement>('exportSelectedOnlyCheckbox');
    if (selectedOnlyCheckbox) {
      selectedOnlyCheckbox.checked = !!this.app.service.exportParams.selectedOnly;
    }

    this.updateExportScopeDetails();

    modal.classList.add('active');
    this.app.refreshIcons();

    setTimeout(() => {
      if (filenameInput) {
        filenameInput.focus();
        filenameInput.select();
      }
    }, 50);
  }

  public closeExportDialog(): void {
    const modal = this.app.getElement('exportModal');
    modal?.classList.remove('active');
    try {
      this.app.canvas?.focus();
    } catch {
      // Ignore
    }
  }

  private updateExportScopeDetails(): void {
    const selectedOnlyCheckbox = this.app.getElement<HTMLInputElement>('exportSelectedOnlyCheckbox');
    const details = this.app.getElement('exportSelectionDetails');
    if (!details) return;

    const selectedCount = this.app.service.selectedNodes.length;
    const totalMeshes = this.app.service.importedMeshes.length;

    if (selectedOnlyCheckbox?.checked) {
      if (selectedCount > 0) {
        details.textContent = `${selectedCount} selected mesh${selectedCount === 1 ? '' : 'es'} will be exported.`;
        details.className = 'export-selection-details';
      } else {
        details.textContent = 'Warning: No meshes are currently selected.';
        details.className = 'export-selection-details warning';
      }
    } else {
      details.textContent = `All scene meshes will be exported (${totalMeshes} mesh${totalMeshes === 1 ? '' : 'es'} in scene).`;
      details.className = 'export-selection-details';
    }
  }

  private async confirmExport(): Promise<void> {
    const filenameInput = this.app.getElement<HTMLInputElement>('exportFilenameInput');
    const rawFilename = (filenameInput?.value || '').trim();
    const filename = rawFilename || this.app.service.exportParams.filename || 'model_edited';

    const modal = this.app.getElement('exportModal');
    const activeCard = modal?.querySelector<HTMLElement>('.export-format-option.active');
    const format = (activeCard?.getAttribute('data-format') || this.app.service.exportParams.format || 'glb') as ExportOptions['format'];

    const selectedOnlyCheckbox = this.app.getElement<HTMLInputElement>('exportSelectedOnlyCheckbox');
    const selectedOnly = !!selectedOnlyCheckbox?.checked;

    if (selectedOnly && this.app.service.selectedNodes.length === 0) {
      this.app.showToast('Please select at least one mesh or uncheck "Export selected objects only".', 'warning');
      return;
    }

    this.app.service.exportParams.filename = filename;
    this.app.service.exportParams.format = format;
    this.app.service.exportParams.selectedOnly = selectedOnly;

    this.closeExportDialog();
    await this.app.service.exportCurrentModel({ filename, format, selectedOnly });
  }

  public async saveBabylonScene(): Promise<void> {
    const filename = (this.app.service.exportParams.filename || 'scene').trim() || 'scene';
    await this.app.service.exportCurrentModel({
      filename,
      format: 'babylon',
      selectedOnly: false,
    });
  }

  public initScreenshotDialog(): void {
    const modal = this.app.getElement<HTMLDialogElement>('screenshotModal');
    if (!modal) return;

    const btnClose = this.app.getElement('btnCloseScreenshot');
    const btnCancel = this.app.getElement('btnCancelScreenshot');
    const btnConfirm = this.app.getElement('btnConfirmScreenshot');
    const filenameInput = this.app.getElement<HTMLInputElement>('screenshotFilenameInput');
    const modeCards = modal.querySelectorAll<HTMLElement>('.screenshot-mode-option');

    btnClose?.addEventListener('click', () => this.closeScreenshotDialog());
    btnCancel?.addEventListener('click', () => this.closeScreenshotDialog());

    modal.addEventListener('close', () => {
      modal.returnValue = '';
      try {
        this.app.canvas?.focus();
      } catch {
        // Ignore
      }
    });

    // Fallback light-dismiss for browsers without native closedby support
    if (typeof HTMLDialogElement !== 'undefined' && !('closedBy' in HTMLDialogElement.prototype)) {
      const isOutside = (e: PointerEvent) => {
        const rect = modal.getBoundingClientRect();
        return e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom;
      };
      let pressedOutside = false;
      modal.addEventListener('pointerdown', (e) => {
        pressedOutside = isOutside(e);
      });
      modal.addEventListener('pointerup', (e) => {
        if (pressedOutside && isOutside(e)) {
          this.closeScreenshotDialog();
        }
      });
    }

    modeCards.forEach((card) => {
      card.addEventListener('click', () => {
        const mode = card.getAttribute('data-mode') as ScreenshotMode | null;
        if (!mode) return;
        this.setScreenshotMode(mode);
      });
    });

    btnConfirm?.addEventListener('click', () => {
      this.confirmScreenshot();
    });

    filenameInput?.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.confirmScreenshot();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.closeScreenshotDialog();
      }
    });
  }

  public setScreenshotMode(mode: ScreenshotMode): void {
    this.selectedScreenshotMode = mode;
    const modal = this.app.getElement<HTMLDialogElement>('screenshotModal');
    if (!modal) return;

    const modeCards = modal.querySelectorAll<HTMLElement>('.screenshot-mode-option');
    modeCards.forEach((card) => {
      const cardMode = card.getAttribute('data-mode');
      const isSelected = cardMode === mode;
      card.classList.toggle('active', isSelected);
      const radio = card.querySelector<HTMLInputElement>('input[type="radio"]');
      if (radio) radio.checked = isSelected;
    });

    const badge = this.app.getElement('screenshotExtensionBadge');
    if (badge) {
      badge.textContent = mode === 'current' ? '.jpg' : '.zip';
    }
  }

  public openScreenshotDialog(): void {
    const modal = this.app.getElement<HTMLDialogElement>('screenshotModal');
    if (!modal) return;

    const filenameInput = this.app.getElement<HTMLInputElement>('screenshotFilenameInput');
    if (filenameInput) {
      filenameInput.value = this.app.service.getSuggestedScreenshotName();
    }

    this.setScreenshotMode(this.selectedScreenshotMode || 'current');

    if (typeof modal.showModal === 'function') {
      try {
        if (!modal.open) {
          modal.showModal();
        }
      } catch {
        modal.setAttribute('open', '');
      }
    } else {
      modal.setAttribute('open', '');
    }

    this.app.refreshIcons();

    setTimeout(() => {
      if (filenameInput) {
        filenameInput.focus();
        filenameInput.select();
      }
    }, 50);
  }

  public closeScreenshotDialog(): void {
    const modal = this.app.getElement<HTMLDialogElement>('screenshotModal');
    if (!modal) return;

    if (typeof modal.close === 'function') {
      try {
        if (modal.open) {
          modal.close();
        }
      } catch {
        modal.removeAttribute('open');
      }
    } else {
      modal.removeAttribute('open');
    }

    try {
      this.app.canvas?.focus();
    } catch {
      // Ignore
    }
  }

  private confirmScreenshot(): void {
    const filenameInput = this.app.getElement<HTMLInputElement>('screenshotFilenameInput');
    const rawFilename = (filenameInput?.value || '').trim();
    const modal = this.app.getElement<HTMLDialogElement>('screenshotModal');
    const activeCard = modal?.querySelector<HTMLElement>('.screenshot-mode-option.active');
    const mode = (activeCard?.getAttribute('data-mode') || this.selectedScreenshotMode || 'current') as ScreenshotMode;

    try {
      const result = this.app.service.captureScreenshots(mode, rawFilename);
      this.closeScreenshotDialog();
      this.app.triggerDownloadBlob(result.blob, result.filename);

      if (result.count === 1) {
        this.app.showToast(`Screenshot "${result.filename}" downloaded.`, 'success');
      } else {
        this.app.showToast(`${result.count}-direction screenshots downloaded as "${result.filename}".`, 'success');
      }
    } catch (err: any) {
      console.error('[MeshEditorApp] Screenshot capture failed:', err);
      this.closeScreenshotDialog();
      this.app.showToast(`Screenshot failed: ${err?.message || err}`, 'error');
    }
  }
}
