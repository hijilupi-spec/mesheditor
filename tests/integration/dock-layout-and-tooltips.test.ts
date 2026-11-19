import { NullEngine } from '@babylonjs/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MeshEditorApp } from '../../src/MeshEditorApp';
import { TooltipManager } from '../../src/utils/TooltipManager';

describe('Dock Layout Mode & Tippy.js Global Tooltips Integration Tests', () => {
  let engine: NullEngine;
  let container: HTMLDivElement;
  let app: MeshEditorApp;

  beforeEach(() => {
    localStorage.clear();
    document.body.className = '';
    container = document.createElement('div');
    document.body.appendChild(container);
    engine = new NullEngine({
      renderWidth: 800,
      renderHeight: 600,
      textureSize: 256,
      deterministicLockstep: false,
      lockstepMaxSteps: 1,
    });
    app = new MeshEditorApp({
      container,
      engine,
    });
  });

  afterEach(() => {
    app?.dispose();
    engine?.dispose();
    container?.remove();
    document.body.className = '';
    localStorage.clear();
  });

  it('defaults to Dock layout on fresh startup and supports switching via #btnLayoutStack and #btnLayoutDock', () => {
    const btnDock = container.querySelector('#btnLayoutDock') as HTMLButtonElement;
    const btnStack = container.querySelector('#btnLayoutStack') as HTMLButtonElement;
    const btnFloat = container.querySelector('#btnLayoutFloating') as HTMLButtonElement;

    expect(btnDock).not.toBeNull();
    expect(app.layoutMode).toBe('dock');
    expect(document.body.classList.contains('layout-dock')).toBe(true);
    expect(document.body.classList.contains('layout-stackpanel')).toBe(false);
    expect(btnDock.classList.contains('active')).toBe(true);

    btnStack.click();
    expect(app.layoutMode).toBe('stackpanel');
    expect(document.body.classList.contains('layout-stackpanel')).toBe(true);
    expect(document.body.classList.contains('layout-dock')).toBe(false);

    btnDock.click();
    expect(app.layoutMode).toBe('dock');
    expect(document.body.classList.contains('layout-dock')).toBe(true);
    expect(document.body.classList.contains('layout-stackpanel')).toBe(false);
    expect(btnDock.classList.contains('active')).toBe(true);
    expect(btnStack.classList.contains('active')).toBe(false);
    expect(btnFloat.classList.contains('active')).toBe(false);
    expect(localStorage.getItem('mesheditor_layout_mode')).toBe('dock');
  });

  it('renders round icon buttons for all enabled sidebar tools and keeps strictly one panel active', () => {
    app.toggleDialog('dialog-create-primitive', true);
    app.toggleDialog('dialog-material', true);
    app.toggleDialog('dialog-scene', true);
    app.setLayoutMode('dock');

    const dockBar = container.querySelector('#dockToolBar') as HTMLElement;
    expect(dockBar).not.toBeNull();
    expect(dockBar.classList.contains('is-empty')).toBe(false);

    const dockButtons = Array.from(dockBar.querySelectorAll<HTMLButtonElement>('.dock-tool-btn'));
    const openSidebarDialogs = Array.from(
      container.querySelectorAll<HTMLElement>('#stackpanelRightSidebar > .floating-dialog')
    ).filter((d) => d.style.display !== 'none');

    expect(dockButtons.length).toBe(openSidebarDialogs.length);
    expect(dockButtons.length).toBeGreaterThanOrEqual(3);

    // Every button has an icon and tool label tooltip metadata
    for (const btn of dockButtons) {
      expect(btn.getAttribute('role')).toBe('tab');
      expect(btn.getAttribute('aria-label')).toBeTruthy();
      expect(btn.getAttribute('title')).toBe(btn.getAttribute('aria-label'));
      expect(btn.querySelector('.app-icon, svg')).not.toBeNull();
    }

    // Strictly one panel is expanded and one dock button is active
    const expandedDialogs = openSidebarDialogs.filter((d) => !d.classList.contains('minimized'));
    const activeButtons = dockButtons.filter((b) => b.classList.contains('active'));
    expect(expandedDialogs.length).toBe(1);
    expect(activeButtons.length).toBe(1);
    expect(activeButtons[0].dataset.dialogId).toBe(expandedDialogs[0].id);

    // Click another dock button to switch active panel
    const targetBtn = dockButtons.find((b) => b.dataset.dialogId === 'dialog-material')!;
    expect(targetBtn).toBeDefined();
    targetBtn.click();

    const materialDialog = container.querySelector('#dialog-material') as HTMLElement;
    const createDialog = container.querySelector('#dialog-create-primitive') as HTMLElement;
    expect(materialDialog.classList.contains('minimized')).toBe(false);
    expect(createDialog.classList.contains('minimized')).toBe(true);
    expect(targetBtn.classList.contains('active')).toBe(true);
    expect(targetBtn.getAttribute('aria-selected')).toBe('true');

    // Closing the active panel auto-activates a remaining open tool panel
    app.toggleDialog('dialog-material', false);
    const remainingOpen = Array.from(
      container.querySelectorAll<HTMLElement>('#stackpanelRightSidebar > .floating-dialog')
    ).filter((d) => d.style.display !== 'none');
    const remainingExpanded = remainingOpen.filter((d) => !d.classList.contains('minimized'));
    expect(remainingExpanded.length).toBe(1);
    expect(container.querySelector('#dockToolBar .dock-tool-btn[data-dialog-id="dialog-material"]')).toBeNull();
  });

  it('supports drawer collapse and keeps #stackpanelRightSidebar children strictly dialog elements', () => {
    app.toggleDialog('dialog-create-primitive', true);
    app.setLayoutMode('dock');

    const sidebar = container.querySelector('#stackpanelRightSidebar') as HTMLElement;
    const host = container.querySelector('#rightSidebarHost') as HTMLElement;
    const toggleBtn = container.querySelector('#btnStackpanelDrawerToggle') as HTMLButtonElement;

    expect(sidebar.firstElementChild?.classList.contains('floating-dialog')).toBe(true);
    expect(sidebar.lastElementChild?.classList.contains('floating-dialog')).toBe(true);

    app.toggleStackpanelDrawer(true);
    expect(document.body.classList.contains('stackpanel-drawer-collapsed')).toBe(true);
    expect(host.getAttribute('aria-hidden')).toBe('true');
    expect(toggleBtn.title).toContain('Expand dock drawer');

    app.toggleStackpanelDrawer(false);
    expect(document.body.classList.contains('stackpanel-drawer-collapsed')).toBe(false);
    expect(host.hasAttribute('aria-hidden')).toBe(false);
    expect(toggleBtn.title).toContain('Minimize dock to drawer');
  });

  it('reorders round Dock icon buttons via drag and drop and syncs order with Stackpanel and localStorage', () => {
    app.toggleDialog('dialog-create-primitive', true);
    app.toggleDialog('dialog-material', true);
    app.toggleDialog('dialog-scene', true);
    app.setLayoutMode('dock');

    const dockBar = container.querySelector('#dockToolBar') as HTMLElement;
    const initialButtons = Array.from(dockBar.querySelectorAll<HTMLButtonElement>('.dock-tool-btn'));
    expect(initialButtons.length).toBeGreaterThanOrEqual(3);

    const firstBtn = initialButtons[0];
    const lastBtn = initialButtons[initialButtons.length - 1];
    expect(firstBtn.draggable).toBe(true);
    expect(lastBtn.draggable).toBe(true);

    const firstId = firstBtn.dataset.dialogId!;
    const lastId = lastBtn.dataset.dialogId!;
    expect(firstId).not.toBe(lastId);

    const dataTransfer = {
      data: {} as Record<string, string>,
      setData(k: string, v: string) {
        this.data[k] = v;
      },
      getData(k: string) {
        return this.data[k] || '';
      },
      effectAllowed: 'none',
      dropEffect: 'none',
    };

    const dragStartEvent = new Event('dragstart', { bubbles: true, cancelable: true }) as any;
    dragStartEvent.dataTransfer = dataTransfer;
    lastBtn.dispatchEvent(dragStartEvent);

    const dropOverlay = container.querySelector('#dropOverlay') as HTMLElement | null;
    if (dropOverlay) {
      expect(dropOverlay.classList.contains('active')).toBe(false);
    }

    const dragOverEvent = new Event('dragover', { bubbles: true, cancelable: true }) as any;
    dragOverEvent.dataTransfer = dataTransfer;
    dragOverEvent.clientX = firstBtn.getBoundingClientRect().left;
    firstBtn.dispatchEvent(dragOverEvent);
    expect(firstBtn.classList.contains('drag-target-before')).toBe(true);

    const dropEvent = new Event('drop', { bubbles: true, cancelable: true }) as any;
    dropEvent.dataTransfer = dataTransfer;
    dropEvent.clientX = firstBtn.getBoundingClientRect().left; // Left half -> insert before first
    firstBtn.dispatchEvent(dropEvent);

    const reorderedButtons = Array.from(dockBar.querySelectorAll<HTMLButtonElement>('.dock-tool-btn'));
    expect(reorderedButtons[0].dataset.dialogId).toBe(lastId);
    expect(reorderedButtons[1].dataset.dialogId).toBe(firstId);

    // Order is persisted in localStorage and shared with Stackpanel
    const savedOrder = JSON.parse(localStorage.getItem('mesheditor_stackpanel_order') || '[]') as string[];
    expect(savedOrder.indexOf(lastId)).toBeLessThan(savedOrder.indexOf(firstId));

    // Fresh app instance in dock mode restores the exact reordered Dock buttons
    app.dispose();
    container.innerHTML = '';
    engine.dispose();
    engine = new NullEngine({
      renderWidth: 800,
      renderHeight: 600,
      textureSize: 256,
      deterministicLockstep: false,
      lockstepMaxSteps: 1,
    });
    app = new MeshEditorApp({
      container,
      engine,
      layoutMode: 'dock',
    });
    const freshButtons = Array.from(container.querySelectorAll<HTMLButtonElement>('#dockToolBar .dock-tool-btn'));
    expect(freshButtons[0].dataset.dialogId).toBe(lastId);
  });

  it('keeps Tools menu and active category submenu open when toggling tools', () => {
    const btnTools = container.querySelector('#btnDropdownTools') as HTMLButtonElement;
    const menuTools = container.querySelector('#menuTools') as HTMLElement;
    const creationTrigger = menuTools.querySelector('#btnToolCategory-Creation') as HTMLButtonElement;
    const creationSubmenu = menuTools.querySelector('#menuToolsSubmenu-Creation') as HTMLElement;
    const heightmapBtn = creationSubmenu.querySelector('#btnToggleHeightmapTool') as HTMLButtonElement;
    const voxelBtn = creationSubmenu.querySelector('#btnToggleVoxelPainter') as HTMLButtonElement;

    btnTools.click();
    expect(menuTools.getAttribute('data-popover-open')).toBe('true');

    creationTrigger.click();
    expect(creationSubmenu.getAttribute('data-popover-open')).toBe('true');

    // Toggle first tool — both Tools menu and Creation submenu stay open
    heightmapBtn.click();
    expect(menuTools.getAttribute('data-popover-open')).toBe('true');
    expect(creationSubmenu.getAttribute('data-popover-open')).toBe('true');
    expect((container.querySelector('#dialog-heightmap') as HTMLElement).style.display).not.toBe('none');

    // Toggle second tool immediately without reopening the menu
    voxelBtn.click();
    expect(menuTools.getAttribute('data-popover-open')).toBe('true');
    expect(creationSubmenu.getAttribute('data-popover-open')).toBe('true');
    expect((container.querySelector('#dialog-voxel-painter') as HTMLElement).style.display).not.toBe('none');
  });

  it('stashes native title attributes on hover/focus for Tippy.js and restores them cleanly on leave/dispose', () => {
    const sandbox = document.createElement('div');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.title = 'Sculpt Brush';
    sandbox.appendChild(btn);
    document.body.appendChild(sandbox);

    const manager = new TooltipManager(sandbox);

    try {
      // At rest, native title remains intact for existing selectors and compatibility
      expect(btn.getAttribute('title')).toBe('Sculpt Brush');

      // On hover, native title is stashed into data-tippy-content so browser tooltip is suppressed
      btn.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      expect(btn.hasAttribute('title')).toBe(false);
      expect(btn.getAttribute('data-tippy-content')).toBe('Sculpt Brush');

      // On leave, title is restored cleanly
      btn.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }));
      expect(btn.getAttribute('title')).toBe('Sculpt Brush');
      expect(btn.hasAttribute('data-tippy-content')).toBe(false);

      // On focus + dispose, title is also restored cleanly
      btn.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      expect(btn.hasAttribute('title')).toBe(false);
      manager.dispose();
      expect(btn.getAttribute('title')).toBe('Sculpt Brush');
    } finally {
      manager.dispose();
      sandbox.remove();
    }
  });
});
