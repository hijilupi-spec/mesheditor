import { delegate, hideAll } from 'tippy.js';
import type { DelegateInstance, Instance, Props, ReferenceElement } from 'tippy.js';

/**
 * Global Tippy.js tooltip manager for Mesh Editor.
 *
 * Automatically upgrades both explicit `[data-tippy-content]` elements and
 * standard `[title]` attributes across the editor container using event
 * delegation, while suppressing ugly native browser tooltips during hover/focus
 * and preserving `[title]` attributes at rest for compatibility.
 */
export class TooltipManager {
  private readonly root: HTMLElement;
  private delegateInstance: DelegateInstance<Props> | null = null;
  private readonly stashedElements = new Set<HTMLElement>();
  private readonly cleanupFns: Array<() => void> = [];
  private disposed = false;

  constructor(root: HTMLElement) {
    this.root = root;
    this.init();
  }

  private init(): void {
    if (typeof document === 'undefined' || !this.root) return;

    const handleEnter = (event: Event): void => {
      const target = event.target as HTMLElement | null;
      if (!target || typeof target.closest !== 'function') return;

      const titledEl = target.closest('[title]:not([title=""])') as HTMLElement | null;
      if (titledEl && this.root.contains(titledEl) && this.shouldManageElement(titledEl)) {
        this.stashNativeTitle(titledEl);
      }
    };

    const handleLeave = (event: Event): void => {
      const target = event.target as HTMLElement | null;
      const relatedTarget = (event as MouseEvent | FocusEvent).relatedTarget as Node | null;
      if (!target || typeof target.closest !== 'function') return;

      for (const el of Array.from(this.stashedElements)) {
        if (!el.isConnected) {
          this.stashedElements.delete(el);
          continue;
        }
        if (el === target || el.contains(target)) {
          if (relatedTarget && el.contains(relatedTarget)) {
            continue;
          }
          // Keep title stashed while a Tippy tooltip is still visibly shown for this element
          const tippyInst = (el as ReferenceElement)._tippy;
          if (!tippyInst || !tippyInst.state.isVisible) {
            this.restoreNativeTitle(el);
          }
        }
      }
    };

    this.root.addEventListener('pointerover', handleEnter, true);
    this.root.addEventListener('mouseover', handleEnter, true);
    this.root.addEventListener('focusin', handleEnter, true);
    this.root.addEventListener('pointerout', handleLeave, true);
    this.root.addEventListener('mouseout', handleLeave, true);
    this.root.addEventListener('focusout', handleLeave, true);

    this.cleanupFns.push(() => {
      this.root.removeEventListener('pointerover', handleEnter, true);
      this.root.removeEventListener('mouseover', handleEnter, true);
      this.root.removeEventListener('focusin', handleEnter, true);
      this.root.removeEventListener('pointerout', handleLeave, true);
      this.root.removeEventListener('mouseout', handleLeave, true);
      this.root.removeEventListener('focusout', handleLeave, true);
    });

    this.delegateInstance = delegate(this.root, {
      target: '[data-tippy-content], [title]:not([title=""])',
      theme: 'mesheditor',
      animation: 'shift-away-subtle',
      arrow: true,
      delay: [260, 50],
      duration: [150, 100],
      offset: [0, 8],
      placement: 'top',
      maxWidth: 260,
      hideOnClick: true,
      touch: ['hold', 450],
      zIndex: 10000,
      appendTo: () => (document.fullscreenElement as HTMLElement) || document.body,
      popperOptions: {
        strategy: 'fixed',
        modifiers: [
          {
            name: 'preventOverflow',
            options: {
              padding: 8,
            },
          },
          {
            name: 'flip',
            options: {
              padding: 8,
              fallbackPlacements: ['bottom', 'left', 'right', 'top'],
            },
          },
        ],
      },
      onShow: (instance: Instance) => {
        const ref = instance.reference as HTMLElement;
        if (!ref || !ref.isConnected || !this.shouldManageElement(ref)) {
          return false;
        }

        // If native title was updated dynamically, stash it now so native tooltip never appears
        const currentTitle = ref.getAttribute('title');
        if (currentTitle && currentTitle.trim().length > 0) {
          this.stashNativeTitle(ref);
        }

        const content = (
          ref.getAttribute('data-tippy-content') ||
          ref.dataset.savedTitle ||
          currentTitle ||
          ''
        ).trim();

        if (!content) {
          return false;
        }

        instance.setContent(content);
      },
      onHidden: (instance: Instance) => {
        const ref = instance.reference as HTMLElement;
        if (ref && this.stashedElements.has(ref)) {
          // Restore native title if pointer is no longer over the element
          const isHovered = typeof ref.matches === 'function' && ref.matches(':hover');
          const isFocused = document.activeElement === ref;
          if (!isHovered && !isFocused) {
            this.restoreNativeTitle(ref);
          }
        }
      },
    });
  }

  private shouldManageElement(el: HTMLElement): boolean {
    if (el.hasAttribute('data-native-tooltip')) return false;
    if (el.tagName === 'IFRAME') return false;
    return true;
  }

  private stashNativeTitle(el: HTMLElement): void {
    const titleVal = el.getAttribute('title');
    if (!titleVal || !titleVal.trim()) return;

    el.dataset.savedTitle = titleVal;
    el.setAttribute('data-tippy-content', titleVal);
    el.removeAttribute('title');
    this.stashedElements.add(el);
  }

  private restoreNativeTitle(el: HTMLElement): void {
    const saved = el.dataset.savedTitle;
    if (saved !== undefined) {
      if (!el.hasAttribute('title')) {
        el.setAttribute('title', saved);
      }
      delete el.dataset.savedTitle;
      if (el.getAttribute('data-tippy-content') === saved) {
        el.removeAttribute('data-tippy-content');
      }
    }
    this.stashedElements.delete(el);
  }

  /**
   * Immediately hides all currently visible Tippy tooltips.
   */
  public hideAll(duration: number = 0): void {
    try {
      hideAll({ duration });
    } catch {
      // Ignore in non-DOM environments
    }
  }

  /**
   * Cleans up Tippy delegate instance, event listeners, and restores stashed titles.
   */
  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    this.hideAll(0);

    for (const el of Array.from(this.stashedElements)) {
      if (el.isConnected) {
        this.restoreNativeTitle(el);
      }
    }
    this.stashedElements.clear();

    for (const cleanup of this.cleanupFns) {
      cleanup();
    }
    this.cleanupFns.length = 0;

    if (this.delegateInstance) {
      try {
        this.delegateInstance.destroy();
      } catch {
        // Ignore teardown errors
      }
      this.delegateInstance = null;
    }
  }
}
