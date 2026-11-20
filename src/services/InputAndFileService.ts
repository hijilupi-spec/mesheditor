import type { MeshEditorAppHost } from './MeshEditorAppHost';

export class InputAndFileService {
  constructor(private readonly app: MeshEditorAppHost) {}

  public initTouchViewportControls(): void {
    const btnOrbit = this.app.getElement<HTMLButtonElement>('btnTouchModeOrbit');
    const btnRect = this.app.getElement<HTMLButtonElement>('btnTouchModeRect');
    const btnMulti = this.app.getElement<HTMLButtonElement>('btnTouchMultiSelect');
    const btnSnap = this.app.getElement<HTMLButtonElement>('btnTouchSnap');
    const btnFocus = this.app.getElement<HTMLButtonElement>('btnTouchFocus');

    btnOrbit?.addEventListener('click', () => {
      this.app.service.setTouchDragMode('orbit');
      this.updateTouchViewportControls();
    });

    btnRect?.addEventListener('click', () => {
      this.app.service.setTouchDragMode('marquee');
      this.updateTouchViewportControls();
    });

    btnMulti?.addEventListener('click', () => {
      this.app.service.setTouchMultiSelectActive(!this.app.service.touchMultiSelectActive);
      this.updateTouchViewportControls();
    });

    btnSnap?.addEventListener('click', () => {
      this.app.service.setTouchSnapActive(!this.app.service.touchSnapActive);
      this.updateTouchViewportControls();
    });

    btnFocus?.addEventListener('click', () => {
      this.app.service.focusOnSelected();
    });

    this.updateTouchViewportControls();
  }

  public updateTouchViewportControls(): void {
    const btnOrbit = this.app.getElement<HTMLButtonElement>('btnTouchModeOrbit');
    const btnRect = this.app.getElement<HTMLButtonElement>('btnTouchModeRect');
    const btnMulti = this.app.getElement<HTMLButtonElement>('btnTouchMultiSelect');
    const btnSnap = this.app.getElement<HTMLButtonElement>('btnTouchSnap');

    btnOrbit?.classList.toggle('active', this.app.service.touchDragMode === 'orbit');
    btnRect?.classList.toggle('active', this.app.service.touchDragMode === 'marquee');
    btnMulti?.classList.toggle('active', this.app.service.touchMultiSelectActive);
    btnSnap?.classList.toggle('active', this.app.service.touchSnapActive || this.app.service.isSnapModifierActive);
  }

  public initFileHandling(): void {
    this.app.modelFileInput?.addEventListener('change', (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files && files.length > 0) {
        this.app.service.loadFiles(Array.from(files));
      }
    });

    this.app.importFileInput?.addEventListener('change', (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files && files.length > 0) {
        this.app.service.importFiles(Array.from(files));
      }
    });

    this.app.textureFileInput?.addEventListener('change', async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        await this.app.service.replaceSelectedTexture(file);
        this.app.updateMaterialGUI();
      }
    });

    this.app.bumpFileInput?.addEventListener('change', (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        this.app.service.applyBumpTextureToSelectedMaterial(file);
        this.app.updateMaterialGUI();
      }
    });

    // Drag & Drop
    const dropZone = document.getElementById('dropOverlay') || document.getElementById('drop-zone');

    this.app.addGlobalListener(window, 'dragover', (e) => {
      // Do not activate file drop overlay if an internal tool is being reordered or AI is generating
      if (this.app.currentDraggedStackpanelDialog || this.app.currentDraggedDockDialogId || this.app.isAIGenerating) {
        if (dropZone) dropZone.classList.remove('active');
        return;
      }

      // Check whether files are actively being dragged into the window from the OS
      const types = e.dataTransfer?.types;
      const isFileDrag = types ? Array.from(types).includes('Files') : false;
      if (!isFileDrag) {
        if (dropZone) dropZone.classList.remove('active');
        return;
      }

      e.preventDefault();
      if (dropZone) dropZone.classList.add('active');
    });

    this.app.addGlobalListener(window, 'dragleave', (e) => {
      if (e.clientX <= 0 || e.clientY <= 0) {
        if (dropZone) dropZone.classList.remove('active');
      }
    });

    const readEntriesPromise = (reader: any): Promise<any[]> =>
      new Promise((resolve) => {
        reader.readEntries(
          (entries: any[]) => resolve(entries || []),
          () => resolve([])
        );
      });

    const traverseEntry = async (entry: any, pathPrefix = ''): Promise<File[]> => {
      const collected: File[] = [];
      if (!entry) return collected;
      if (entry.name && entry.name.startsWith('.')) return collected;

      if (entry.isFile) {
        try {
          const file = await new Promise<File>((resolve, reject) => entry.file(resolve, reject));
          if (file.name.startsWith('.')) return collected;
          const relPath = pathPrefix ? `${pathPrefix}/${file.name}` : file.name;
          (file as any).correctName = relPath;
          collected.push(file);
        } catch {
          // Skip unreadable file
        }
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        const currentDir = pathPrefix ? `${pathPrefix}/${entry.name}` : entry.name;
        let batch: any[] = [];
        do {
          batch = await readEntriesPromise(reader);
          for (const child of batch) {
            const sub = await traverseEntry(child, currentDir);
            collected.push(...sub);
          }
        } while (batch.length > 0);
      }
      return collected;
    };

    this.app.addGlobalListener(window, 'drop', async (e) => {
      if (dropZone) dropZone.classList.remove('active');
      if (this.app.currentDraggedStackpanelDialog || this.app.currentDraggedDockDialogId || this.app.isAIGenerating) return;
      const types = e.dataTransfer?.types;
      const isFileDrag = types ? Array.from(types).includes('Files') : false;
      if (!isFileDrag) return;

      e.preventDefault();

      // CRITICAL: Extract all FileSystemEntries synchronously BEFORE any 'await' calls!
      // Otherwise Chromium/WebKit clears e.dataTransfer.items on the next event loop tick.
      const entries: any[] = [];
      const directFiles: File[] = [];

      const items = e.dataTransfer?.items;
      if (items && items.length > 0) {
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (item.kind && item.kind !== 'file') continue;
          const entry = (item as any).getAsEntry?.() || (item as any).webkitGetAsEntry?.();
          if (entry) {
            entries.push(entry);
          } else {
            const f = item.getAsFile?.();
            if (f && !f.name.startsWith('.')) directFiles.push(f);
          }
        }
      } else if (e.dataTransfer?.files) {
        directFiles.push(...Array.from(e.dataTransfer.files).filter((f) => !f.name.startsWith('.')));
      }

      const files: File[] = [...directFiles];
      for (const entry of entries) {
        const entryFiles = await traverseEntry(entry);
        files.push(...entryFiles);
      }

      const validFiles = files.filter((f) => !f.name.startsWith('.'));
      if (validFiles.length === 0) return;

      const modelExtensions = ['.glb', '.gltf', '.obj', '.stl', '.ply', '.fbx', '.dae', '.babylon'];
      const imageExtensions = ['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif', '.dds', '.ktx2'];

      const hasModel = validFiles.some((f) => {
        const ext = '.' + (f.name.split('.').pop() || '').toLowerCase();
        return modelExtensions.includes(ext);
      });

      const allImages = validFiles.every((f) => {
        const ext = '.' + (f.name.split('.').pop() || '').toLowerCase();
        return imageExtensions.includes(ext);
      });

      // If only textures/images were dropped (e.g. Textures folder or texture images):
      // Apply them to the current scene without wiping out the model!
      if (!hasModel && allImages) {
        await this.app.service.applyDroppedTextures(validFiles);
        return;
      }

      if (e.shiftKey) {
        await this.app.service.importFiles(validFiles);
      } else {
        await this.app.service.loadFiles(validFiles);
      }
    });
  }

  public initKeyboardShortcuts(): void {
    const isNavigationKey = (key: string, e: KeyboardEvent): boolean => {
      if (e.ctrlKey || e.metaKey || e.altKey) return false;
      return (
        key === 'w' ||
        key === 'a' ||
        key === 's' ||
        key === 'd' ||
        key === 'arrowup' ||
        key === 'arrowdown' ||
        key === 'arrowleft' ||
        key === 'arrowright'
      );
    };

    this.app.addGlobalListener(window, 'keydown', (e: KeyboardEvent) => {
      const settingsModal = this.app.getElement<HTMLDialogElement>('settingsModal');
      if (settingsModal?.open) {
        if (e.key === 'Escape') {
          this.app.closeSettingsModal();
        }
        return;
      }

      const screenshotModal = this.app.getElement<HTMLDialogElement>('screenshotModal');
      const isScreenshotOpen = Boolean(screenshotModal && (screenshotModal.open || screenshotModal.hasAttribute('open')));
      if (isScreenshotOpen) {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'p') {
          e.preventDefault();
        } else if (e.key === 'Escape') {
          this.app.closeScreenshotDialog();
        }
        return;
      }

      const heightmapPaintModal = this.app.getElement<HTMLElement>('heightmapPaintModal');
      if (heightmapPaintModal && heightmapPaintModal.style.display !== 'none' && heightmapPaintModal.style.display !== '') {
        const lowerKey = e.key.toLowerCase();
        if ((e.metaKey || e.ctrlKey) && lowerKey === 'z') {
          e.preventDefault();
          if (e.shiftKey) this.app.service.redo();
          else this.app.service.undo();
          return;
        }
        if ((e.metaKey || e.ctrlKey) && lowerKey === 'y') {
          e.preventDefault();
          this.app.service.redo();
          return;
        }
        if (e.key === 'Escape') {
          this.app.getElement('btnCancelHeightmapPaint')?.click();
        }
        return;
      }

      const activeEl = document.activeElement;
      if (
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'SELECT' ||
          activeEl.tagName === 'TEXTAREA' ||
          (activeEl as HTMLElement).isContentEditable)
      ) {
        return;
      }

      const targetEl = e.target instanceof HTMLElement ? e.target : null;
      const inDropdownMenu =
        this.app.isMenuPopoverOpen(this.app.getElement('menuTools')) ||
        Boolean(document.querySelector('.dropdown-wrapper.open')) ||
        Boolean((activeEl as HTMLElement | null)?.closest?.('.dropdown-menu')) ||
        Boolean(targetEl?.closest?.('.dropdown-menu'));
      if (inDropdownMenu && e.key !== 'Escape') {
        return;
      }

      const key = e.key.toLowerCase();

      // Ensure WASD / Arrow camera navigation works even if canvas lost focus (e.g. clicked toolbar button or UI)
      if (isNavigationKey(key, e)) {
        if (document.activeElement !== this.app.canvas) {
          try {
            this.app.canvas?.focus();
          } catch {
            // Ignore
          }
          if (e.target !== this.app.canvas) {
            const forwardEvent = new KeyboardEvent(e.type, {
              key: e.key,
              code: e.code,
              keyCode: e.keyCode,
              which: e.which,
              bubbles: true,
              cancelable: true,
            });
            this.app.canvas?.dispatchEvent(forwardEvent);
          }
        }
        // Camera navigation takes absolute precedence: bare WASD and arrow keys never trigger tool shortcuts!
        return;
      }

      // Prevent repetitive rapid firing when keys are held down
      if (e.repeat) return;

      if (e.key === 'Meta' || e.key === 'Control' || e.metaKey || e.ctrlKey) {
        this.app.service.setSnapModifierActive(true);
      }

      if (this.app.isAIGenerating) {
        if (e.key === 'Escape') {
          this.app.closeAllDropdowns();
          this.app.closeExportDialog();
          this.app.closeScreenshotDialog();
          this.app.closeAboutModal();
        } else if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && key === 'p') {
          e.preventDefault();
          this.app.openScreenshotDialog();
        } else if (key === 'f' && !e.ctrlKey && !e.metaKey && !e.altKey) {
          this.app.service.focusOnSelected();
        } else if ((e.metaKey || e.ctrlKey) && key === 'z') {
          e.preventDefault();
        } else if ((e.metaKey || e.ctrlKey) && (key === 'y' || key === 'g' || key === 'v' || key === 'd')) {
          e.preventDefault();
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
        }
        return;
      }

      // Undo / Redo
      if ((e.metaKey || e.ctrlKey) && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) this.app.service.redo();
        else this.app.service.undo();
      } else if ((e.metaKey || e.ctrlKey) && key === 'y') {
        e.preventDefault();
        this.app.service.redo();
      } else if ((e.metaKey || e.ctrlKey) && key === 'g') {
        e.preventDefault();
        if (e.shiftKey) this.app.service.ungroupSelected();
        else this.app.service.groupSelected();
      } else if ((e.metaKey || e.ctrlKey) && key === 'c') {
        e.preventDefault();
        this.app.service.copySelected();
      } else if ((e.metaKey || e.ctrlKey) && key === 'v') {
        e.preventDefault();
        this.app.service.pasteAtCursor();
      } else if ((e.metaKey || e.ctrlKey) && key === 'd') {
        e.preventDefault();
        this.app.service.duplicateSelectedMesh();
      } else if ((e.metaKey || e.ctrlKey) && key === 'e') {
        e.preventDefault();
        this.app.openExportDialog();
      } else if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && key === 'p') {
        e.preventDefault();
        this.app.openScreenshotDialog();
      } else if (this.app.service.facetEditorActive && this.app.service.selectedFaceId !== null && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (!e.shiftKey && key === 'x') {
          e.preventDefault();
          this.app.facetParams.extrudeNow();
        } else if (!e.shiftKey && key === 'i') {
          e.preventDefault();
          this.app.facetParams.insetNow();
        } else if (e.shiftKey && key === 'a') {
          e.preventDefault();
          this.app.facetParams.arcNow();
        } else if (!e.shiftKey && key === 'c') {
          e.preventDefault();
          this.app.facetParams.knifeNow();
        } else if (e.shiftKey && key === 'e') {
          e.preventDefault();
          this.app.facetParams.loopCutNow();
        } else if (!e.shiftKey && (key === '-' || key === '_')) {
          e.preventDefault();
          this.app.facetParams.bevelNow();
        } else if (!e.shiftKey && key === 'h') {
          e.preventDefault();
          this.app.facetParams.solidifyNow();
        } else if (!e.shiftKey && key === 't') {
          e.preventDefault();
          this.app.facetParams.cutThroughNow();
        } else if (!e.shiftKey && key === 'v') {
          e.preventDefault();
          this.app.facetParams.relaxNow();
        } else if (!e.shiftKey && key === 'k') {
          e.preventDefault();
          this.app.facetParams.subdivideNow();
        } else if (e.shiftKey && key === 's') {
          e.preventDefault();
          this.app.facetParams.subDNow();
        } else if (!e.shiftKey && key === 'n') {
          e.preventDefault();
          this.app.facetParams.flipNormal();
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          this.app.facetParams.deleteFacet();
        }
      } else if (key === 'm') {
        document.getElementById('btnGizmoTranslate')?.click();
      } else if (key === 'e') {
        document.getElementById('btnGizmoRotate')?.click();
      } else if (key === 'r') {
        document.getElementById('btnGizmoScale')?.click();
      } else if (key === 'b') {
        document.getElementById('btnGizmoBounds')?.click();
      } else if (key === 'f') {
        this.app.service.focusOnSelected();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        this.app.service.deleteSelected();
      } else if (e.key === 'Escape') {
        if (this.app.lastEscapeClosedOverlayEvent === e) {
          this.app.lastEscapeClosedOverlayEvent = null;
          return;
        }
        if (this.app.service.consumeMarqueeEscape(e)) {
          return;
        }

        const hadOpenOverlay =
          inDropdownMenu ||
          Boolean(this.app.getElement('exportModal')?.classList.contains('active')) ||
          Boolean((this.app.getElement('aboutModal') || document.getElementById('aboutModal'))?.classList.contains('active')) ||
          Boolean((this.app.getElement('helpModal') || document.getElementById('helpModal'))?.classList.contains('active')) ||
          Boolean(this.app.getElement('toolHelpModal')?.classList.contains('active')) ||
          Boolean((this.app.getElement('promptHelpModal') || document.getElementById('promptHelpModal'))?.classList.contains('active')) ||
          Boolean(this.app.getElement('heightmapPaintModal')?.classList.contains('active'));

        this.app.closeAllDropdowns();
        this.app.closeExportDialog();
        this.app.closeAboutModal();
        this.app.closeHelpModal();
        this.app.hidePromptHelp();

        if (hadOpenOverlay) {
          return;
        }

        if (this.app.service.isPlaceModeActive) {
          this.app.service.cancelPlacementMode();
        }
        this.app.deactivateOtherExclusiveTools(null);
        if (this.app.service.selectedNodes.length > 0 || this.app.service.selectedMesh !== null) {
          this.app.service.selectNodes([]);
        }
        this.app.updatePanelButtonStates();
      }
    });

    this.app.addGlobalListener(window, 'keyup', (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      if (
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'SELECT' ||
          activeEl.tagName === 'TEXTAREA' ||
          (activeEl as HTMLElement).isContentEditable)
      ) {
        return;
      }

      const key = e.key.toLowerCase();
      if (e.key === 'Meta' || e.key === 'Control' || (!e.metaKey && !e.ctrlKey)) {
        this.app.service.setSnapModifierActive(false);
      }
      if (isNavigationKey(key, e) && document.activeElement !== this.app.canvas && e.target !== this.app.canvas) {
        const forwardEvent = new KeyboardEvent(e.type, {
          key: e.key,
          code: e.code,
          keyCode: e.keyCode,
          which: e.which,
          bubbles: true,
          cancelable: true,
        });
        this.app.canvas?.dispatchEvent(forwardEvent);
      }
    });

    this.app.addGlobalListener(window, 'blur', () => {
      this.app.service.setSnapModifierActive(false);
    });
  }
}
