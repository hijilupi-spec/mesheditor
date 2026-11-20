import type { MenuItemDefinition, ToolbarButtonDefinition } from '../plugin';
import { TOOL_CATEGORIES, ToolCategoryDefinition, ToolInterface } from '../tools';
import type { MeshEditorAppHost } from './MeshEditorAppHost';

export class ToolsMenuService {
  private categorizedPluginToolItems: MenuItemDefinition[] = [];
  private toolsWiredFocusgroups: WeakSet<HTMLElement> = new WeakSet<HTMLElement>();
  private toolsEnterOnOpen: WeakSet<HTMLElement> = new WeakSet<HTMLElement>();
  private toolsMenuPointerTrigger: HTMLElement | null = null;
  private toolsPendingHoverTrigger: HTMLElement | null = null;
  private toolsHoverPreviewTimer: ReturnType<typeof setTimeout> | null = null;
  private suppressFocusPreviewTrigger: HTMLElement | null = null;
  private isToolsWindowBlurred: boolean = false;
  private isPointerHoverFocus: boolean = false;
  private submenuBridgeCleanup: (() => void) | null = null;
  private onDocumentFocusInHandler: ((e: FocusEvent) => void) | null = null;
  private onWindowBlurHandler: (() => void) | null = null;
  private onWindowFocusHandler: (() => void) | null = null;

  constructor(private readonly app: MeshEditorAppHost) {}

  public dispose(): void {
    this.clearToolsHoverPreviewTimer();
    this.submenuBridgeCleanup?.();
    this.submenuBridgeCleanup = null;
    if (this.onDocumentFocusInHandler && typeof document !== 'undefined') {
      document.removeEventListener('focusin', this.onDocumentFocusInHandler);
      this.onDocumentFocusInHandler = null;
    }
    if (this.onWindowBlurHandler && typeof window !== 'undefined') {
      window.removeEventListener('blur', this.onWindowBlurHandler);
      this.onWindowBlurHandler = null;
    }
    if (this.onWindowFocusHandler && typeof window !== 'undefined') {
      window.removeEventListener('focus', this.onWindowFocusHandler);
      this.onWindowFocusHandler = null;
    }
  }

  public registerFileMenuItem(item: MenuItemDefinition): void {
    const container = document.getElementById('menuFilePlugins');
    const divider = document.getElementById('menuFilePluginsDivider');
    if (!container) return;

    if (divider) divider.style.display = 'block';

    const btn = document.createElement('button');
    btn.className = `dropdown-item ${item.danger ? 'btn-danger' : ''}`;
    btn.id = item.id;

    const iconHtml = item.icon ? `<span class="btn-icon"><i class="app-icon" data-lucide="${item.icon}"></i></span>` : '';
    const shortcutHtml = item.shortcut ? `<span class="shortcut-tag">${item.shortcut}</span>` : '';

    btn.innerHTML = `
      ${iconHtml}
      <span class="btn-label">${item.label}</span>
      ${shortcutHtml}
    `;

    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      this.app.closeAllDropdowns();
      await item.onClick();
    });

    container.appendChild(btn);
    this.app.refreshIcons();
  }

  public registerActionMenuItem(item: MenuItemDefinition): void {
    const container = document.getElementById('menuActionsPlugins');
    const divider = document.getElementById('menuActionsPluginsDivider');
    if (!container) return;

    if (divider) divider.style.display = 'block';

    const btn = document.createElement('button');
    btn.className = `dropdown-item ${item.danger ? 'btn-danger' : ''}`;
    btn.id = item.id;

    const iconHtml = item.icon ? `<span class="btn-icon"><i class="app-icon" data-lucide="${item.icon}"></i></span>` : '';
    const shortcutHtml = item.shortcut ? `<span class="shortcut-tag">${item.shortcut}</span>` : '';

    btn.innerHTML = `
      ${iconHtml}
      <span class="btn-label">${item.label}</span>
      ${shortcutHtml}
    `;

    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      this.app.closeAllDropdowns();
      await item.onClick();
    });

    container.appendChild(btn);
    this.app.refreshIcons();
  }

  public registerToolMenuItem(item: MenuItemDefinition): void {
    if (item.category) {
      const existingIdx = this.categorizedPluginToolItems.findIndex((i) => i.id === item.id);
      if (existingIdx !== -1) {
        this.categorizedPluginToolItems[existingIdx] = item;
      } else {
        this.categorizedPluginToolItems.push(item);
      }
      this.renderToolsMenu();
      return;
    }

    const container = this.app.getElement('menuToolsPlugins') || document.getElementById('menuToolsPlugins');
    const divider = this.app.getElement('menuToolsPluginsDivider') || document.getElementById('menuToolsPluginsDivider');
    if (!container) return;

    if (divider) divider.style.display = 'block';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `dropdown-item ${item.danger ? 'btn-danger' : ''}`;
    btn.id = item.id;

    const iconHtml = item.icon ? `<span class="btn-icon"><i class="app-icon" data-lucide="${item.icon}"></i></span>` : '';
    const shortcutHtml = item.shortcut ? `<span class="shortcut-tag">${item.shortcut}</span>` : '';

    btn.innerHTML = `
      ${iconHtml}
      <span class="btn-label">${item.label}</span>
      ${shortcutHtml}
    `;

    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      this.app.closeAllDropdowns();
      await item.onClick();
    });

    container.appendChild(btn);
    this.app.refreshIcons();
  }

  public registerViewMenuItem(item: MenuItemDefinition): void {
    const container = document.getElementById('menuViewPlugins');
    const divider = document.getElementById('menuViewPluginsDivider');
    if (!container) return;

    if (divider) divider.style.display = 'block';

    const btn = document.createElement('button');
    btn.className = `dropdown-item ${item.danger ? 'btn-danger' : ''}`;
    btn.id = item.id;

    const iconHtml = item.icon ? `<span class="btn-icon"><i class="app-icon" data-lucide="${item.icon}"></i></span>` : '';
    const shortcutHtml = item.shortcut ? `<span class="shortcut-tag">${item.shortcut}</span>` : '';

    btn.innerHTML = `
      ${iconHtml}
      <span class="btn-label">${item.label}</span>
      ${shortcutHtml}
    `;

    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      this.app.closeAllDropdowns();
      await item.onClick();
    });

    container.appendChild(btn);
    this.app.refreshIcons();
  }

  public registerToolbarButton(button: ToolbarButtonDefinition): void {
    const toolbar = document.getElementById('top-toolbar');
    if (!toolbar) return;

    const btn = document.createElement('button');
    btn.className = `tool-btn ${button.className || ''}`;
    btn.id = button.id;
    if (button.title) btn.title = button.title;

    const iconHtml = button.icon ? `<span class="btn-icon"><i class="app-icon" data-lucide="${button.icon}"></i></span>` : '';
    btn.innerHTML = `${iconHtml}<span class="btn-label">${button.label}</span>`;

    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await button.onClick();
    });

    // Insert before help or layout buttons
    const targetAnchor = toolbar.querySelector('.panel-group') || toolbar.querySelector('.layout-group');
    if (targetAnchor) {
      toolbar.insertBefore(btn, targetAnchor);
    } else {
      toolbar.appendChild(btn);
    }
    this.app.refreshIcons();
  }

  public supportsNativePopover(): boolean {
    return typeof HTMLElement !== 'undefined' && Object.hasOwn(HTMLElement.prototype, 'popover');
  }

  private supportsInvokerCommands(): boolean {
    return typeof HTMLButtonElement !== 'undefined' && 'commandForElement' in HTMLButtonElement.prototype;
  }

  private supportsNativeAnchorPositioning(): boolean {
    return (
      typeof CSS !== 'undefined' &&
      typeof CSS.supports === 'function' &&
      CSS.supports('position-area: block-end') &&
      typeof ToggleEvent !== 'undefined' &&
      'source' in ToggleEvent.prototype
    );
  }

  private supportsNativeFocusgroup(): boolean {
    return typeof HTMLElement !== 'undefined' && 'focusGroup' in HTMLElement.prototype;
  }

  public clearToolsHoverPreviewTimer(): void {
    if (this.toolsHoverPreviewTimer) {
      clearTimeout(this.toolsHoverPreviewTimer);
      this.toolsHoverPreviewTimer = null;
    }
    this.toolsPendingHoverTrigger = null;
  }

  public focusElementWithOptions(el: HTMLElement | null | undefined, focusWithoutRing: boolean): void {
    if (!el) return;
    try {
      if (focusWithoutRing) {
        (el as any).focus({ preventScroll: true, focusVisible: false });
      } else {
        el.focus({ preventScroll: true });
      }
    } catch {
      try {
        el.focus();
      } catch {
        // Ignore in detached/headless environments
      }
    }
  }

  private focusItemPointer(item: HTMLElement): void {
    this.isPointerHoverFocus = true;
    try {
      this.focusElementWithOptions(item, true);
    } finally {
      this.isPointerHoverFocus = false;
    }
  }

  private getMenuListItems(container: HTMLElement | null): HTMLElement[] {
    if (!container) return [];
    const list = container.classList.contains('dropdown-menu-list')
      ? container
      : (container.querySelector('.dropdown-menu-list') as HTMLElement | null) || container;
    return Array.from(list.querySelectorAll('button.dropdown-item')).filter((btn) => {
      const el = btn as HTMLButtonElement;
      if (el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
      const parentList = el.closest('.dropdown-menu-list');
      return !parentList || parentList === list;
    }) as HTMLElement[];
  }

  private focusFirstMenuItem(container: HTMLElement | null): void {
    const items = this.getMenuListItems(container);
    if (items.length > 0) {
      this.focusElementWithOptions(items[0], false);
    }
  }

  private ensureMenuFocusgroup(list: HTMLElement | null): void {
    if (!list || this.toolsWiredFocusgroups.has(list)) return;
    this.toolsWiredFocusgroups.add(list);

    if (this.supportsNativeFocusgroup()) return;

    list.setAttribute('role', 'menu');
    list.querySelectorAll('button.dropdown-item').forEach((item) => {
      if (!item.getAttribute('role')) {
        item.setAttribute('role', 'menuitem');
      }
    });

    list.addEventListener(
      'keydown',
      (event: KeyboardEvent) => {
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        const active = document.activeElement as HTMLElement | null;
        if (!active || active.closest('.dropdown-menu-list') !== list) return;

        const items = this.getMenuListItems(list);
        if (items.length === 0) return;

        const current = items.indexOf(active);
        if (current < 0) return;

        const nextIndex =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? items.length - 1
              : (current + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length;

        event.preventDefault();
        event.stopImmediatePropagation();
        this.focusElementWithOptions(items[nextIndex], false);
      },
      true
    );
  }

  public isMenuPopoverOpen(menu: HTMLElement | null): boolean {
    if (!menu) return false;
    if (menu.dataset.popoverOpen === 'true') return true;
    if (this.supportsNativePopover()) {
      try {
        return menu.matches(':popover-open');
      } catch {
        return false;
      }
    }
    return false;
  }

  public hideMenuPopover(menu: HTMLElement | null): void {
    if (!menu) return;
    delete menu.dataset.popoverOpen;
    delete menu.dataset.bridge;
    delete menu.dataset.placement;
    if (this.supportsNativePopover() && typeof (menu as any).hidePopover === 'function') {
      try {
        if (menu.matches(':popover-open')) {
          (menu as any).hidePopover();
        }
      } catch {
        // Ignore if already closed or unsupported
      }
    }
  }

  private getSubmenuForTrigger(trigger: HTMLElement | null): HTMLElement | null {
    if (!trigger) return null;
    const targetId = trigger.getAttribute('commandfor') || trigger.getAttribute('data-submenu-id');
    if (!targetId) return null;
    return this.app.getElement(targetId) || document.getElementById(targetId);
  }

  public closeAllToolSubmenus(exceptSubmenu?: HTMLElement | null): void {
    const rootMenu = this.app.getElement('menuTools') || document.getElementById('menuTools');
    if (!rootMenu) return;
    const submenus = Array.from(rootMenu.querySelectorAll('.dropdown-submenu-menu')) as HTMLElement[];
    for (const submenu of submenus) {
      if (exceptSubmenu && submenu === exceptSubmenu) continue;
      if (this.isMenuPopoverOpen(submenu)) {
        const catId = submenu.getAttribute('data-tool-category');
        const trigger = catId
          ? (rootMenu.querySelector(`.dropdown-submenu-trigger[data-tool-category="${CSS.escape ? CSS.escape(catId) : catId}"]`) as HTMLElement | null)
          : null;
        this.hideMenuPopover(submenu);
        this.onMenuPopoverClosed(submenu, trigger, true);
      }
    }
  }

  private positionMenuPopover(menu: HTMLElement, trigger: HTMLElement, isSubmenu: boolean): void {
    if (typeof window === 'undefined') return;
    const triggerRect = trigger.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const vw = window.innerWidth || 1280;
    const vh = window.innerHeight || 720;
    const pad = 8;

    delete menu.dataset.placement;
    menu.style.maxWidth = '';

    if (!isSubmenu) {
      let left = triggerRect.left;
      if (left + menuRect.width > vw - pad) {
        const alignRight = triggerRect.right - menuRect.width;
        left = alignRight >= pad ? alignRight : Math.max(pad, vw - menuRect.width - pad);
      }
      left = Math.max(pad, left);

      let top = triggerRect.bottom + 5;
      if (top + menuRect.height > vh - pad && triggerRect.top - 5 - menuRect.height >= pad) {
        top = triggerRect.top - 5 - menuRect.height;
      }
      top = Math.max(pad, Math.min(top, Math.max(pad, vh - menuRect.height - pad)));

      menu.style.left = `${Math.round(left)}px`;
      menu.style.top = `${Math.round(top)}px`;
      return;
    }

    const gap = 2;
    const fitsRight = triggerRect.right + gap + menuRect.width <= vw - pad;
    const flipLeft = triggerRect.left - gap - menuRect.width;
    const fitsLeft = flipLeft >= pad;

    if (fitsRight || fitsLeft) {
      const left = fitsRight ? triggerRect.right + gap : flipLeft;
      let top = triggerRect.top - 5;
      if (top + menuRect.height > vh - pad) {
        top = Math.max(pad, vh - menuRect.height - pad);
      }
      top = Math.max(pad, top);
      menu.style.left = `${Math.round(left)}px`;
      menu.style.top = `${Math.round(top)}px`;
      return;
    }

    // Narrow viewport fallback: indent directly below the trigger so the submenu never covers it
    menu.dataset.placement = 'below';
    const maxW = Math.max(140, vw - pad * 2 - 16);
    menu.style.maxWidth = `${maxW}px`;
    const clampedWidth = Math.min(menuRect.width, maxW);
    const left = Math.max(pad, Math.min(triggerRect.left + 16, vw - clampedWidth - pad));
    let top = triggerRect.bottom + 5;
    if (top + menuRect.height > vh - pad) {
      const aboveTop = triggerRect.top - 5 - menuRect.height;
      if (aboveTop >= pad) {
        top = aboveTop;
      } else {
        top = Math.max(pad, vh - menuRect.height - pad);
      }
    }
    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(top)}px`;
  }

  public openMenuPopover(menu: HTMLElement, trigger: HTMLElement, options: { isSubmenu?: boolean; enter?: boolean } = {}): void {
    const isSubmenu = !!options.isSubmenu;
    if (options.enter) {
      this.toolsEnterOnOpen.add(menu);
    }

    menu.dataset.anchorMode = this.supportsNativeAnchorPositioning() ? 'native' : 'js';
    if (isSubmenu) {
      this.closeAllToolSubmenus(menu);
    }

    if (this.supportsNativePopover() && typeof (menu as any).showPopover === 'function') {
      try {
        if (!this.isMenuPopoverOpen(menu)) {
          (menu as any).showPopover({ source: trigger });
        } else if (options.enter) {
          this.toolsEnterOnOpen.delete(menu);
          this.focusFirstMenuItem(menu);
        }
        return;
      } catch {
        // Fallback to attribute toggle if showPopover is unavailable
      }
    }

    menu.dataset.popoverOpen = 'true';
    this.onMenuPopoverOpened(menu, trigger, isSubmenu);
  }

  public closeMenuPopover(menu: HTMLElement, trigger: HTMLElement | null, options: { isSubmenu?: boolean; restoreFocus?: boolean; fromPointer?: boolean } = {}): void {
    this.hideMenuPopover(menu);
    this.onMenuPopoverClosed(menu, trigger, !!options.isSubmenu);
    if (options.restoreFocus && trigger) {
      this.focusElementWithOptions(trigger, !!options.fromPointer);
    }
  }

  private onMenuPopoverOpened(menu: HTMLElement, trigger: HTMLElement | null, isSubmenu: boolean): void {
    menu.dataset.anchorMode = this.supportsNativeAnchorPositioning() ? 'native' : 'js';

    if (!isSubmenu) {
      // Close other non-popover dropdown wrappers
      const wrappers = this.app.rootContainer
        ? Array.from(this.app.rootContainer.querySelectorAll('.dropdown-wrapper'))
        : Array.from(document.querySelectorAll('.dropdown-wrapper'));
      for (const w of wrappers) {
        if (w.id !== 'dropdownTools') {
          w.classList.remove('open');
          w.classList.remove('active');
        }
      }
      const wrapper = this.app.getElement('dropdownTools') || document.getElementById('dropdownTools');
      wrapper?.classList.add('open');
      wrapper?.classList.add('active');
      trigger?.setAttribute('aria-expanded', 'true');
    } else {
      this.closeAllToolSubmenus(menu);
      trigger?.setAttribute('aria-expanded', 'true');
    }

    if (menu.dataset.anchorMode === 'js' && trigger) {
      this.positionMenuPopover(menu, trigger, isSubmenu);
    }

    if (this.toolsEnterOnOpen.has(menu)) {
      this.toolsEnterOnOpen.delete(menu);
      this.focusFirstMenuItem(menu);
    } else if (!isSubmenu && trigger && this.toolsMenuPointerTrigger === trigger) {
      this.focusElementWithOptions(trigger, true);
      this.toolsMenuPointerTrigger = null;
    }
  }

  public onMenuPopoverClosed(menu: HTMLElement, trigger: HTMLElement | null, isSubmenu: boolean): void {
    delete menu.dataset.popoverOpen;
    delete menu.dataset.bridge;
    delete menu.dataset.placement;
    trigger?.setAttribute('aria-expanded', 'false');

    if (!isSubmenu) {
      this.clearToolsHoverPreviewTimer();
      this.closeAllToolSubmenus();
      const wrapper = this.app.getElement('dropdownTools') || document.getElementById('dropdownTools');
      wrapper?.classList.remove('open');
      wrapper?.classList.remove('active');
    }
  }

  private startSubmenuBridge(submenu: HTMLElement, event: PointerEvent): void {
    const canHover =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(hover: hover)').matches;
    if (!canHover || !this.isMenuPopoverOpen(submenu)) return;

    const rect = submenu.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;

    const left = event.clientX < rect.left;
    if (!left && event.clientX <= rect.right) return; // Below placement has no side edge

    this.submenuBridgeCleanup?.();

    submenu.style.setProperty('--pointer-x', `${event.clientX - rect.left}px`);
    submenu.style.setProperty('--pointer-y', `${event.clientY - rect.top}px`);
    submenu.dataset.bridge = '';

    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastX = event.clientX;

    const stop = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      submenu.removeEventListener('pointermove', extend);
      submenu.removeEventListener('toggle', stop);
      delete submenu.dataset.bridge;
      if (this.submenuBridgeCleanup === stop) {
        this.submenuBridgeCleanup = null;
      }
    };

    const extend = (moveEvt: PointerEvent) => {
      if (moveEvt.target !== submenu || (left ? moveEvt.clientX < lastX : moveEvt.clientX > lastX)) {
        stop();
        return;
      }
      lastX = moveEvt.clientX;
      if (timer) clearTimeout(timer);
      timer = setTimeout(stop, 300);
    };

    timer = setTimeout(stop, 300);
    submenu.addEventListener('pointermove', extend);
    submenu.addEventListener('toggle', stop, { once: true });
    this.submenuBridgeCleanup = stop;
  }

  public setupToolsMenu(): void {
    const wrapper = this.app.getElement('dropdownTools') || document.getElementById('dropdownTools');
    const btn = this.app.getElement('btnDropdownTools') || document.getElementById('btnDropdownTools');
    const menu = this.app.getElement('menuTools') || document.getElementById('menuTools');
    const list = (this.app.getElement('menuToolsList') || menu?.querySelector('#menuToolsList') || menu) as HTMLElement | null;
    if (!wrapper || !btn || !menu || !list) return;

    menu.dataset.anchorMode = this.supportsNativeAnchorPositioning() ? 'native' : 'js';
    this.ensureMenuFocusgroup(list);

    btn.addEventListener('pointerdown', (e) => {
      this.toolsMenuPointerTrigger = btn;
      if (e.pointerType !== 'touch') {
        e.preventDefault();
      }
    });

    btn.addEventListener('click', (e) => {
      if (this.supportsInvokerCommands() && this.supportsNativePopover()) {
        // Close other non-popover dropdowns; native toggle-popover handles #menuTools
        const wrappers = this.app.rootContainer
          ? Array.from(this.app.rootContainer.querySelectorAll('.dropdown-wrapper'))
          : Array.from(document.querySelectorAll('.dropdown-wrapper'));
        for (const w of wrappers) {
          if (w !== wrapper) {
            w.classList.remove('open');
            w.classList.remove('active');
          }
        }
        if ((e as MouseEvent).detail === 0 && !this.isMenuPopoverOpen(menu)) {
          this.toolsEnterOnOpen.add(menu);
        }
        return;
      }

      e.preventDefault();
      e.stopPropagation();
      const wasOpen = this.isMenuPopoverOpen(menu);
      this.app.closeAllDropdowns();
      if (!wasOpen) {
        this.openMenuPopover(menu, btn, {
          isSubmenu: false,
          enter: (e as MouseEvent).detail === 0,
        });
      }
    });

    btn.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        if (!this.isMenuPopoverOpen(menu)) {
          this.app.closeAllDropdowns();
          this.openMenuPopover(menu, btn, { isSubmenu: false, enter: true });
        } else {
          this.focusFirstMenuItem(list);
        }
      }
    });

    menu.addEventListener('toggle', (e: any) => {
      if (e.newState === 'open') {
        this.onMenuPopoverOpened(menu, btn, false);
      } else {
        this.onMenuPopoverClosed(menu, btn, false);
      }
    });

    menu.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.dropdown-item')) {
        e.stopPropagation();
      }
    });

    list.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.app.closeAllDropdowns({ restoreFocusTarget: btn, fromPointer: false });
      } else if (e.key === 'Tab') {
        this.app.closeAllDropdowns();
      } else if (e.key === 'ArrowRight') {
        const activeTrigger = (document.activeElement as HTMLElement | null)?.closest(
          '.dropdown-submenu-trigger'
        ) as HTMLElement | null;
        if (activeTrigger && activeTrigger.closest('.dropdown-menu-list') === list) {
          const submenu = this.getSubmenuForTrigger(activeTrigger);
          if (submenu) {
            e.preventDefault();
            e.stopPropagation();
            if (this.isMenuPopoverOpen(submenu)) {
              this.focusFirstMenuItem(submenu);
            } else {
              this.openMenuPopover(submenu, activeTrigger, { isSubmenu: true, enter: true });
            }
          }
        }
      }
    });

    list.addEventListener('pointermove', (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      const item = target?.closest('.dropdown-item') as HTMLElement | null;
      if (!item || item.closest('.dropdown-menu-list') !== list) return;

      if (typeof document.elementFromPoint === 'function' && (e.clientX !== 0 || e.clientY !== 0)) {
        const underPointer = document.elementFromPoint(e.clientX, e.clientY);
        if (underPointer && underPointer !== item && !item.contains(underPointer)) {
          return;
        }
      }

      this.focusItemPointer(item);

      if (item.classList.contains('dropdown-submenu-trigger')) {
        const submenu = this.getSubmenuForTrigger(item);
        if (submenu && !this.isMenuPopoverOpen(submenu) && this.toolsPendingHoverTrigger !== item) {
          this.clearToolsHoverPreviewTimer();
          this.toolsPendingHoverTrigger = item;
          this.toolsHoverPreviewTimer = setTimeout(() => {
            this.toolsHoverPreviewTimer = null;
            this.toolsPendingHoverTrigger = null;
            if (this.isMenuPopoverOpen(menu)) {
              this.openMenuPopover(submenu, item, { isSubmenu: true, enter: false });
            }
          }, 90);
        }
      } else {
        this.clearToolsHoverPreviewTimer();
        this.closeAllToolSubmenus();
      }
    });

    list.addEventListener('pointerleave', () => {
      this.clearToolsHoverPreviewTimer();
    });

    if (typeof document !== 'undefined') {
      this.onDocumentFocusInHandler = (e: FocusEvent) => {
        if (this.app.isTogglingToolFromMenu) return;
        if (!this.isMenuPopoverOpen(menu)) return;
        const target = e.target as HTMLElement | null;
        if (!target) return;
        if (wrapper.contains(target) || menu.contains(target)) return;
        this.app.closeAllDropdowns();
      };
      document.addEventListener('focusin', this.onDocumentFocusInHandler);
    }

    if (typeof window !== 'undefined') {
      this.onWindowBlurHandler = () => {
        this.isToolsWindowBlurred = true;
      };
      this.onWindowFocusHandler = () => {
        setTimeout(() => {
          this.isToolsWindowBlurred = false;
        }, 0);
      };
      window.addEventListener('blur', this.onWindowBlurHandler);
      window.addEventListener('focus', this.onWindowFocusHandler);
    }
  }

  private createToolMenuButton(tool: ToolInterface, _rootBtn: HTMLElement | null): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dropdown-item';
    btn.id = tool.triggerButtonId!;
    btn.setAttribute('data-tool-name', tool.name);
    if (tool.category) {
      btn.setAttribute('data-tool-category', tool.category);
    }
    btn.title = tool.description || tool.menuLabel!;

    const iconName = tool.icon || 'wrench';
    btn.innerHTML = `
      <span class="btn-icon"><i class="app-icon" data-lucide="${iconName}"></i></span>
      <span class="btn-label">${tool.menuLabel}</span>
    `.trim();

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (tool.dialogId) {
        this.app.isTogglingToolFromMenu = true;
        try {
          this.app.toggleDialog(tool.dialogId);
          if (tool.dialogId === 'dialog-csg') {
            this.app.updateCSGGUI();
          }
        } finally {
          setTimeout(() => {
            this.app.isTogglingToolFromMenu = false;
          }, 0);
        }
      }
    });

    return btn;
  }

  private createPluginToolMenuButton(item: MenuItemDefinition, rootBtn: HTMLElement | null): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `dropdown-item ${item.danger ? 'btn-danger' : ''}`.trim();
    btn.id = item.id;
    btn.setAttribute('data-plugin-tool-item', 'true');
    if (item.category) {
      btn.setAttribute('data-tool-category', item.category);
    }

    const iconHtml = item.icon ? `<span class="btn-icon"><i class="app-icon" data-lucide="${item.icon}"></i></span>` : '';
    const shortcutHtml = item.shortcut ? `<span class="shortcut-tag">${item.shortcut}</span>` : '';

    btn.innerHTML = `
      ${iconHtml}
      <span class="btn-label">${item.label}</span>
      ${shortcutHtml}
    `;

    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const fromKeyboard = (e as MouseEvent).detail === 0;
      this.app.closeAllDropdowns({
        restoreFocusTarget: rootBtn,
        fromPointer: !fromKeyboard,
      });
      await item.onClick();
    });

    return btn;
  }

  public renderToolsMenu(): void {
    const menu = this.app.getElement('menuTools') || document.getElementById('menuTools');
    if (!menu) return;

    const list = (menu.querySelector('#menuToolsList') || menu) as HTMLElement;
    const divider = list.querySelector('#menuToolsPluginsDivider') || document.getElementById('menuToolsPluginsDivider');
    const pluginsContainer = list.querySelector('#menuToolsPlugins') || document.getElementById('menuToolsPlugins');
    const rootBtn = this.app.getElement('btnDropdownTools') || document.getElementById('btnDropdownTools');

    // Remove previously rendered dynamic categories, submenus, and tool items
    list.querySelectorAll('.dropdown-submenu-trigger[data-tool-category]').forEach((el) => el.remove());
    list.querySelectorAll('.dropdown-submenu-menu[data-tool-category]').forEach((el) => el.remove());
    list.querySelectorAll('.dropdown-item[data-tool-name]').forEach((el) => el.remove());
    list.querySelectorAll('.dropdown-item[data-plugin-tool-item]').forEach((el) => el.remove());

    // Sort tools by their `order` property
    const tools = [...this.app.editorTools].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));

    type CategoryEntry = { kind: 'tool'; tool: ToolInterface } | { kind: 'plugin'; item: MenuItemDefinition };
    const categorizedGroups = new Map<string, CategoryEntry[]>();
    const uncategorizedTools: ToolInterface[] = [];

    for (const tool of tools) {
      if (tool.menuId && tool.menuId !== 'menuTools') continue;
      if (!tool.triggerButtonId || !tool.menuLabel) continue;

      if (tool.category) {
        const listForCategory = categorizedGroups.get(tool.category) || [];
        listForCategory.push({ kind: 'tool', tool });
        categorizedGroups.set(tool.category, listForCategory);
      } else {
        uncategorizedTools.push(tool);
      }
    }

    const sortedPluginItems = [...this.categorizedPluginToolItems].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
    for (const item of sortedPluginItems) {
      if (!item.category) continue;
      const listForCategory = categorizedGroups.get(item.category) || [];
      listForCategory.push({ kind: 'plugin', item });
      categorizedGroups.set(item.category, listForCategory);
    }

    const knownCategoryMap = new Map<string, ToolCategoryDefinition>(
      TOOL_CATEGORIES.map((def) => [String(def.id), def])
    );

    const orderedCategories: string[] = [];
    for (const def of TOOL_CATEGORIES) {
      if (categorizedGroups.has(String(def.id))) {
        orderedCategories.push(String(def.id));
      }
    }
    const extraCategories = Array.from(categorizedGroups.keys())
      .filter((c) => !knownCategoryMap.has(c))
      .sort((a, b) => a.localeCompare(b));
    orderedCategories.push(...extraCategories);

    const insertIntoRootList = (el: HTMLElement) => {
      if (divider && divider.parentElement === list) {
        list.insertBefore(el, divider);
      } else if (pluginsContainer && pluginsContainer.parentElement === list) {
        list.insertBefore(el, pluginsContainer);
      } else {
        list.appendChild(el);
      }
    };

    for (const categoryId of orderedCategories) {
      const entries = categorizedGroups.get(categoryId);
      if (!entries || entries.length === 0) continue;

      const catDef = knownCategoryMap.get(categoryId);
      const catLabel = catDef?.label || categoryId;
      const catIcon = catDef?.icon || 'folder';
      const catSlug = categoryId.replace(/[^a-zA-Z0-9_-]/g, '-');
      const triggerId = `btnToolCategory-${catSlug}`;
      const submenuId = `menuToolsSubmenu-${catSlug}`;

      const catBtn = document.createElement('button');
      catBtn.type = 'button';
      catBtn.className = 'dropdown-item dropdown-submenu-trigger';
      catBtn.id = triggerId;
      catBtn.setAttribute('data-tool-category', categoryId);
      catBtn.setAttribute('aria-haspopup', 'menu');
      catBtn.setAttribute('aria-expanded', 'false');
      catBtn.setAttribute('commandfor', submenuId);
      catBtn.setAttribute('command', 'toggle-popover');
      catBtn.title = `${catLabel} tools`;
      catBtn.innerHTML = `
        <span class="btn-icon"><i class="app-icon" data-lucide="${catIcon}"></i></span>
        <span class="btn-label">${catLabel}</span>
        <span class="submenu-active-dot" aria-hidden="true"></span>
        <span class="submenu-arrow" aria-hidden="true"><i class="app-icon" data-lucide="chevron-right"></i></span>
      `.trim();

      const submenu = document.createElement('div');
      submenu.id = submenuId;
      submenu.className = 'dropdown-menu dropdown-submenu-menu';
      submenu.setAttribute('popover', 'auto');
      submenu.setAttribute('data-tool-category', categoryId);
      submenu.dataset.anchorMode = this.supportsNativeAnchorPositioning() ? 'native' : 'js';

      const submenuList = document.createElement('div');
      submenuList.className = 'dropdown-menu-list';
      submenuList.setAttribute('focusgroup', 'menu nomemory');
      submenuList.setAttribute('aria-labelledby', triggerId);
      submenu.appendChild(submenuList);

      for (const entry of entries) {
        if (entry.kind === 'tool') {
          submenuList.appendChild(this.createToolMenuButton(entry.tool, rootBtn));
        } else {
          submenuList.appendChild(this.createPluginToolMenuButton(entry.item, rootBtn));
        }
      }

      catBtn.addEventListener('pointerdown', (e) => {
        this.clearToolsHoverPreviewTimer();
        this.toolsMenuPointerTrigger = catBtn;
        if (e.pointerType !== 'touch') {
          e.preventDefault();
        }
      });

      catBtn.addEventListener('click', (e) => {
        if (this.supportsInvokerCommands() && this.supportsNativePopover()) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        if (this.isMenuPopoverOpen(submenu)) {
          this.closeMenuPopover(submenu, catBtn, { isSubmenu: true, restoreFocus: false });
        } else {
          this.openMenuPopover(submenu, catBtn, { isSubmenu: true, enter: false });
        }
      });

      catBtn.addEventListener('focus', () => {
        if (this.isToolsWindowBlurred || this.isPointerHoverFocus) return;
        if (this.suppressFocusPreviewTrigger === catBtn) {
          this.suppressFocusPreviewTrigger = null;
          return;
        }
        if (!this.isMenuPopoverOpen(submenu)) {
          this.openMenuPopover(submenu, catBtn, { isSubmenu: true, enter: false });
        }
      });

      catBtn.addEventListener('blur', (e: FocusEvent) => {
        const nextFocus = e.relatedTarget as HTMLElement | null;
        if (nextFocus && submenu.contains(nextFocus)) return;
        if (nextFocus && nextFocus.classList?.contains('dropdown-submenu-trigger')) return;
        if (!this.isPointerHoverFocus && this.isMenuPopoverOpen(submenu)) {
          if (nextFocus && list.contains(nextFocus)) {
            this.closeMenuPopover(submenu, catBtn, { isSubmenu: true, restoreFocus: false });
          }
        }
      });

      catBtn.addEventListener('pointerleave', (e: PointerEvent) => {
        this.clearToolsHoverPreviewTimer();
        this.startSubmenuBridge(submenu, e);
      });

      submenu.addEventListener('toggle', (e: any) => {
        if (e.newState === 'open') {
          this.onMenuPopoverOpened(submenu, catBtn, true);
        } else {
          this.onMenuPopoverClosed(submenu, catBtn, true);
        }
      });

      submenu.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (!target.closest('.dropdown-item')) {
          e.stopPropagation();
        }
      });

      submenuList.addEventListener('pointermove', (e: PointerEvent) => {
        const target = e.target as HTMLElement | null;
        const item = target?.closest('.dropdown-item') as HTMLElement | null;
        if (!item || item.closest('.dropdown-menu-list') !== submenuList) return;
        this.focusItemPointer(item);
      });

      submenuList.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'ArrowLeft' || e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          this.suppressFocusPreviewTrigger = catBtn;
          this.focusElementWithOptions(catBtn, false);
          this.closeMenuPopover(submenu, catBtn, { isSubmenu: true, restoreFocus: false });
        } else if (e.key === 'Tab') {
          this.app.closeAllDropdowns();
        }
      });

      insertIntoRootList(catBtn);
      insertIntoRootList(submenu);
      this.ensureMenuFocusgroup(submenuList);
    }

    for (const tool of uncategorizedTools) {
      insertIntoRootList(this.createToolMenuButton(tool, rootBtn));
    }

    this.ensureMenuFocusgroup(list);
    this.app.refreshIcons();
    this.updatePanelButtonStates();
  }

  public registerEditorTool(tool: ToolInterface): void {
    const existingIdx = this.app.editorTools.findIndex((t) => t.name === tool.name);
    if (existingIdx !== -1) {
      this.app.editorTools[existingIdx] = tool;
    } else {
      this.app.editorTools.push(tool);
    }
    this.renderToolsMenu();
  }

  public updatePanelButtonStates(): void {
    const activeCategories = new Set<string>();

    for (const tool of this.app.editorTools) {
      if (tool.dialogId && tool.triggerButtonId) {
        const dialog = this.app.getElement(tool.dialogId);
        const btn = this.app.getElement(tool.triggerButtonId) || document.getElementById(tool.triggerButtonId);
        if (dialog && btn) {
          const isOpen =
            dialog.style.display !== 'none' &&
            (dialog.style.display !== '' || window.getComputedStyle(dialog).display !== 'none');
          btn.classList.toggle('active', isOpen);
          if (isOpen && tool.category) {
            activeCategories.add(String(tool.category));
          }
        }
      }
    }

    const menuTools = this.app.getElement('menuTools') || document.getElementById('menuTools');
    if (menuTools) {
      menuTools.querySelectorAll('.dropdown-submenu-trigger[data-tool-category]').forEach((trigger) => {
        const catId = trigger.getAttribute('data-tool-category') || '';
        trigger.classList.toggle('has-active-tool', activeCategories.has(catId));
      });
    }

    // Also update Ground Grid button state
    const btnGrid = this.app.getElement('btnToggleGrid');
    if (btnGrid) {
      btnGrid.classList.toggle('active', !!this.app.service.sceneParams?.grid);
    }

    this.app.renderDockToolbar();
    this.app.updateStackpanelDrawerUI();
    this.app.updateFullscreenButtonState();
  }
}
