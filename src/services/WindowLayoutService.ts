import type { ToolInterface } from '../tools';
import type { AppLayoutMode as LayoutMode, MeshEditorAppHost } from './MeshEditorAppHost';

export class WindowLayoutService {
  private currentDraggedStackpanelDialog: HTMLElement | null = null;
  private justFinishedStackpanelDrag: boolean = false;
  private currentDraggedDockDialogId: string | null = null;
  private justFinishedDockDrag: boolean = false;
  public onFullscreenChangeHandler: (() => void) | null = null;

  constructor(private readonly app: MeshEditorAppHost) {}

  public dispose(): void {
    if (this.onFullscreenChangeHandler && typeof document !== 'undefined') {
      document.removeEventListener('fullscreenchange', this.onFullscreenChangeHandler);
      document.removeEventListener('webkitfullscreenchange', this.onFullscreenChangeHandler);
      this.onFullscreenChangeHandler = null;
    }
  }

  public isDialogOpen(dialogId: string): boolean {
    const dialog = this.app.getElement(dialogId);
    if (!dialog) return false;
    return (
      dialog.style.display !== 'none' &&
      (dialog.style.display !== '' || window.getComputedStyle(dialog).display !== 'none')
    );
  }

  public isFullscreenActive(): boolean {
    if (typeof document === 'undefined') return false;
    const doc = document as Document & { webkitFullscreenElement?: Element | null };
    return Boolean(doc.fullscreenElement || doc.webkitFullscreenElement);
  }

  public async toggleFullscreen(): Promise<void> {
    if (typeof document === 'undefined') return;
    const doc = document as Document & {
      webkitFullscreenElement?: Element | null;
      webkitExitFullscreen?: () => Promise<void> | void;
    };

    try {
      if (this.isFullscreenActive()) {
        if (typeof doc.exitFullscreen === 'function') {
          await doc.exitFullscreen();
        } else if (typeof doc.webkitExitFullscreen === 'function') {
          await doc.webkitExitFullscreen();
        }
      } else {
        const isWebComponent = Boolean(this.app.rootContainer?.closest('mesh-editor'));
        const target = (isWebComponent ? this.app.rootContainer : document.documentElement) as HTMLElement & {
          webkitRequestFullscreen?: () => Promise<void> | void;
        };
        if (typeof target?.requestFullscreen === 'function') {
          await target.requestFullscreen();
        } else if (typeof target?.webkitRequestFullscreen === 'function') {
          await target.webkitRequestFullscreen();
        } else {
          this.app.showToast('Fullscreen mode is not supported in this browser.', 'warning');
          return;
        }
      }
      this.updateFullscreenButtonState();
      this.app.service.engine?.resize();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.app.showToast(`Failed to toggle fullscreen: ${msg}`, 'error');
    }
  }

  public updateFullscreenButtonState(): void {
    const btn = this.app.getElement('btnToggleFullscreen');
    if (!btn) return;
    const active = this.isFullscreenActive();
    btn.classList.toggle('active', active);
    btn.title = active ? 'Exit fullscreen mode' : 'Enter fullscreen mode';
    const prev = btn.dataset.fullscreen === 'true';
    const iconEl = btn.querySelector('.btn-icon');
    const labelEl = btn.querySelector('.btn-label');
    if (prev === active && iconEl?.querySelector('svg')) return;
    btn.dataset.fullscreen = String(active);
    if (iconEl) {
      iconEl.innerHTML = `<i class="app-icon" data-lucide="${active ? 'minimize' : 'maximize'}"></i>`;
    }
    if (labelEl) {
      labelEl.textContent = active ? 'Exit Fullscreen' : 'Fullscreen';
    }
    this.app.refreshIcons();
  }

  public isSidebarLayoutMode(): boolean {
    return (
      this.app.layoutMode === 'stackpanel' ||
      this.app.layoutMode === 'dock' ||
      document.body.classList.contains('layout-stackpanel') ||
      document.body.classList.contains('layout-dock')
    );
  }

  public setLayoutMode(mode: LayoutMode, save: boolean = true): void {
    this.app.layoutMode = mode;
    this.app.tooltipManager?.hideAll(0);
    if (save) {
      localStorage.setItem('mesheditor_layout_mode', mode);
    }
    const btnFloating = this.app.getElement('btnLayoutFloating');
    const btnStack = this.app.getElement('btnLayoutStack');
    const btnDock = this.app.getElement('btnLayoutDock');
    if (btnFloating) btnFloating.classList.toggle('active', mode === 'floating');
    if (btnStack) btnStack.classList.toggle('active', mode === 'stackpanel');
    if (btnDock) btnDock.classList.toggle('active', mode === 'dock');

    const isSidebar = mode === 'stackpanel' || mode === 'dock';
    document.body.classList.toggle('layout-stackpanel', mode === 'stackpanel');
    this.app.rootContainer?.classList.toggle('layout-stackpanel', mode === 'stackpanel');
    document.body.classList.toggle('layout-dock', mode === 'dock');
    this.app.rootContainer?.classList.toggle('layout-dock', mode === 'dock');

    const sidebarPanels = Array.from(
      (this.app.rootContainer || document).querySelectorAll('.stackpanel-sidebar .floating-dialog')
    ) as HTMLElement[];

    if (isSidebar) {
      this.restoreStackpanelOrder();
      sidebarPanels.forEach((p) => {
        const h = p.querySelector('.dialog-header');
        if (mode === 'stackpanel') {
          h?.setAttribute('draggable', 'true');
        } else {
          h?.removeAttribute('draggable');
        }
      });
      const openPanels = sidebarPanels.filter((d) => d.style.display !== 'none');
      if (openPanels.length > 0) {
        // Ensure every open panel has explicit inline display so Dock CSS hiding never confuses layout state
        openPanels.forEach((d) => {
          if (!d.style.display) d.style.display = 'flex';
        });
        // Find if one is already expanded, or take the first open one
        const expanded = openPanels.find((d) => !d.classList.contains('minimized')) || openPanels[0];
        expanded.classList.remove('minimized');
        const btnMin = expanded.querySelector('.btn-min') as HTMLElement | null;
        if (btnMin) {
          btnMin.innerHTML = '<i class="app-icon" data-lucide="minus"></i>';
          btnMin.title = 'Minimize';
        }
        this.accordionMinimizeOthers(expanded);
      }
      if (save) {
        this.app.showToast(
          mode === 'dock' ? 'Switched to Dock layout' : 'Switched to Stackpanel sidebar layout',
          'info'
        );
      }
      const outliner = this.app.getElement('dialog-outliner');
      if (outliner) {
        if (outliner.classList.contains('minimized')) {
          outliner.style.bottom = 'auto';
          outliner.style.height = 'auto';
        } else {
          outliner.style.bottom = '';
          outliner.style.height = '';
        }
      }
    } else {
      sidebarPanels.forEach((p) => {
        const h = p.querySelector('.dialog-header');
        h?.removeAttribute('draggable');
      });
      this.restoreDialogLayout();
      if (save) {
        this.app.showToast('Switched to Floating windows layout', 'info');
      }
    }
    this.renderDockToolbar();
    this.updateStackpanelDrawerUI();
    this.app.updatePanelButtonStates();
  }

  public renderDockToolbar(): void {
    const dockSlot = this.app.getElement('dockToolBarSlot') || document.getElementById('dockToolBarSlot');
    const dockBar = this.app.getElement('dockToolBar') || document.getElementById('dockToolBar');
    const sidebar = this.app.getElement('stackpanelRightSidebar') || document.getElementById('stackpanelRightSidebar');
    if (!dockBar || !sidebar) return;

    const openDialogs = (Array.from(sidebar.querySelectorAll(':scope > .floating-dialog')) as HTMLElement[]).filter(
      (d) => d.style.display !== 'none'
    );

    const isEmpty = openDialogs.length === 0;
    dockBar.classList.toggle('is-empty', isEmpty);
    dockSlot?.classList.toggle('is-empty', isEmpty);

    if (openDialogs.length === 0) {
      if (dockBar.dataset.renderedKey !== '') {
        dockBar.innerHTML = '';
        dockBar.dataset.renderedKey = '';
      }
      return;
    }

    const activeDialog = openDialogs.find((d) => !d.classList.contains('minimized')) || null;
    const activeId = activeDialog?.id || '';

    const key = openDialogs.map((d) => d.id).join('|');
    if (dockBar.dataset.renderedKey === key) {
      const buttons = dockBar.querySelectorAll<HTMLButtonElement>('.dock-tool-btn');
      buttons.forEach((btn) => {
        const isActive = btn.dataset.dialogId === activeId;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-selected', String(isActive));
      });
      return;
    }

    dockBar.innerHTML = '';
    const fragment = document.createDocumentFragment();

    for (const dialog of openDialogs) {
      const tool = this.app.getToolByDialogId(dialog.id);
      const label =
        tool?.menuLabel ||
        dialog.querySelector('.dialog-title')?.textContent?.trim() ||
        dialog.id;
      const iconName =
        tool?.icon ||
        dialog.querySelector('.dialog-title [data-lucide]')?.getAttribute('data-lucide') ||
        'wrench';
      const isActive = dialog.id === activeId;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = isActive ? 'dock-tool-btn active' : 'dock-tool-btn';
      btn.dataset.dialogId = dialog.id;
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', String(isActive));
      btn.setAttribute('aria-controls', dialog.id);
      btn.setAttribute('aria-label', label);
      btn.setAttribute('title', label);
      btn.setAttribute('data-tippy-placement', 'top');
      btn.draggable = true;
      btn.innerHTML = `<i class="app-icon" data-lucide="${iconName}"></i>`;

      btn.addEventListener('click', () => {
        if (this.justFinishedDockDrag) return;
        this.activateDockTool(dialog.id);
      });

      btn.addEventListener('dragstart', (e: DragEvent) => {
        const isDock = this.app.layoutMode === 'dock' || document.body.classList.contains('layout-dock');
        if (!isDock) {
          e.preventDefault();
          return;
        }
        this.currentDraggedDockDialogId = dialog.id;
        this.justFinishedDockDrag = true;
        btn.classList.add('is-dragging');
        this.app.tooltipManager?.hideAll(0);

        const dropOverlay = document.getElementById('dropOverlay') || document.getElementById('drop-zone');
        if (dropOverlay) dropOverlay.classList.remove('active');

        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', dialog.id);
        }
      });

      btn.addEventListener('dragend', () => {
        this.currentDraggedDockDialogId = null;
        btn.classList.remove('is-dragging');
        this.clearDockDragIndicators();
        const dropOverlay = document.getElementById('dropOverlay') || document.getElementById('drop-zone');
        if (dropOverlay) dropOverlay.classList.remove('active');
        setTimeout(() => {
          this.justFinishedDockDrag = false;
        }, 150);
      });

      fragment.appendChild(btn);
    }

    dockBar.appendChild(fragment);
    dockBar.dataset.renderedKey = key;
    this.app.refreshIcons();
  }

  public clearDockDragIndicators(): void {
    const dockBar = this.app.getElement('dockToolBar') || document.getElementById('dockToolBar');
    if (!dockBar) return;
    dockBar.querySelectorAll('.dock-tool-btn').forEach((b) => {
      b.classList.remove('drag-target-before', 'drag-target-after');
    });
  }

  public initDockDragAndDrop(): void {
    const dockBar = this.app.getElement('dockToolBar') || document.getElementById('dockToolBar');
    if (!dockBar) return;

    dockBar.addEventListener('dragover', (e: DragEvent) => {
      const isDock = this.app.layoutMode === 'dock' || document.body.classList.contains('layout-dock');
      if (!isDock || !this.currentDraggedDockDialogId) return;

      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'move';
      }

      const targetBtn = (e.target as HTMLElement).closest('.dock-tool-btn') as HTMLElement | null;
      if (targetBtn && targetBtn.dataset.dialogId !== this.currentDraggedDockDialogId) {
        const rect = targetBtn.getBoundingClientRect();
        const isAfter = e.clientX - rect.left > rect.width / 2;
        this.clearDockDragIndicators();
        targetBtn.classList.add(isAfter ? 'drag-target-after' : 'drag-target-before');
      } else {
        this.clearDockDragIndicators();
      }
    });

    dockBar.addEventListener('dragenter', (e: DragEvent) => {
      if (this.currentDraggedDockDialogId) {
        e.stopPropagation();
      }
    });

    dockBar.addEventListener('dragleave', (e: DragEvent) => {
      e.stopPropagation();
      if (!e.relatedTarget || !dockBar.contains(e.relatedTarget as globalThis.Node)) {
        this.clearDockDragIndicators();
      }
    });

    dockBar.addEventListener('drop', (e: DragEvent) => {
      const isDock = this.app.layoutMode === 'dock' || document.body.classList.contains('layout-dock');
      if (!isDock) return;

      const draggedId = this.currentDraggedDockDialogId || e.dataTransfer?.getData('text/plain');
      if (!draggedId) return;

      e.preventDefault();
      e.stopPropagation();
      this.clearDockDragIndicators();

      const sidebar = this.app.getElement('stackpanelRightSidebar') || document.getElementById('stackpanelRightSidebar');
      if (!sidebar) return;

      const draggedDialog = Array.from(sidebar.querySelectorAll(':scope > .floating-dialog')).find(
        (d) => d.id === draggedId
      ) as HTMLElement | undefined;
      if (!draggedDialog) return;

      const targetBtn = (e.target as HTMLElement).closest('.dock-tool-btn') as HTMLElement | null;
      const targetDialogId = targetBtn?.dataset.dialogId;
      const targetDialog = targetDialogId
        ? (Array.from(sidebar.querySelectorAll(':scope > .floating-dialog')).find(
            (d) => d.id === targetDialogId
          ) as HTMLElement | undefined)
        : undefined;

      if (targetBtn && targetDialog && targetDialog !== draggedDialog) {
        const rect = targetBtn.getBoundingClientRect();
        const isAfter = e.clientX - rect.left > rect.width / 2;
        if (isAfter) {
          sidebar.insertBefore(draggedDialog, targetDialog.nextSibling);
        } else {
          sidebar.insertBefore(draggedDialog, targetDialog);
        }
      } else if (!targetBtn) {
        sidebar.appendChild(draggedDialog);
      }

      this.currentDraggedDockDialogId = null;
      this.updateStackpanelOrderFromDOM();
      this.justFinishedDockDrag = true;
      setTimeout(() => {
        this.justFinishedDockDrag = false;
      }, 150);
    });
  }

  public activateDockTool(dialogId: string): void {
    const dialog = this.app.getElement(dialogId);
    if (!dialog) return;

    this.app.tooltipManager?.hideAll(0);
    dialog.style.display = 'flex';

    if (this.app.isStackpanelDrawerCollapsed && dialog.closest('.stackpanel-sidebar')) {
      this.setStackpanelDrawerCollapsed(false);
    }

    this.toggleDialogMinimize(dialog, false);
    this.bringDialogToFront(dialog);
    this.renderDockToolbar();
  }

  public toggleStackpanelDrawer(forceCollapsed?: boolean): void {
    const nextState = forceCollapsed !== undefined ? forceCollapsed : !this.app.isStackpanelDrawerCollapsed;
    this.setStackpanelDrawerCollapsed(nextState, true);
  }

  public setStackpanelDrawerCollapsed(collapsed: boolean, save: boolean = true): void {
    this.app.isStackpanelDrawerCollapsed = collapsed;
    if (save) {
      try {
        localStorage.setItem('mesheditor_stackpanel_drawer_collapsed', String(collapsed));
      } catch (e) {
        console.warn('Failed to save stackpanel drawer state to localStorage:', e);
      }
    }
    this.updateStackpanelDrawerUI();
    this.app.refreshIcons();
  }

  public updateStackpanelDrawerUI(): void {
    const isSidebar = this.isSidebarLayoutMode();
    const sidebarHost = this.app.getElement('rightSidebarHost') || document.getElementById('rightSidebarHost');
    const sidebar = this.app.getElement('stackpanelRightSidebar') || document.getElementById('stackpanelRightSidebar');
    const toggleBtn = this.app.getElement('btnStackpanelDrawerToggle') || document.getElementById('btnStackpanelDrawerToggle');

    const hasVisibleDialogs = sidebar
      ? Array.from(sidebar.querySelectorAll(':scope > .floating-dialog')).some(
          (d) => (d as HTMLElement).style.display !== 'none'
        )
      : false;

    const effectiveCollapsed = isSidebar && this.app.isStackpanelDrawerCollapsed && hasVisibleDialogs;

    document.body.classList.toggle('stackpanel-drawer-collapsed', effectiveCollapsed);
    this.app.rootContainer?.classList.toggle('stackpanel-drawer-collapsed', effectiveCollapsed);

    const drawerTarget = this.app.layoutMode === 'dock' && sidebarHost ? sidebarHost : sidebar;
    if (drawerTarget) {
      if (effectiveCollapsed) {
        drawerTarget.setAttribute('aria-hidden', 'true');
        drawerTarget.setAttribute('inert', '');
      } else {
        drawerTarget.removeAttribute('aria-hidden');
        drawerTarget.removeAttribute('inert');
      }
    }
    if (sidebar && sidebar !== drawerTarget) {
      sidebar.removeAttribute('aria-hidden');
      sidebar.removeAttribute('inert');
    }
    if (sidebarHost && sidebarHost !== drawerTarget) {
      sidebarHost.removeAttribute('aria-hidden');
      sidebarHost.removeAttribute('inert');
    }

    if (toggleBtn) {
      toggleBtn.classList.toggle('is-empty', !isSidebar || !hasVisibleDialogs);
      toggleBtn.setAttribute('aria-expanded', String(!effectiveCollapsed));
      const modeName = this.app.layoutMode === 'dock' ? 'dock' : 'stackpanel';
      const label = effectiveCollapsed ? `Expand ${modeName} drawer` : `Minimize ${modeName} to drawer`;
      toggleBtn.title = label;
      toggleBtn.setAttribute('aria-label', label);
      const iconName = effectiveCollapsed ? 'chevron-left' : 'chevron-right';
      if (toggleBtn.getAttribute('data-drawer-icon') !== iconName) {
        toggleBtn.setAttribute('data-drawer-icon', iconName);
        toggleBtn.innerHTML = `<i class="app-icon" data-lucide="${iconName}"></i>`;
        this.app.refreshIcons();
      }
    }
  }

  public setupFloatingDialog(dialog: HTMLElement): void {
    const tool = this.app.getToolByDialogId(dialog.id);
    if (tool && tool.order !== undefined) {
      dialog.style.order = String(tool.order);
    }

    const header = dialog.querySelector('.dialog-header') as HTMLElement;
    const btnClose = dialog.querySelector('.btn-close');
    const btnMin = dialog.querySelector('.btn-min');
    let btnHelp = dialog.querySelector('.btn-help') as HTMLElement | null;
    const title = dialog.querySelector('.dialog-title') as HTMLElement | null;
    const actions = dialog.querySelector('.dialog-actions');

    // Ensure Help button exists directly to the left of Minimize button
    if (!btnHelp && actions && btnMin) {
      btnHelp = document.createElement('button');
      btnHelp.className = 'dialog-btn btn-help';
      btnHelp.title = 'Help & Tool Guide';
      btnHelp.setAttribute('aria-label', 'Help');
      btnHelp.innerHTML = '<i class="app-icon" data-lucide="help-circle"></i>';
      actions.insertBefore(btnHelp, btnMin);
    }

    // Ensure drag handle exists in title for stackpanel reordering
    let dragHandle = header?.querySelector('.dialog-drag-handle') as HTMLElement | null;
    if (!dragHandle && header && title) {
      dragHandle = document.createElement('span');
      dragHandle.className = 'dialog-drag-handle';
      dragHandle.title = 'Drag to reorder tools';
      dragHandle.setAttribute('aria-label', 'Drag to reorder tools');
      dragHandle.innerHTML = '<i class="app-icon" data-lucide="grip-vertical"></i>';
      title.insertBefore(dragHandle, title.firstChild);
    }

    dragHandle?.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    // Configure draggable attribute on header according to current layout mode
    const isStack = this.app.layoutMode === 'stackpanel' || document.body.classList.contains('layout-stackpanel');
    const inSidebar = dialog.closest('.stackpanel-sidebar') !== null;
    if (header) {
      if (isStack && inSidebar) {
        header.setAttribute('draggable', 'true');
      } else {
        header.removeAttribute('draggable');
      }
    }

    btnHelp?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.app.showToolHelp(dialog.id);
    });

    btnClose?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleDialog(dialog.id, false);
    });

    btnMin?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleDialogMinimize(dialog);
    });

    title?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.justFinishedStackpanelDrag) return;
      if (this.app.layoutMode === 'dock' && dialog.closest('.stackpanel-sidebar')) return;
      this.toggleDialogMinimize(dialog);
    });

    // In stackpanel mode, clicking anywhere in header (except buttons and drag handle) toggles collapse
    if (header) {
      header.addEventListener('click', (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (
          target.tagName === 'BUTTON' ||
          target.closest('button') ||
          target.closest('.dialog-btn') ||
          target.closest('.dialog-drag-handle')
        ) {
          return;
        }
        if (this.justFinishedStackpanelDrag) return;
        if (this.app.layoutMode === 'stackpanel') {
          this.toggleDialogMinimize(dialog);
        }
      });
    }

    // Bring to front
    dialog.addEventListener('mousedown', () => {
      this.bringDialogToFront(dialog);
    });

    // Stackpanel Drag & Drop Reordering
    if (header) {
      header.addEventListener('dragstart', (e: DragEvent) => {
        const isCurrentStack =
          this.app.layoutMode === 'stackpanel' || document.body.classList.contains('layout-stackpanel');
        const inSide = dialog.closest('.stackpanel-sidebar') !== null;
        if (!isCurrentStack || !inSide) {
          e.preventDefault();
          return;
        }

        const target = e.target as HTMLElement;
        if (target.tagName === 'BUTTON' || target.closest('button') || target.closest('.dialog-btn')) {
          e.preventDefault();
          return;
        }

        this.currentDraggedStackpanelDialog = dialog;
        this.justFinishedStackpanelDrag = true;
        dialog.classList.add('is-dragging');

        // Ensure file drop overlay is hidden and never triggered for internal tool dragging
        const dropOverlay = document.getElementById('dropOverlay') || document.getElementById('drop-zone');
        if (dropOverlay) dropOverlay.classList.remove('active');

        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', dialog.id);
        }
      });

      header.addEventListener('dragend', () => {
        this.currentDraggedStackpanelDialog = null;
        dialog.classList.remove('is-dragging');
        this.clearStackpanelDragIndicators();
        const dropOverlay = document.getElementById('dropOverlay') || document.getElementById('drop-zone');
        if (dropOverlay) dropOverlay.classList.remove('active');
        setTimeout(() => {
          this.justFinishedStackpanelDrag = false;
        }, 200);
      });
    }

    // Floating Mode 2D Window Dragging (supports mouse & touch via Pointer Events)
    if (header) {
      let isDragging = false;
      let startX = 0;
      let startY = 0;
      let initialLeft = 0;
      let initialTop = 0;

      header.addEventListener('pointerdown', (e: PointerEvent) => {
        if (this.isSidebarLayoutMode()) return;
        if ((e.target as HTMLElement).tagName === 'BUTTON' || (e.target as HTMLElement).closest('.dialog-btn')) return;

        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;

        const rect = dialog.getBoundingClientRect();
        initialLeft = rect.left;
        initialTop = rect.top;

        // Bring to front
        this.bringDialogToFront(dialog);

        const onPointerMove = (moveEvent: PointerEvent) => {
          if (!isDragging) return;
          const deltaX = moveEvent.clientX - startX;
          const deltaY = moveEvent.clientY - startY;

          let newLeft = Math.max(0, Math.min(window.innerWidth - dialog.offsetWidth, initialLeft + deltaX));
          let newTop = Math.max(54, Math.min(window.innerHeight - 36, initialTop + deltaY));

          dialog.style.left = `${newLeft}px`;
          dialog.style.top = `${newTop}px`;
          dialog.style.right = 'auto';
          dialog.style.bottom = 'auto';
          dialog.style.transform = 'none';
        };

        const onPointerUp = () => {
          if (isDragging) {
            isDragging = false;
            this.saveDialogLayout();
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerUp);
            window.removeEventListener('pointercancel', onPointerUp);
          }
        };

        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
        window.addEventListener('pointercancel', onPointerUp);
      });
    }
  }

  public clearStackpanelDragIndicators(): void {
    const container = this.app.getElement('stackpanelRightSidebar') || document.getElementById('stackpanelRightSidebar');
    if (!container) return;
    const dialogs = container.querySelectorAll('.floating-dialog');
    dialogs.forEach((d) => d.classList.remove('drag-target-above', 'drag-target-below'));
  }

  public initStackpanelDragAndDrop(): void {
    const container = this.app.getElement('stackpanelRightSidebar') || document.getElementById('stackpanelRightSidebar');
    if (!container) return;

    container.addEventListener('dragover', (e: DragEvent) => {
      const isStack = this.app.layoutMode === 'stackpanel' || document.body.classList.contains('layout-stackpanel');
      if (!isStack || !this.currentDraggedStackpanelDialog) return;

      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'move';
      }

      const targetDialog = (e.target as HTMLElement).closest('.stackpanel-sidebar .floating-dialog') as HTMLElement | null;
      if (targetDialog && targetDialog !== this.currentDraggedStackpanelDialog) {
        const rect = targetDialog.getBoundingClientRect();
        const isAfter = e.clientY - rect.top > rect.height / 2;
        this.clearStackpanelDragIndicators();
        if (isAfter) {
          targetDialog.classList.add('drag-target-below');
        } else {
          targetDialog.classList.add('drag-target-above');
        }
      } else {
        this.clearStackpanelDragIndicators();
      }
    });

    container.addEventListener('dragenter', (e: DragEvent) => {
      e.stopPropagation();
    });

    container.addEventListener('dragleave', (e: DragEvent) => {
      e.stopPropagation();
      if (!e.relatedTarget || !container.contains(e.relatedTarget as any)) {
        this.clearStackpanelDragIndicators();
      }
    });

    container.addEventListener('drop', (e: DragEvent) => {
      const isStack = this.app.layoutMode === 'stackpanel' || document.body.classList.contains('layout-stackpanel');
      if (!isStack) return;

      e.preventDefault();
      e.stopPropagation();
      this.clearStackpanelDragIndicators();

      const draggedId = e.dataTransfer?.getData('text/plain');
      const draggedEl =
        this.currentDraggedStackpanelDialog ||
        (draggedId ? container.querySelector<HTMLElement>(`#${draggedId}`) : null);

      if (!draggedEl) return;

      const targetDialog = (e.target as HTMLElement).closest('.stackpanel-sidebar .floating-dialog') as HTMLElement | null;
      if (targetDialog && targetDialog !== draggedEl) {
        const rect = targetDialog.getBoundingClientRect();
        const isAfter = e.clientY - rect.top > rect.height / 2;
        if (isAfter) {
          container.insertBefore(draggedEl, targetDialog.nextSibling);
        } else {
          container.insertBefore(draggedEl, targetDialog);
        }
      } else if (!targetDialog) {
        container.appendChild(draggedEl);
      }

      this.currentDraggedStackpanelDialog = null;
      this.updateStackpanelOrderFromDOM();
      this.justFinishedStackpanelDrag = true;
      setTimeout(() => {
        this.justFinishedStackpanelDrag = false;
      }, 200);
    });
  }

  public updateStackpanelOrderFromDOM(): void {
    const container = this.app.getElement('stackpanelRightSidebar') || document.getElementById('stackpanelRightSidebar');
    if (!container) return;

    const dialogs = Array.from(container.querySelectorAll(':scope > .floating-dialog')) as HTMLElement[];
    dialogs.forEach((dialog, index) => {
      dialog.style.order = String(index);
      const tool = this.app.getToolByDialogId(dialog.id);
      if (tool) {
        (tool as any).order = index + 2; // Offset 2 so Outliner remains #1
      }
    });

    this.saveStackpanelOrder();
    this.app.renderToolsMenu();
    this.renderDockToolbar();
  }

  public saveStackpanelOrder(): void {
    const container = this.app.getElement('stackpanelRightSidebar') || document.getElementById('stackpanelRightSidebar');
    if (!container) return;

    try {
      const dialogs = Array.from(container.querySelectorAll(':scope > .floating-dialog')) as HTMLElement[];
      const orderList = dialogs.map((d) => d.id).filter(Boolean);
      localStorage.setItem('mesheditor_stackpanel_order', JSON.stringify(orderList));
    } catch (e) {
      console.warn('Failed to save stackpanel order to localStorage:', e);
    }
  }

  public restoreStackpanelOrder(): void {
    const container = this.app.getElement('stackpanelRightSidebar') || document.getElementById('stackpanelRightSidebar');
    if (!container) return;

    try {
      const saved = localStorage.getItem('mesheditor_stackpanel_order');
      if (saved) {
        const orderList: string[] = JSON.parse(saved);
        if (Array.isArray(orderList) && orderList.length > 0) {
          const dialogs = Array.from(container.querySelectorAll(':scope > .floating-dialog')) as HTMLElement[];
          const dialogMap = new Map<string, HTMLElement>();
          for (const d of dialogs) {
            if (d.id) dialogMap.set(d.id, d);
          }

          let orderIndex = 0;
          for (const id of orderList) {
            const dialog = dialogMap.get(id);
            if (dialog) {
              container.appendChild(dialog);
              dialog.style.order = String(orderIndex);
              const tool = this.app.getToolByDialogId(id);
              if (tool) {
                (tool as any).order = orderIndex + 2;
              }
              dialogMap.delete(id);
              orderIndex++;
            }
          }

          for (const [, dialog] of dialogMap) {
            container.appendChild(dialog);
            dialog.style.order = String(orderIndex);
            const tool = this.app.getToolByDialogId(dialog.id);
            if (tool) {
              (tool as any).order = orderIndex + 2;
            }
            orderIndex++;
          }

          this.app.renderToolsMenu();
          this.renderDockToolbar();
          return;
        }
      }
    } catch (e) {
      console.warn('Failed to restore stackpanel order from localStorage:', e);
    }

    // If no order is saved in localStorage, sort container children by initial tool.order
    const dialogs = Array.from(container.querySelectorAll(':scope > .floating-dialog')) as HTMLElement[];
    dialogs.sort((a, b) => {
      const toolA = this.app.getToolByDialogId(a.id);
      const toolB = this.app.getToolByDialogId(b.id);
      const orderA = toolA?.order ?? 999;
      const orderB = toolB?.order ?? 999;
      return orderA - orderB;
    });
    dialogs.forEach((dialog, index) => {
      container.appendChild(dialog);
      dialog.style.order = String(index);
    });
  }

  public isCompactViewport(): boolean {
    const containerWidth = this.app.rootContainer?.clientWidth;
    const width =
      containerWidth && containerWidth > 0
        ? containerWidth
        : typeof window !== 'undefined'
        ? window.innerWidth
        : 1280;
    return width <= 1024;
  }

  public applyDialogMinimizedState(dialog: HTMLElement, minimized: boolean): void {
    dialog.classList.toggle('minimized', minimized);
    if (minimized) {
      dialog.classList.remove('active-focus');
    }
    if (dialog.id === 'dialog-outliner') {
      if (minimized) {
        dialog.style.bottom = 'auto';
        dialog.style.height = 'auto';
      } else {
        dialog.style.bottom = '';
        dialog.style.height = '';
      }
    }
    const btnMin = dialog.querySelector('.btn-min') as HTMLElement | null;
    if (btnMin) {
      btnMin.innerHTML = `<i class="app-icon" data-lucide="${minimized ? 'plus' : 'minus'}"></i>`;
      btnMin.title = minimized ? 'Expand' : 'Minimize';
      if (minimized) {
        btnMin.blur();
      }
    }
  }

  public deactivateOtherExclusiveTools(exceptTool?: ToolInterface | null): void {
    for (const other of this.app.editorTools) {
      if (other !== exceptTool && other.isExclusive3DTool) {
        other.onDeactivate?.(this.app);
      }
    }
    if (this.app.service.textMeshController?.isSurfacePlacementActive) {
      this.app.service.textMeshController.setSurfacePlacementActive(false);
    }
  }

  public activateExclusive3DTool(toolName: string): void {
    if (this.app.isAIGenerating) return;
    const targetTool = this.app.getToolByName(toolName);
    if (targetTool) {
      this.deactivateOtherExclusiveTools(targetTool);
      targetTool.onActivate?.(this.app);
    }
    this.app.updatePanelButtonStates();
  }

  public toggleDialogMinimize(dialog: HTMLElement, forceState?: boolean): void {
    const isCurrentlyMin = dialog.classList.contains('minimized');
    const willBeMin = forceState !== undefined ? forceState : !isCurrentlyMin;
    const tool = this.app.getToolByDialogId(dialog.id);

    this.applyDialogMinimizedState(dialog, willBeMin);
    if (willBeMin) {
      tool?.onMinimize?.(this.app);
    } else {
      if (this.app.layoutMode === 'stackpanel' || this.app.layoutMode === 'dock') {
        this.accordionMinimizeOthers(dialog);
        if (this.app.isStackpanelDrawerCollapsed && dialog.closest('.stackpanel-sidebar')) {
          this.setStackpanelDrawerCollapsed(false);
        }
      }
      if (this.app.isAIGenerating && tool?.isExclusive3DTool) {
        tool.onUpdateUI?.(this.app);
      } else {
        if (tool?.isExclusive3DTool) {
          this.deactivateOtherExclusiveTools(tool);
        }
        tool?.onMaximize?.(this.app);
      }
    }

    this.app.refreshIcons();
    this.app.updatePanelButtonStates();
    this.saveDialogLayout();
  }

  public accordionMinimizeOthers(activeDialog: HTMLElement): void {
    const isSidebarPanel = activeDialog.closest('.stackpanel-sidebar') !== null;
    for (const id of this.app.dialogIds) {
      const other = this.app.getElement(id);
      if (!other || other === activeDialog || other.style.display === 'none') continue;

      if (isSidebarPanel && other.closest('.stackpanel-sidebar') !== null) {
        if (!other.classList.contains('minimized')) {
          this.applyDialogMinimizedState(other, true);
          const otherTool = this.app.getToolByDialogId(id);
          otherTool?.onMinimize?.(this.app);
        }
      }
    }
    this.app.refreshIcons();
    this.saveDialogLayout();
  }

  public toggleDialog(id: string, forceOpen?: boolean): void {
    let dialog = this.app.getElement(id);
    if (!dialog) {
      const tool = this.app.getToolByDialogId(id);
      if (tool?.renderView) {
        const container = this.app.getElement<HTMLElement>('stackpanelRightSidebar') || undefined;
        dialog = tool.renderView(container);
        if (dialog) {
          this.setupFloatingDialog(dialog);
          if (id === 'dialog-compress-model') {
            this.app.initCompressModelUI();
          }
          this.app.initSculptUI();
          this.app.initCSGBevelUI();
          this.app.initUVUnwrapUI();
          this.app.initBakingUI();
          this.app.initRiggingUI();
          this.app.initAITextureUI();
          this.app.initTextMeshUI();
          this.app.initDecalUI();
          this.app.initTexturePaintUI();
          this.app.initHeightmapUI();
          this.app.initGaussianSplatUI();
          this.app.refreshIcons();
        }
      }
    }
    if (!dialog) return;

    const isCurrentlyOpen =
      dialog.style.display !== 'none' && (dialog.style.display !== '' || window.getComputedStyle(dialog).display !== 'none');
    const willOpen = forceOpen !== undefined ? forceOpen : !isCurrentlyOpen;
    dialog.style.display = willOpen ? 'flex' : 'none';

    const tool = this.app.getToolByDialogId(id);

    if (willOpen) {
      this.bringDialogToFront(dialog);
      dialog.classList.remove('minimized');
      const btnMin = dialog.querySelector('.btn-min') as HTMLElement | null;
      if (btnMin) {
        btnMin.innerHTML = '<i class="app-icon" data-lucide="minus"></i>';
        btnMin.title = 'Minimize';
      }
      if (this.app.layoutMode === 'stackpanel' || this.app.layoutMode === 'dock') {
        this.accordionMinimizeOthers(dialog);
        if (this.app.isStackpanelDrawerCollapsed && dialog.closest('.stackpanel-sidebar')) {
          this.setStackpanelDrawerCollapsed(false);
        }
      }

      // When opening an exclusive 3D tool, deactivate other exclusive 3D tools without closing their dialogs
      if (tool?.isExclusive3DTool && !this.app.isAIGenerating) {
        this.deactivateOtherExclusiveTools(tool);
      }
      if (this.app.isAIGenerating && tool?.isExclusive3DTool) {
        tool.onUpdateUI?.(this.app);
      } else {
        tool?.onOpen?.(this.app);
      }
    } else {
      tool?.onClose?.(this.app);
      if (this.app.layoutMode === 'dock' && dialog.closest('.stackpanel-sidebar')) {
        const sidebar = this.app.getElement('stackpanelRightSidebar') || document.getElementById('stackpanelRightSidebar');
        const remainingOpen = sidebar
          ? (Array.from(sidebar.querySelectorAll(':scope > .floating-dialog')) as HTMLElement[]).filter(
              (d) => d !== dialog && d.style.display !== 'none'
            )
          : [];
        const hasExpanded = remainingOpen.some((d) => !d.classList.contains('minimized'));
        if (remainingOpen.length > 0 && !hasExpanded) {
          this.toggleDialogMinimize(remainingOpen[0], false);
        }
      }
    }

    this.app.refreshIcons();
    this.app.updatePanelButtonStates();
    this.saveDialogLayout();
  }

  public bringDialogToFront(activeDialog: HTMLElement): void {
    const scope = this.app.rootContainer || document;
    const isSidebar = this.isSidebarLayoutMode();

    if (isSidebar && activeDialog.closest('.stackpanel-sidebar')) {
      const sidebarDialogs = Array.from(scope.querySelectorAll('.stackpanel-sidebar .floating-dialog')) as HTMLElement[];
      sidebarDialogs.forEach((d) => d.classList.remove('active-focus'));
      if (!activeDialog.classList.contains('minimized')) {
        activeDialog.classList.add('active-focus');
      }
      return;
    }

    const allDialogs = Array.from(scope.querySelectorAll('.floating-dialog')) as HTMLElement[];
    // Sort other dialogs by their current z-index so relative stacking order is preserved
    const others = allDialogs
      .filter((d) => d !== activeDialog)
      .sort((a, b) => (parseInt(a.style.zIndex || '50', 10) || 50) - (parseInt(b.style.zIndex || '50', 10) || 50));

    others.forEach((d, idx) => {
      d.style.zIndex = String(50 + idx);
      d.classList.remove('active-focus');
    });

    activeDialog.style.zIndex = '60';
    activeDialog.classList.add('active-focus');

    // If an exclusive 3D tool dialog is brought to front, make it the active 3D tool
    const targetTool =
      this.app.getToolByDialogId(activeDialog.id) ||
      (activeDialog.id === 'pathExtrusionStudioDialog' ? this.app.getToolByName('path_extrusion') : null);

    if (
      targetTool?.isExclusive3DTool &&
      !activeDialog.classList.contains('minimized') &&
      !targetTool.isActive?.(this.app) &&
      !this.app.isAIGenerating
    ) {
      this.deactivateOtherExclusiveTools(targetTool);
      targetTool.onActivate?.(this.app);
      this.app.updatePanelButtonStates();
    }
  }

  public saveDialogLayout(): void {
    try {
      const layout: Record<string, { left: string; top: string; display: string; open: boolean; minimized: boolean }> = {};
      for (const id of this.app.dialogIds) {
        const dialog = this.app.getElement(id);
        if (dialog) {
          const isOpen =
            dialog.style.display !== 'none' && (dialog.style.display !== '' || window.getComputedStyle(dialog).display !== 'none');
          layout[id] = {
            left: dialog.style.left,
            top: dialog.style.top,
            display: isOpen ? 'flex' : 'none',
            open: isOpen,
            minimized: dialog.classList.contains('minimized'),
          };
        }
      }
      localStorage.setItem('mesheditor_window_layout', JSON.stringify(layout));
    } catch (e) {
      console.warn('Failed to save dialog layout:', e);
    }
  }

  public restoreDialogLayout(): void {
    try {
      const saved = localStorage.getItem('mesheditor_window_layout');
      if (!saved) {
        // First time execution: activate default tools & panels (keep specialized studio tools closed until toggled)
        for (const tool of this.app.editorTools) {
          if (!tool.dialogId) continue;
          const dialog = this.app.getElement(tool.dialogId);
          if (dialog) {
            dialog.style.display = tool.defaultOpen ? 'flex' : 'none';
            if (tool.defaultOpen) {
              this.applyDialogMinimizedState(dialog, false);
            }
          }
          if (!tool.defaultOpen) {
            tool.onClose?.(this.app);
          }
        }
        const outliner = this.app.getElement('dialog-outliner');
        if (this.isCompactViewport() && outliner && outliner.style.display !== 'none') {
          this.applyDialogMinimizedState(outliner, true);
          this.app.getToolByDialogId('dialog-outliner')?.onMinimize?.(this.app);
        }
        this.app.updatePanelButtonStates();
        this.app.refreshIcons();
        this.saveDialogLayout();
        return;
      }

      const layout = JSON.parse(saved);

      for (const id of this.app.dialogIds) {
        const dialog = this.app.getElement(id);
        const state = layout[id];
        if (!dialog || !state) continue;

        // Restore position
        const leftVal = state.left || (typeof state.x === 'number' && state.x > 0 ? `${state.x}px` : null);
        const topVal = state.top || (typeof state.y === 'number' && state.y > 0 ? `${state.y}px` : null);

        if (leftVal) {
          dialog.style.left = leftVal;
          dialog.style.right = 'auto';
          dialog.style.transform = 'none';
        }
        if (topVal) {
          dialog.style.top = topVal;
          dialog.style.bottom = 'auto';
          dialog.style.transform = 'none';
        }

        // Restore visibility (support old display: string and new open: boolean)
        let isOpen = true;
        if (state.display !== undefined) {
          isOpen = state.display !== 'none';
        } else if (state.open !== undefined) {
          isOpen = !!state.open;
        }

        dialog.style.display = isOpen ? 'flex' : 'none';

        // Restore minimized state
        const isMin = !!state.minimized;
        this.applyDialogMinimizedState(dialog, isMin);
      }

      // Safeguard: If every default panel is closed, activate standard panels
      const defaultPanelIds = this.app.editorTools
        .filter((t) => t.defaultOpen && t.dialogId)
        .map((t) => t.dialogId!);
      const anyOpen = defaultPanelIds.some((id) => {
        const d = this.app.getElement(id);
        return d && d.style.display !== 'none';
      });
      if (!anyOpen) {
        for (const id of defaultPanelIds) {
          const d = this.app.getElement(id);
          if (d) d.style.display = 'flex';
        }
      }

      // On compact viewports (<= 1024px), always start with Scene Objects minimized
      const outliner = this.app.getElement('dialog-outliner');
      if (this.isCompactViewport() && outliner && outliner.style.display !== 'none') {
        this.applyDialogMinimizedState(outliner, true);
      }

      // Synchronize tool lifecycle state from open dialogs
      for (const tool of this.app.editorTools) {
        if (!tool.dialogId) continue;
        const d = this.app.getElement(tool.dialogId);
        const isOpenAndActive = !!(d && d.style.display !== 'none' && !d.classList.contains('minimized'));
        if (isOpenAndActive) {
          tool.onOpen?.(this.app);
        } else {
          tool.onClose?.(this.app);
        }
      }

      this.app.updatePanelButtonStates();
      this.app.refreshIcons();
    } catch (e) {
      console.warn('Failed to restore dialog layout:', e);
    }
  }
}
