import { createDefaultToolRegistry, ToolInterface } from '../tools';
import { AIQuickPrompt, getAllQuickPrompts, normalizePromptImageUrl } from '../tools/editor/aiQuickPrompts';
import {
  HELP_ASSISTANT_STORAGE_KEY,
  HELP_ASSISTANT_TOPICS,
  HELP_TOUR_STEPS,
  HelpActionButton,
  HelpActionId,
  HelpSectionBlock,
  HelpTopicDefinition,
  HelpTopicId,
} from './helpAssistantContent';
import type { MeshEditorAppHost } from './MeshEditorAppHost';

export { HELP_ASSISTANT_STORAGE_KEY };

export class HelpModalService {
  private hasInitializedPromptHelpModal = false;
  private hasInitializedHelpAssistant = false;
  private activeHelpTopic: HelpTopicId = 'welcome';
  private activeTourIndex = -1;
  private lastEscapeClosedAt = 0;
  private tourRepositionHandler: (() => void) | null = null;
  private tourKeydownHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(private readonly app: MeshEditorAppHost) {}

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  public hasSeenHelpAssistant(): boolean {
    if (typeof localStorage === 'undefined') return true;
    try {
      return localStorage.getItem(HELP_ASSISTANT_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  }

  public markHelpAssistantSeen(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(HELP_ASSISTANT_STORAGE_KEY, '1');
    } catch {
      // Ignore storage errors
    }
  }

  public resetHelpAssistantSeen(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.removeItem(HELP_ASSISTANT_STORAGE_KEY);
    } catch {
      // Ignore storage errors
    }
  }

  public maybeAutoStartHelpAssistant(): boolean {
    if (this.hasSeenHelpAssistant()) return false;
    if (this.isHelpModalOpen() || this.isGuidedTourOpen()) return false;
    this.openHelpModal('welcome');
    return true;
  }

  public isHelpModalOpen(): boolean {
    const helpModal = (this.app.getElement('helpModal') || document.getElementById('helpModal')) as
      | (HTMLElement & { open?: boolean })
      | null;
    if (!helpModal) return false;
    return Boolean(helpModal.open || helpModal.hasAttribute('open') || helpModal.classList.contains('active'));
  }

  public wasRecentlyClosedByEscape(): boolean {
    return Date.now() - this.lastEscapeClosedAt < 80;
  }

  public isGuidedTourOpen(): boolean {
    return this.activeTourIndex >= 0;
  }

  public initHelpAssistant(): void {
    const helpModal = this.app.getElement('helpModal') || document.getElementById('helpModal');
    if (!helpModal || this.hasInitializedHelpAssistant) return;
    this.hasInitializedHelpAssistant = true;

    this.renderHelpAssistantNav(helpModal);
    this.renderHelpAssistantPanes(helpModal);
    this.switchHelpTopic('welcome', { focusNav: false });

    const btnHelp = this.app.getElement('btnHelp') || document.getElementById('btnHelp');
    btnHelp?.addEventListener('click', () => this.openHelpModal());

    const btnClose = helpModal.querySelector('#btnCloseHelp');
    const btnDone = helpModal.querySelector('#btnHelpDone');
    btnClose?.addEventListener('click', () => this.closeHelpModal());
    btnDone?.addEventListener('click', () => this.closeHelpModal());

    helpModal.querySelector('#btnHelpStartTourHeader')?.addEventListener('click', () => {
      this.startGuidedTour(0);
    });
    helpModal.querySelector('#btnHelpStartTourFooter')?.addEventListener('click', () => {
      this.startGuidedTour(0);
    });

    const chkShowNext = helpModal.querySelector<HTMLInputElement>('#chkHelpShowOnNextVisit');
    chkShowNext?.addEventListener('change', () => {
      if (chkShowNext.checked) {
        this.resetHelpAssistantSeen();
      } else {
        this.markHelpAssistantSeen();
      }
    });

    helpModal.addEventListener('cancel', () => {
      this.lastEscapeClosedAt = Date.now();
    });

    helpModal.addEventListener('close', () => {
      if ('returnValue' in helpModal) {
        (helpModal as HTMLDialogElement).returnValue = '';
      }
      helpModal.classList.remove('active');
      if (!this.isGuidedTourOpen()) {
        this.app.canvas?.focus();
      }
    });

    // Light-dismiss fallback when closedby="any" is unsupported (e.g. Safari)
    if (typeof HTMLDialogElement === 'undefined' || !('closedBy' in HTMLDialogElement.prototype)) {
      const isOutsideDialog = (e: PointerEvent | MouseEvent) => {
        const rect = helpModal.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return e.target === helpModal;
        return e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom;
      };
      let pressedOutside = false;
      helpModal.addEventListener('pointerdown', (e) => {
        pressedOutside = isOutsideDialog(e as PointerEvent);
      });
      helpModal.addEventListener('pointerup', (e) => {
        if (pressedOutside && isOutsideDialog(e as PointerEvent)) {
          this.closeHelpModal();
        }
      });
      helpModal.addEventListener('click', (e) => {
        if (e.target === helpModal && isOutsideDialog(e as MouseEvent)) {
          this.closeHelpModal();
        }
      });
    }

    // Topic navigation & keyboard accessibility
    const navList = helpModal.querySelector<HTMLElement>('#helpAssistantNav');
    navList?.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-help-topic]');
      if (!btn) return;
      const topicId = btn.getAttribute('data-help-topic') as HelpTopicId | null;
      if (topicId) {
        this.clearHelpSearch(helpModal);
        this.switchHelpTopic(topicId, { focusNav: false });
      }
    });

    navList?.addEventListener('keydown', (e: KeyboardEvent) => {
      const tabs = Array.from(navList.querySelectorAll<HTMLButtonElement>('[data-help-topic]'));
      if (tabs.length < 2) return;
      const currentIdx = tabs.findIndex((b) => b === document.activeElement);
      if (currentIdx === -1) return;
      let nextIdx = -1;
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') nextIdx = (currentIdx + 1) % tabs.length;
      else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') nextIdx = (currentIdx - 1 + tabs.length) % tabs.length;
      else if (e.key === 'Home') nextIdx = 0;
      else if (e.key === 'End') nextIdx = tabs.length - 1;
      if (nextIdx >= 0) {
        e.preventDefault();
        const nextBtn = tabs[nextIdx];
        const topicId = nextBtn.getAttribute('data-help-topic') as HelpTopicId | null;
        nextBtn.focus();
        if (topicId) {
          this.clearHelpSearch(helpModal);
          this.switchHelpTopic(topicId, { focusNav: false });
        }
      }
    });

    // Delegate jump-to-topic cards and interactive "Try it" actions inside stage
    const stage = helpModal.querySelector<HTMLElement>('#helpAssistantStage');
    stage?.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const jumpBtn = target.closest<HTMLElement>('[data-jump-topic]');
      if (jumpBtn) {
        const topicId = jumpBtn.getAttribute('data-jump-topic') as HelpTopicId | null;
        if (topicId) {
          this.clearHelpSearch(helpModal);
          this.switchHelpTopic(topicId, { focusNav: false });
        }
        return;
      }
      const actionBtn = target.closest<HTMLElement>('[data-help-action]');
      if (actionBtn) {
        const actionId = actionBtn.getAttribute('data-help-action') as HelpActionId | null;
        if (actionId) {
          this.handleHelpAction(actionId);
        }
      }
    });

    // Search filtering
    const searchInput = helpModal.querySelector<HTMLInputElement>('#helpAssistantSearchInput');
    const clearSearchBtn = helpModal.querySelector<HTMLButtonElement>('#btnClearHelpSearch');
    searchInput?.addEventListener('input', () => {
      this.filterHelpContent(helpModal, searchInput.value);
    });
    clearSearchBtn?.addEventListener('click', () => {
      this.clearHelpSearch(helpModal);
      searchInput?.focus();
    });

    // Sync find-in-page reveal (hidden="until-found")
    helpModal.querySelectorAll<HTMLElement>('.help-topic-pane').forEach((pane) => {
      pane.addEventListener('beforematch', () => {
        const topicId = pane.getAttribute('data-topic-pane') as HelpTopicId | null;
        if (topicId) {
          this.clearHelpSearch(helpModal);
          this.switchHelpTopic(topicId, { focusNav: false });
        }
      });
    });

    this.initGuidedTourEvents();
  }

  private renderHelpAssistantNav(helpModal: HTMLElement): void {
    const nav = helpModal.querySelector<HTMLElement>('#helpAssistantNav');
    if (!nav) return;

    nav.innerHTML = HELP_ASSISTANT_TOPICS.map((topic, index) => {
      const isSelected = index === 0;
      const badgeHtml = topic.badge ? `<span class="help-nav-badge">${this.escapeHtml(topic.badge)}</span>` : '';
      return `
        <button
          type="button"
          role="tab"
          class="help-nav-btn${isSelected ? ' active' : ''}"
          id="helpTab-${topic.id}"
          data-help-topic="${topic.id}"
          aria-selected="${isSelected ? 'true' : 'false'}"
          ${isSelected ? 'focusgroupstart' : 'tabindex="-1"'}
        >
          <span class="help-nav-icon"><i class="app-icon" data-lucide="${topic.icon}"></i></span>
          <span class="help-nav-text">
            <span class="help-nav-title-row">
              <span class="help-nav-label">${this.escapeHtml(topic.navLabel)}</span>
              ${badgeHtml}
            </span>
            <span class="help-nav-sub">${this.escapeHtml(topic.navSubtitle)}</span>
          </span>
        </button>
      `;
    }).join('');
  }

  private renderActionButtons(actions?: HelpActionButton[]): string {
    if (!actions || actions.length === 0) return '';
    return `
      <div class="help-action-row">
        ${actions
          .map((btn) => {
            const idAttr = btn.id ? ` id="${this.escapeHtml(btn.id)}"` : '';
            const variantClass = btn.variant === 'primary' ? ' btn-primary' : '';
            return `
              <button type="button" class="tool-btn help-action-btn${variantClass}"${idAttr} data-help-action="${btn.action}">
                <span class="btn-icon"><i class="app-icon" data-lucide="${btn.icon}"></i></span>
                <span class="btn-label">${this.escapeHtml(btn.label)}</span>
              </button>
            `;
          })
          .join('')}
      </div>
    `;
  }

  private renderSectionBlock(section: HelpSectionBlock): string {
    let bodyHtml = '';
    if (section.customHtml) {
      bodyHtml = section.customHtml;
    } else if (section.items && section.items.length > 0) {
      const gridClass =
        section.layout === 'steps' ? 'help-cards-grid help-cards-steps' : 'help-cards-grid';
      bodyHtml = `
        <div class="${gridClass}">
          ${section.items
            .map((item) => {
              const iconHtml = item.icon
                ? `<span class="help-card-icon"><i class="app-icon" data-lucide="${item.icon}"></i></span>`
                : '';
              const badgeHtml = item.badge ? `<span class="help-card-badge">${this.escapeHtml(item.badge)}</span>` : '';
              const tipHtml = item.tip
                ? `<div class="help-card-tip"><i class="app-icon" data-lucide="lightbulb"></i><span>${this.escapeHtml(item.tip)}</span></div>`
                : '';
              const actionsHtml = this.renderActionButtons(item.actions);
              return `
                <article class="help-card">
                  <div class="help-card-head">
                    <div class="help-card-title-wrap">
                      ${iconHtml}
                      <h5>${this.escapeHtml(item.title)}</h5>
                    </div>
                    ${badgeHtml}
                  </div>
                  <p class="help-card-desc">${item.descriptionHtml}</p>
                  ${tipHtml}
                  ${actionsHtml}
                </article>
              `;
            })
            .join('')}
        </div>
      `;
    }

    return `
      <section class="help-section">
        <h4><i class="app-icon" data-lucide="${section.icon}"></i> ${this.escapeHtml(section.title)}</h4>
        ${section.introHtml ? `<p class="help-prose">${section.introHtml}</p>` : ''}
        ${bodyHtml}
      </section>
    `;
  }

  private renderHelpAssistantPanes(helpModal: HTMLElement): void {
    const panesWrap = helpModal.querySelector<HTMLElement>('#helpAssistantPanes');
    if (!panesWrap) return;

    panesWrap.innerHTML = HELP_ASSISTANT_TOPICS.map((topic, index) => {
      const isActive = index === 0;
      const heroActionsHtml = this.renderActionButtons(topic.heroActions);
      const sectionsHtml = topic.sections.map((s) => this.renderSectionBlock(s)).join('');
      return `
        <div
          class="help-topic-pane${isActive ? ' active' : ''}"
          id="helpPane-${topic.id}"
          data-topic-pane="${topic.id}"
          role="tabpanel"
          aria-labelledby="helpTab-${topic.id}"
          ${isActive ? 'tabindex="0"' : 'hidden="until-found"'}
        >
          <div class="help-topic-pane-inner">
            <div class="help-hero-card">
              <div class="help-hero-main">
                <span class="help-hero-icon"><i class="app-icon" data-lucide="${topic.icon}"></i></span>
                <div class="help-hero-copy">
                  <h4 class="help-hero-title">${this.escapeHtml(topic.heroTitle)}</h4>
                  <p class="help-hero-summary">${this.escapeHtml(topic.heroSummary)}</p>
                </div>
              </div>
              ${heroActionsHtml}
            </div>
            ${sectionsHtml}
          </div>
        </div>
      `;
    }).join('');
  }

  public switchHelpTopic(topicId: HelpTopicId, options: { focusNav?: boolean } = {}): void {
    const helpModal = this.app.getElement('helpModal') || document.getElementById('helpModal');
    if (!helpModal) return;

    const validTopic = HELP_ASSISTANT_TOPICS.some((t) => t.id === topicId) ? topicId : 'welcome';
    this.activeHelpTopic = validTopic;

    const navBtns = Array.from(helpModal.querySelectorAll<HTMLButtonElement>('[data-help-topic]'));
    for (const btn of navBtns) {
      const matches = btn.getAttribute('data-help-topic') === validTopic;
      btn.classList.toggle('active', matches);
      btn.setAttribute('aria-selected', matches ? 'true' : 'false');
      if (matches) {
        btn.setAttribute('focusgroupstart', '');
        btn.removeAttribute('tabindex');
        if (options.focusNav) btn.focus();
      } else {
        btn.removeAttribute('focusgroupstart');
        btn.setAttribute('tabindex', '-1');
      }
    }

    const panes = Array.from(helpModal.querySelectorAll<HTMLElement>('.help-topic-pane'));
    for (const pane of panes) {
      const isMatch = pane.getAttribute('data-topic-pane') === validTopic;
      pane.classList.toggle('active', isMatch);
      if (isMatch) {
        pane.removeAttribute('hidden');
        pane.setAttribute('tabindex', '0');
      } else {
        pane.setAttribute('hidden', 'until-found');
        pane.removeAttribute('tabindex');
      }
    }

    const stage = helpModal.querySelector<HTMLElement>('#helpAssistantStage');
    if (stage) stage.scrollTop = 0;

    this.app.refreshIcons(helpModal);
  }

  private clearHelpSearch(helpModal: HTMLElement): void {
    const input = helpModal.querySelector<HTMLInputElement>('#helpAssistantSearchInput');
    const clearBtn = helpModal.querySelector<HTMLButtonElement>('#btnClearHelpSearch');
    const panesWrap = helpModal.querySelector<HTMLElement>('#helpAssistantPanes');
    const resultsPane = helpModal.querySelector<HTMLElement>('#helpSearchResultsPane');

    if (input) input.value = '';
    if (clearBtn) clearBtn.style.display = 'none';
    if (panesWrap) panesWrap.style.display = 'block';
    if (resultsPane) {
      resultsPane.style.display = 'none';
      resultsPane.innerHTML = '';
    }
  }

  private stripHtml(html: string): string {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  public filterHelpContent(helpModal: HTMLElement, rawQuery: string): void {
    const query = rawQuery.trim().toLowerCase();
    const clearBtn = helpModal.querySelector<HTMLButtonElement>('#btnClearHelpSearch');
    const panesWrap = helpModal.querySelector<HTMLElement>('#helpAssistantPanes');
    const resultsPane = helpModal.querySelector<HTMLElement>('#helpSearchResultsPane');

    if (!query) {
      this.clearHelpSearch(helpModal);
      return;
    }

    if (clearBtn) clearBtn.style.display = 'flex';
    if (panesWrap) panesWrap.style.display = 'none';
    if (!resultsPane) return;

    const terms = query.split(/\s+/).filter(Boolean);
    const matchesAllTerms = (haystack: string) => terms.every((t) => haystack.includes(t));

    const matchedTopics: Array<{ topic: HelpTopicDefinition; matchedSnippets: string[] }> = [];

    for (const topic of HELP_ASSISTANT_TOPICS) {
      const snippets: string[] = [];
      const baseText = [
        topic.navLabel,
        topic.navSubtitle,
        topic.heroTitle,
        topic.heroSummary,
        ...topic.keywords,
      ]
        .join(' ')
        .toLowerCase();

      for (const section of topic.sections) {
        if (section.items) {
          for (const item of section.items) {
            const itemText = `${item.title} ${this.stripHtml(item.descriptionHtml)} ${item.tip || ''}`.toLowerCase();
            if (matchesAllTerms(itemText) || matchesAllTerms(`${baseText} ${itemText}`)) {
              snippets.push(`${item.title}: ${this.stripHtml(item.descriptionHtml)}`);
            }
          }
        }
        if (section.customHtml) {
          const plain = this.stripHtml(section.customHtml).toLowerCase();
          if (matchesAllTerms(`${baseText} ${section.title.toLowerCase()} ${plain}`)) {
            snippets.push(`${section.title}: ${this.stripHtml(section.customHtml).slice(0, 160)}...`);
          }
        }
      }

      if (matchesAllTerms(baseText) || snippets.length > 0) {
        matchedTopics.push({
          topic,
          matchedSnippets: snippets.slice(0, 3),
        });
      }
    }

    if (matchedTopics.length === 0) {
      resultsPane.innerHTML = `
        <div class="help-search-empty">
          <i class="app-icon" data-lucide="search"></i>
          <h4>No matching guides for "${this.escapeHtml(rawQuery.trim())}"</h4>
          <p>Try everyday words like <em>move</em>, <em>ai</em>, <em>ollama</em>, <em>stl</em>, <em>compress</em>, <em>paint</em>, or <em>undo</em>.</p>
        </div>
      `;
    } else {
      resultsPane.innerHTML = `
        <div class="help-search-header">
          <span>Found <strong>${matchedTopics.length}</strong> topic${matchedTopics.length === 1 ? '' : 's'} matching "${this.escapeHtml(rawQuery.trim())}"</span>
        </div>
        <div class="help-search-list">
          ${matchedTopics
            .map(({ topic, matchedSnippets }) => {
              const snippetHtml =
                matchedSnippets.length > 0
                  ? `<ul class="help-search-snippets">${matchedSnippets
                      .map((s) => `<li>${this.escapeHtml(s.length > 170 ? `${s.slice(0, 167)}...` : s)}</li>`)
                      .join('')}</ul>`
                  : `<p class="help-search-summary">${this.escapeHtml(topic.heroSummary)}</p>`;
              return `
                <div class="help-search-result-card">
                  <div class="help-search-result-head">
                    <div class="help-search-result-title">
                      <span class="help-card-icon"><i class="app-icon" data-lucide="${topic.icon}"></i></span>
                      <div>
                        <h5>${this.escapeHtml(topic.navLabel)}</h5>
                        <span>${this.escapeHtml(topic.navSubtitle)}</span>
                      </div>
                    </div>
                    <button type="button" class="tool-btn btn-primary" data-jump-topic="${topic.id}">
                      <span class="btn-label">Open Guide</span>
                      <span class="btn-icon"><i class="app-icon" data-lucide="arrow-right"></i></span>
                    </button>
                  </div>
                  ${snippetHtml}
                </div>
              `;
            })
            .join('')}
        </div>
      `;
    }

    resultsPane.style.display = 'block';
    this.app.refreshIcons(resultsPane);
  }

  private openToolDialogFromHelp(dialogId: string, label: string): void {
    this.closeHelpModal();
    this.app.toggleDialog(dialogId, true);
    const dlg = this.app.getElement(dialogId);
    if (dlg && dlg.classList.contains('minimized')) {
      this.app.toggleDialogMinimize(dlg, false);
    }
    this.app.showToast(`Opened ${label}.`, 'info');
  }

  public handleHelpAction(actionId: HelpActionId): void {
    switch (actionId) {
      case 'start-tour':
        this.startGuidedTour(0);
        break;
      case 'open-create-mesh':
        this.openToolDialogFromHelp('dialog-create-primitive', 'Create Mesh');
        break;
      case 'open-minicad':
        this.openToolDialogFromHelp('dialog-minicad', 'MiniCAD Studio');
        break;
      case 'open-voxel-painter':
        this.openToolDialogFromHelp('dialog-voxel-painter', 'Voxel Painter');
        break;
      case 'open-path-extrusion':
        this.openToolDialogFromHelp('dialog-path-extrusion', 'Path Extrusion');
        break;
      case 'open-text-mesh':
        this.openToolDialogFromHelp('dialog-text-mesh', '3D Text');
        break;
      case 'open-heightmap':
        this.openToolDialogFromHelp('dialog-heightmap', 'Heightmap Terrain');
        break;
      case 'open-sculpt':
        this.openToolDialogFromHelp('dialog-sculpt', 'Figure Sculpt & Retopo');
        break;
      case 'open-csg':
        this.openToolDialogFromHelp('dialog-csg', 'Constructive Solid Geometry');
        break;
      case 'open-facet':
        this.openToolDialogFromHelp('dialog-facet', 'Facet & Vertex Editor');
        break;
      case 'open-material':
        this.openToolDialogFromHelp('dialog-material', 'Material & Texture');
        break;
      case 'open-texture-paint':
        this.openToolDialogFromHelp('dialog-texture-paint', '3D Texture Painter');
        break;
      case 'open-decal':
        this.openToolDialogFromHelp('dialog-decal', 'Decal Painter');
        break;
      case 'open-ai-settings':
        this.closeHelpModal();
        this.stopGuidedTour(false);
        this.app.openSettingsModal('ai');
        break;
      case 'open-ai-agent':
        this.openToolDialogFromHelp('dialog-ai-agent', 'AI Mesh Agent');
        break;
      case 'open-ai-texture':
        this.openToolDialogFromHelp('dialog-ai-texture', 'AI Texture Generator');
        break;
      case 'open-prompt-guide':
        this.closeHelpModal();
        this.showPromptHelp('guide');
        break;
      case 'open-file':
        this.closeHelpModal();
        this.app.triggerOpenModel();
        break;
      case 'import-file':
        this.closeHelpModal();
        this.app.triggerImportModel();
        break;
      case 'open-export':
        this.closeHelpModal();
        this.app.openExportDialog();
        break;
      case 'open-compress':
        this.openToolDialogFromHelp('dialog-compress-model', 'Compress Model');
        break;
      case 'open-texture-optimizer':
        this.openToolDialogFromHelp('dialog-textures', 'Texture Optimizer');
        break;
    }
  }

  public openHelpModal(initialTopicId?: HelpTopicId | string): void {
    this.app.closeAllDropdowns();
    if (this.isGuidedTourOpen()) {
      this.stopGuidedTour(false);
    }
    this.initHelpAssistant();
    this.markHelpAssistantSeen();

    const helpModal = this.app.getElement('helpModal') || document.getElementById('helpModal');
    if (!helpModal) return;

    const chkShowNext = helpModal.querySelector<HTMLInputElement>('#chkHelpShowOnNextVisit');
    if (chkShowNext) {
      chkShowNext.checked = !this.hasSeenHelpAssistant();
    }

    if (initialTopicId && HELP_ASSISTANT_TOPICS.some((t) => t.id === initialTopicId)) {
      this.clearHelpSearch(helpModal);
      this.switchHelpTopic(initialTopicId as HelpTopicId, { focusNav: false });
    }

    const dialogEl = helpModal as HTMLDialogElement;
    if (typeof dialogEl.showModal === 'function') {
      try {
        if (!dialogEl.open) {
          dialogEl.showModal();
        }
      } catch {
        helpModal.setAttribute('open', '');
      }
    } else {
      helpModal.setAttribute('open', '');
    }
    helpModal.classList.add('active');
    this.app.refreshIcons(helpModal);
  }

  public closeHelpModal(): void {
    const helpModal = this.app.getElement('helpModal') || document.getElementById('helpModal');
    if (!helpModal) return;

    const wasOpen = this.isHelpModalOpen();
    const dialogEl = helpModal as HTMLDialogElement;
    if (typeof dialogEl.close === 'function') {
      try {
        if (dialogEl.open) {
          dialogEl.close();
        }
      } catch {
        helpModal.removeAttribute('open');
      }
    } else {
      helpModal.removeAttribute('open');
    }
    helpModal.classList.remove('active');
    if (wasOpen && !this.isGuidedTourOpen()) {
      this.app.canvas?.focus();
    }
  }

  /* =========================================================================
     INTERACTIVE GUIDED TOUR (NON-MODAL POPOVER + SPOTLIGHT)
     ========================================================================= */
  private initGuidedTourEvents(): void {
    const popover = this.app.getElement('helpTourPopover') || document.getElementById('helpTourPopover');
    if (!popover) return;

    popover.querySelector('#btnCloseTour')?.addEventListener('click', () => this.stopGuidedTour(true));
    popover.querySelector('#btnTourPrev')?.addEventListener('click', () => this.prevTourStep());
    popover.querySelector('#btnTourNext')?.addEventListener('click', () => this.nextTourStep());
    popover.querySelector('#btnTourOpenHub')?.addEventListener('click', () => {
      this.stopGuidedTour(false);
      this.openHelpModal('welcome');
    });

    popover.querySelector('#helpTourDots')?.addEventListener('click', (e) => {
      const dot = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-tour-step]');
      if (!dot) return;
      const idx = Number(dot.getAttribute('data-tour-step'));
      if (Number.isFinite(idx)) {
        this.goToTourStep(idx);
      }
    });

    popover.querySelector('#helpTourStepActionWrap')?.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-help-action]');
      if (!btn) return;
      const actionId = btn.getAttribute('data-help-action') as HelpActionId | null;
      if (actionId) {
        this.handleHelpAction(actionId);
      }
    });
  }

  public startGuidedTour(startIndex = 0): void {
    this.initHelpAssistant();
    this.markHelpAssistantSeen();
    this.closeHelpModal();

    const popover = this.app.getElement('helpTourPopover') || document.getElementById('helpTourPopover');
    if (!popover) return;

    if (!this.tourRepositionHandler) {
      this.tourRepositionHandler = () => {
        if (this.isGuidedTourOpen()) {
          this.positionTourStep();
        }
      };
      window.addEventListener('resize', this.tourRepositionHandler);
    }

    if (!this.tourKeydownHandler) {
      this.tourKeydownHandler = (e: KeyboardEvent) => {
        if (!this.isGuidedTourOpen()) return;
        if (e.key === 'Escape') {
          e.preventDefault();
          this.lastEscapeClosedAt = Date.now();
          this.stopGuidedTour(true);
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          this.nextTourStep();
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          this.prevTourStep();
        }
      };
      document.addEventListener('keydown', this.tourKeydownHandler);
    }

    if (typeof (popover as any).showPopover === 'function') {
      try {
        if (!popover.matches(':popover-open')) {
          (popover as any).showPopover();
        }
      } catch {
        popover.classList.add('is-open');
        popover.setAttribute('open', '');
      }
    } else {
      popover.classList.add('is-open');
      popover.setAttribute('open', '');
    }

    this.goToTourStep(startIndex);
    const nextBtn = popover.querySelector<HTMLButtonElement>('#btnTourNext');
    nextBtn?.focus();
  }

  public stopGuidedTour(restoreFocus = true): void {
    if (this.activeTourIndex < 0) return;
    this.activeTourIndex = -1;

    const popover = this.app.getElement('helpTourPopover') || document.getElementById('helpTourPopover');
    const spotlight = this.app.getElement('helpTourSpotlight') || document.getElementById('helpTourSpotlight');

    if (popover) {
      if (typeof (popover as any).hidePopover === 'function') {
        try {
          if (popover.matches(':popover-open')) {
            (popover as any).hidePopover();
          }
        } catch {
          // Ignore
        }
      }
      popover.classList.remove('is-open');
      popover.removeAttribute('open');
    }

    if (spotlight) {
      spotlight.style.display = 'none';
    }

    if (this.tourRepositionHandler) {
      window.removeEventListener('resize', this.tourRepositionHandler);
      this.tourRepositionHandler = null;
    }
    if (this.tourKeydownHandler) {
      document.removeEventListener('keydown', this.tourKeydownHandler);
      this.tourKeydownHandler = null;
    }

    if (restoreFocus) {
      this.app.canvas?.focus();
    }
  }

  public nextTourStep(): void {
    if (this.activeTourIndex >= HELP_TOUR_STEPS.length - 1) {
      this.stopGuidedTour(true);
      this.app.showToast('Guided tour complete! Click "?" anytime to reopen the Help Assistant.', 'success');
      return;
    }
    this.goToTourStep(this.activeTourIndex + 1);
  }

  public prevTourStep(): void {
    if (this.activeTourIndex <= 0) return;
    this.goToTourStep(this.activeTourIndex - 1);
  }

  public goToTourStep(index: number): void {
    const clamped = Math.max(0, Math.min(HELP_TOUR_STEPS.length - 1, index));
    this.activeTourIndex = clamped;
    const step = HELP_TOUR_STEPS[clamped];

    const popover = this.app.getElement('helpTourPopover') || document.getElementById('helpTourPopover');
    if (!popover) return;

    const iconEl = popover.querySelector('#helpTourStepIcon');
    const badgeEl = popover.querySelector('#helpTourStepBadge');
    const titleEl = popover.querySelector('#helpTourStepTitle');
    const descEl = popover.querySelector('#helpTourStepDesc');
    const tipEl = popover.querySelector('#helpTourStepTip');
    const actionWrap = popover.querySelector<HTMLElement>('#helpTourStepActionWrap');
    const dotsEl = popover.querySelector<HTMLElement>('#helpTourDots');
    const prevBtn = popover.querySelector<HTMLButtonElement>('#btnTourPrev');
    const nextBtn = popover.querySelector<HTMLButtonElement>('#btnTourNext');

    if (iconEl) iconEl.innerHTML = `<i class="app-icon" data-lucide="${step.icon}"></i>`;
    if (badgeEl) badgeEl.textContent = step.badge;
    if (titleEl) titleEl.textContent = step.title;
    if (descEl) descEl.textContent = step.description;
    if (tipEl) {
      tipEl.innerHTML = `<i class="app-icon" data-lucide="lightbulb"></i><span>${this.escapeHtml(step.tip)}</span>`;
    }

    if (actionWrap) {
      if (step.action) {
        actionWrap.innerHTML = this.renderActionButtons([step.action]);
        actionWrap.style.display = 'block';
      } else {
        actionWrap.innerHTML = '';
        actionWrap.style.display = 'none';
      }
    }

    if (dotsEl) {
      dotsEl.innerHTML = HELP_TOUR_STEPS.map(
        (s, idx) =>
          `<button type="button" class="help-tour-dot${idx === clamped ? ' active' : ''}" data-tour-step="${idx}" aria-label="Step ${idx + 1}: ${this.escapeHtml(s.title)}" ${idx === clamped ? 'aria-current="step"' : ''}></button>`
      ).join('');
    }

    if (prevBtn) prevBtn.disabled = clamped === 0;
    if (nextBtn) {
      const isLast = clamped === HELP_TOUR_STEPS.length - 1;
      nextBtn.textContent = isLast ? 'Finish Tour' : 'Next';
    }

    this.app.refreshIcons(popover);
    this.positionTourStep();
  }

  private resolveTourTarget(selector: string, fallbackSelector?: string): HTMLElement | null {
    const findVisible = (sel?: string): HTMLElement | null => {
      if (!sel) return null;
      const el =
        (this.app.rootContainer?.querySelector(sel) as HTMLElement | null) ||
        (document.querySelector(sel) as HTMLElement | null);
      if (!el) return null;
      const style = typeof getComputedStyle === 'function' ? getComputedStyle(el) : null;
      if (style && (style.display === 'none' || style.visibility === 'hidden')) return null;
      return el;
    };
    return findVisible(selector) || findVisible(fallbackSelector);
  }

  private positionTourStep(): void {
    if (this.activeTourIndex < 0) return;
    const step = HELP_TOUR_STEPS[this.activeTourIndex];
    const popover = this.app.getElement('helpTourPopover') || document.getElementById('helpTourPopover');
    const spotlight = this.app.getElement('helpTourSpotlight') || document.getElementById('helpTourSpotlight');
    if (!popover || !spotlight) return;

    const target = this.resolveTourTarget(step.targetSelector, step.fallbackSelector);
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800;

    if (!target || step.placement === 'center') {
      if (target && step.id === 'canvas') {
        const r = target.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          spotlight.style.display = 'block';
          spotlight.style.left = `${Math.max(4, r.left + 8)}px`;
          spotlight.style.top = `${Math.max(4, r.top + 8)}px`;
          spotlight.style.width = `${Math.max(40, r.width - 16)}px`;
          spotlight.style.height = `${Math.max(40, r.height - 16)}px`;
        } else {
          spotlight.style.display = 'none';
        }
      } else {
        spotlight.style.display = 'none';
      }

      popover.style.left = '50%';
      popover.style.top = '50%';
      popover.style.transform = 'translate(-50%, -50%)';
      return;
    }

    const rect = target.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      spotlight.style.display = 'none';
      popover.style.left = '50%';
      popover.style.top = '50%';
      popover.style.transform = 'translate(-50%, -50%)';
      return;
    }

    const pad = 6;
    spotlight.style.display = 'block';
    spotlight.style.left = `${Math.max(2, rect.left - pad)}px`;
    spotlight.style.top = `${Math.max(2, rect.top - pad)}px`;
    spotlight.style.width = `${rect.width + pad * 2}px`;
    spotlight.style.height = `${rect.height + pad * 2}px`;

    popover.style.transform = 'none';
    const cardW = Math.min(360, vw - 24);
    const cardH = popover.offsetHeight || 240;
    const gap = 14;

    let left = vw / 2 - cardW / 2;
    let top = vh / 2 - cardH / 2;

    if (step.placement === 'bottom') {
      left = rect.left + rect.width / 2 - cardW / 2;
      top = rect.bottom + gap;
      if (top + cardH > vh - 16) {
        top = Math.max(16, rect.top - cardH - gap);
      }
    } else if (step.placement === 'right') {
      left = rect.right + gap;
      top = rect.top;
      if (left + cardW > vw - 16) {
        left = Math.max(16, rect.left - cardW - gap);
      }
    } else if (step.placement === 'left') {
      left = rect.left - cardW - gap;
      top = rect.top;
      if (left < 16) {
        left = Math.min(vw - cardW - 16, rect.right + gap);
      }
    } else if (step.placement === 'top') {
      left = rect.left + rect.width / 2 - cardW / 2;
      top = rect.top - cardH - gap;
    }

    left = Math.max(12, Math.min(vw - cardW - 12, left));
    top = Math.max(12, Math.min(vh - cardH - 12, top));

    popover.style.left = `${Math.round(left)}px`;
    popover.style.top = `${Math.round(top)}px`;
  }

  public dispose(): void {
    this.stopGuidedTour(false);
  }

  public openAboutModal(): void {
    const aboutModal = this.app.getElement('aboutModal') || document.getElementById('aboutModal');
    if (aboutModal) {
      aboutModal.classList.add('active');
    }
  }

  public closeAboutModal(): void {
    const aboutModal = this.app.getElement('aboutModal') || document.getElementById('aboutModal');
    if (aboutModal && aboutModal.classList.contains('active')) {
      aboutModal.classList.remove('active');
      this.app.canvas?.focus();
    }
  }

  public showToolHelp(toolOrId: string | ToolInterface): void {
    const tool =
      typeof toolOrId === 'string'
        ? this.app.getToolByDialogId(toolOrId) || this.app.getToolByName(toolOrId)
        : toolOrId;
    if (!tool) return;

    let modal = this.app.getElement('toolHelpModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'toolHelpModal';
      modal.innerHTML = `
        <div class="tool-help-dialog" role="dialog" aria-modal="true" aria-labelledby="toolHelpTitle">
          <div class="tool-help-header">
            <div class="tool-help-title-group">
              <span class="tool-help-icon" id="toolHelpIcon"><i class="app-icon" data-lucide="help-circle"></i></span>
              <div class="tool-help-title-col">
                <div class="tool-help-title-row">
                  <h3 class="tool-help-title" id="toolHelpTitle">Tool Guide</h3>
                  <span class="tool-help-badge" id="toolHelpBadge">3D Tool</span>
                </div>
                <div class="tool-help-desc" id="toolHelpDesc">Tool overview and capabilities guide.</div>
              </div>
            </div>
            <button class="dialog-btn btn-close" id="btnCloseToolHelp" title="Close Guide"><i class="app-icon" data-lucide="x"></i></button>
          </div>
          <div class="tool-help-body" id="toolHelpBody"></div>
          <div class="tool-help-footer">
            <button class="tool-btn btn-primary" id="btnDoneToolHelp">Got it!</button>
          </div>
        </div>
      `;
      (this.app.rootContainer || document.body).appendChild(modal);
      this.app.getElement('btnCloseToolHelp')?.addEventListener('click', () => {
        modal!.classList.remove('active');
        modal!.style.display = 'none';
      });
      this.app.getElement('btnDoneToolHelp')?.addEventListener('click', () => {
        modal!.classList.remove('active');
        modal!.style.display = 'none';
      });
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal!.classList.remove('active');
          modal!.style.display = 'none';
        }
      });
    }

    const titleEl = modal.querySelector('#toolHelpTitle') || this.app.getElement('toolHelpTitle');
    const descEl = modal.querySelector('#toolHelpDesc') || this.app.getElement('toolHelpDesc');
    const iconEl = modal.querySelector('#toolHelpIcon') || this.app.getElement('toolHelpIcon');
    const bodyEl = modal.querySelector('#toolHelpBody') || this.app.getElement('toolHelpBody');
    const badgeEl = modal.querySelector('#toolHelpBadge') || this.app.getElement('toolHelpBadge');

    if (titleEl) titleEl.textContent = tool.menuLabel || tool.name;
    if (descEl) descEl.textContent = tool.description || '';
    if (badgeEl) {
      const roleLabel = tool.isExclusive3DTool ? 'Interactive 3D Tool' : 'Editor Tool';
      badgeEl.textContent = tool.category ? `${tool.category} • ${roleLabel}` : roleLabel;
    }
    if (iconEl) {
      iconEl.innerHTML = `<i class="app-icon" data-lucide="${tool.icon || 'help-circle'}"></i>`;
    }
    if (bodyEl) {
      bodyEl.innerHTML = tool.helpText || `<p>${tool.description}</p>`;
      const btnFromHelp = bodyEl.querySelector('#btnOpenPromptGuideFromHelp');
      if (btnFromHelp) {
        btnFromHelp.addEventListener('click', () => {
          modal.classList.remove('active');
          modal.style.display = 'none';
          this.showPromptHelp('guide');
        });
      }
    }

    this.app.refreshIcons();
    modal.classList.add('active');
    modal.style.display = 'flex';
  }

  public showPromptHelp(initialTab: 'guide' | 'tools' | 'examples' = 'guide'): void {
    let modal = this.app.getElement('promptHelpModal') || document.getElementById('promptHelpModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'promptHelpModal';
      modal.innerHTML = `
        <div class="prompt-help-dialog" role="dialog" aria-modal="true" aria-labelledby="promptHelpTitle">
          <div class="prompt-help-header">
            <div class="prompt-help-title-group">
              <span class="prompt-help-icon" id="promptHelpIcon"><i class="app-icon" data-lucide="book-open"></i></span>
              <div class="prompt-help-title-col">
                <div class="prompt-help-title-row">
                  <h3 class="prompt-help-title" id="promptHelpTitle">AI Prompting &amp; Tools Guide</h3>
                  <span class="prompt-help-badge" id="promptHelpBadge">AI Mesh Modeler</span>
                </div>
                <div class="prompt-help-desc" id="promptHelpDesc">Comprehensive guide for crafting 3D prompts and full directory of available modeling tools.</div>
              </div>
            </div>
            <button class="dialog-btn btn-close" id="btnClosePromptHelp" title="Close Guide"><i class="app-icon" data-lucide="x"></i></button>
          </div>

          <div class="prompt-help-tabs" id="promptHelpTabs">
            <button type="button" class="prompt-tab-btn active" data-tab="guide">
              <i class="app-icon" data-lucide="wand-2"></i> Prompting Guide
            </button>
            <button type="button" class="prompt-tab-btn" data-tab="tools">
              <i class="app-icon" data-lucide="wrench"></i> Available AI Tools <span class="tab-badge" id="promptHelpToolCountBadge">44</span>
            </button>
            <button type="button" class="prompt-tab-btn" data-tab="examples">
              <i class="app-icon" data-lucide="sparkles"></i> Prompt Templates
            </button>
          </div>

          <div class="prompt-help-body" id="promptHelpBody">
            <div class="prompt-tab-pane active" id="tabPaneGuide">
              <div class="prompt-guide-section">
                <h4><i class="app-icon" data-lucide="bot"></i> How the AI Agent Uses 3D Tools</h4>
                <p>
                  The <strong>AI Mesh Agent</strong> is an autonomous 3D modeler with direct access to specialized Babylon.js modeling functions.
                  Instead of generating a static black-box mesh, it constructs geometry step-by-step using parameters you describe.
                  You can let the AI pick appropriate tools automatically, or you can <strong>explicitly instruct it which tools to execute</strong> for pinpoint precision.
                </p>
              </div>

              <div class="prompt-guide-section">
                <h4><i class="app-icon" data-lucide="terminal"></i> Referencing Tools in Your Prompts</h4>
                <p>
                  You can reference tools by their exact function identifier (such as <code>modeler_create_lathe</code>, <code>modeler_boolean_operation</code>, <code>modeler_create_wall</code>, <code>modeler_solidify_mesh</code>)
                  or by their natural modeling names (e.g. <em>lathe, boolean subtract, solidify wall thickness, facet inset</em>).
                </p>
                <div class="prompt-example-card">
                  <div class="example-label">Example 1: Rotational Lathe Body</div>
                  <code>"Use modeler_create_lathe with 16 points to build a ceramic vase with a fluted neck, then apply a glazed porcelain material."</code>
                </div>
                <div class="prompt-example-card">
                  <div class="example-label">Example 2: Parametric Architecture</div>
                  <code>"Build a stone gateway using modeler_create_wall, cut an arched doorway with modeler_create_arch, and add a pediment roof with modeler_create_roof."</code>
                </div>
                <div class="prompt-example-card">
                  <div class="example-label">Example 3: CSG Carving &amp; Inset</div>
                  <code>"Create a rounded casing with modeler_create_rounded_box, carve a cylinder with modeler_boolean_operation (subtract), and apply bevel modifier."</code>
                </div>
              </div>

              <div class="prompt-guide-section">
                <h4><i class="app-icon" data-lucide="compass"></i> 5 Rules for High-Fidelity 3D Prompts</h4>
                <ul class="prompt-rules-list">
                  <li>
                    <strong>1. Bottom-Alignment &amp; Grounding (Y = 0):</strong> Babylon.js uses Y-up. Mention that objects stand on ground at Y = 0 (bottom-aligned) so bases and feet stay flat on the ground plane.
                  </li>
                  <li>
                    <strong>2. Part Hierarchy &amp; Polygon Budget:</strong> Deconstruct objects into Primary volumes (torso, main walls: ~50-65% budget), Secondary parts (limbs, roof: ~25-35%), and Tertiary details (eyes, rivets, bolts, trim: &lt;15%). Small parts should use <code>detailTier: "tertiary"</code>.
                  </li>
                  <li>
                    <strong>3. Beveled Hard Surfaces:</strong> Real-world objects have beveled edges that catch highlights. Request rounded edges (<code>modeler_create_rounded_box</code>) or bevel radius rather than raw sharp cubes.
                  </li>
                  <li>
                    <strong>4. PBR Materials &amp; Normal Maps:</strong> Specify roughness (0.1–0.2 for glossy, 0.8–0.95 for matte stone/wood), metallic values (0.85+ for steel/gold), and procedural styles (<code>cobblestone</code>, <code>wood</code>, <code>marble</code>, <code>tiles</code>, <code>metal</code>, <code>sand</code>) or normal maps for micro-surface relief.
                  </li>
                  <li>
                    <strong>5. Modifying Existing Meshes:</strong> Select an existing mesh in the 3D viewport, then prompt adjustments (e.g. <em>"Scale this mesh by 1.2 on X, separate loose parts, and change material to gold"</em>).
                  </li>
                </ul>
              </div>

              <div class="prompt-guide-section">
                <h4><i class="app-icon" data-lucide="camera"></i> Multimodal Prompting: Vision &amp; Screenshots</h4>
                <p>
                  Attach concept art, photos, or diagrams using the Image button or Drag &amp; Drop.
                  Click the <strong>Camera button</strong> to attach an instant snapshot of your current 3D viewport so the vision model can visually inspect proportions, alignment, and silhouettes.
                </p>
              </div>
            </div>

            <div class="prompt-tab-pane" id="tabPaneTools" style="display: none;">
              <div class="prompt-tools-filter-bar">
                <div class="prompt-tools-search-wrap">
                  <i class="app-icon" data-lucide="search"></i>
                  <input
                    type="text"
                    id="promptToolSearchInput"
                    class="tool-input prompt-tools-search-input"
                    placeholder="Search tools by name, category or description (e.g. lathe, boolean, wall, uv, voxel)..."
                    autocomplete="off"
                    spellcheck="false"
                  />
                  <button type="button" class="prompt-tools-clear-search" id="btnClearPromptToolSearch" style="display: none;" title="Clear search">&times;</button>
                </div>
                <div class="prompt-category-chips" id="promptCategoryChips">
                  <button type="button" class="prompt-category-chip active" data-category="all">All</button>
                  <button type="button" class="prompt-category-chip" data-category="shapes">Shapes &amp; Primitives</button>
                  <button type="button" class="prompt-category-chip" data-category="architecture">Architecture</button>
                  <button type="button" class="prompt-category-chip" data-category="modifiers">CSG &amp; Modifiers</button>
                  <button type="button" class="prompt-category-chip" data-category="facet">Facet Modeling</button>
                  <button type="button" class="prompt-category-chip" data-category="materials">Materials &amp; UV</button>
                  <button type="button" class="prompt-category-chip" data-category="voxels">Voxels</button>
                  <button type="button" class="prompt-category-chip" data-category="transforms">Transforms &amp; Rigging</button>
                  <button type="button" class="prompt-category-chip" data-category="workflow">Scene &amp; Workflow</button>
                </div>
                <div class="prompt-tools-status-row">
                  <span id="promptToolsCount" class="prompt-tools-count">Loading tools...</span>
                </div>
              </div>

              <div class="prompt-tools-list" id="promptToolsList"></div>
            </div>

            <div class="prompt-tab-pane" id="tabPaneExamples" style="display: none;">
              <div class="prompt-templates-container" id="promptTemplatesContainer"></div>
            </div>
          </div>

          <div class="prompt-help-footer">
            <div class="prompt-help-footer-hint">
              <i class="app-icon" data-lucide="info"></i>
              <span>Click <strong>Insert</strong> on any tool or template to insert it into your prompt input.</span>
            </div>
            <button class="tool-btn btn-primary" id="btnDonePromptHelp">Got it!</button>
          </div>
        </div>
      `;
      (this.app.rootContainer || document.body).appendChild(modal);
    }

    this.initPromptHelpModalEvents(modal);
    this.renderPromptHelpToolsList(modal);
    this.renderPromptHelpTemplates(modal);
    this.switchPromptHelpTab(modal, initialTab);

    modal.classList.add('active');
    modal.style.display = 'flex';
    this.app.refreshIcons();
  }

  public hidePromptHelp(): void {
    const modal = this.app.getElement('promptHelpModal') || document.getElementById('promptHelpModal');
    if (modal) {
      modal.classList.remove('active');
      modal.style.display = 'none';
    }
    this.app.canvas?.focus();
  }

  private insertToolIntoPrompt(textToInsert: string): void {
    this.app.toggleDialog('dialog-ai-agent', true);
    const dialog = this.app.getElement('dialog-ai-agent');
    if (dialog && dialog.classList.contains('minimized')) {
      this.app.toggleDialogMinimize(dialog, false);
    }

    const promptInput = this.app.getElement<HTMLTextAreaElement>('aiPromptInput');
    if (promptInput) {
      const current = promptInput.value.trim();
      if (!current) {
        promptInput.value = textToInsert;
      } else if (!current.includes(textToInsert)) {
        promptInput.value = `${current} ${textToInsert}`;
      }
      promptInput.focus();
      const len = promptInput.value.length;
      promptInput.setSelectionRange(len, len);
    }

    this.app.showToast(`Inserted "${textToInsert}" into prompt input.`, 'info');
  }

  private initPromptHelpModalEvents(modal: HTMLElement): void {
    if (this.hasInitializedPromptHelpModal) return;
    this.hasInitializedPromptHelpModal = true;

    modal.querySelector('#btnClosePromptHelp')?.addEventListener('click', () => {
      this.hidePromptHelp();
    });
    modal.querySelector('#btnDonePromptHelp')?.addEventListener('click', () => {
      this.hidePromptHelp();
    });
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        this.hidePromptHelp();
      }
    });

    const tabBtns = modal.querySelectorAll<HTMLButtonElement>('.prompt-tab-btn');
    tabBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = (btn.getAttribute('data-tab') || 'guide') as 'guide' | 'tools' | 'examples';
        this.switchPromptHelpTab(modal, tab);
      });
    });

    const searchInput = modal.querySelector<HTMLInputElement>('#promptToolSearchInput');
    const clearBtn = modal.querySelector<HTMLButtonElement>('#btnClearPromptToolSearch');
    const categoryChips = modal.querySelectorAll<HTMLButtonElement>('.prompt-category-chip');

    const filterTools = () => {
      const query = (searchInput?.value || '').trim().toLowerCase();
      if (clearBtn) {
        clearBtn.style.display = query ? 'block' : 'none';
      }
      const activeChip = modal.querySelector<HTMLButtonElement>('.prompt-category-chip.active');
      const activeCat = activeChip?.getAttribute('data-category') || 'all';

      const items = modal.querySelectorAll<HTMLElement>('.prompt-tool-item');
      let visibleCount = 0;
      items.forEach((item) => {
        const itemCat = item.getAttribute('data-tool-category') || '';
        const name = (item.getAttribute('data-tool-name') || '').toLowerCase();
        const desc = (item.getAttribute('data-tool-desc') || '').toLowerCase();

        const matchesCat = activeCat === 'all' || itemCat === activeCat;
        const matchesQuery = !query || name.includes(query) || desc.includes(query);

        if (matchesCat && matchesQuery) {
          item.style.display = 'flex';
          visibleCount++;
        } else {
          item.style.display = 'none';
        }
      });

      const countEl = modal.querySelector('#promptToolsCount');
      if (countEl) {
        countEl.textContent = `Showing ${visibleCount} of ${items.length} tools`;
      }
    };

    searchInput?.addEventListener('input', filterTools);
    clearBtn?.addEventListener('click', () => {
      if (searchInput) {
        searchInput.value = '';
        searchInput.focus();
      }
      filterTools();
    });

    categoryChips.forEach((chip) => {
      chip.addEventListener('click', () => {
        categoryChips.forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        filterTools();
      });
    });
  }

  private switchPromptHelpTab(modal: HTMLElement, tabId: 'guide' | 'tools' | 'examples'): void {
    const tabBtns = modal.querySelectorAll<HTMLButtonElement>('.prompt-tab-btn');
    tabBtns.forEach((btn) => {
      const matches = btn.getAttribute('data-tab') === tabId;
      btn.classList.toggle('active', matches);
    });

    const panes: Record<string, string> = {
      guide: 'tabPaneGuide',
      tools: 'tabPaneTools',
      examples: 'tabPaneExamples',
    };

    Object.entries(panes).forEach(([key, elementId]) => {
      const pane = modal.querySelector<HTMLElement>(`#${elementId}`);
      if (pane) {
        const isActive = key === tabId;
        pane.classList.toggle('active', isActive);
        pane.style.display = isActive ? 'flex' : 'none';
      }
    });

    this.app.refreshIcons();
  }

  private renderPromptHelpToolsList(modal: HTMLElement): void {
    const listEl = modal.querySelector<HTMLElement>('#promptToolsList');
    if (!listEl) return;

    // Get all registered AI tools dynamically from ToolRegistry
    const tools = (this.app.service?.aiAgent?.toolRegistry
      ? this.app.service.aiAgent.toolRegistry.getAll()
      : createDefaultToolRegistry().getAll());

    const countBadge = modal.querySelector('#promptHelpToolCountBadge');
    if (countBadge) {
      countBadge.textContent = String(tools.length);
    }
    const countStatus = modal.querySelector('#promptToolsCount');
    if (countStatus) {
      countStatus.textContent = `Showing ${tools.length} of ${tools.length} tools`;
    }

    const getCategoryInfo = (toolName: string): { key: string; label: string } => {
      const lower = toolName.toLowerCase();
      if (
        lower.includes('wall') ||
        lower.includes('arch') ||
        lower.includes('column') ||
        lower.includes('molding') ||
        lower.includes('stairs') ||
        lower.includes('roof')
      ) {
        return { key: 'architecture', label: 'Architecture' };
      }
      if (lower.includes('facet')) {
        return { key: 'facet', label: 'Facet Modeling' };
      }
      if (
        lower.includes('primitive') ||
        lower.includes('rounded_box') ||
        lower.includes('lathe') ||
        lower.includes('tube') ||
        lower.includes('extrude') ||
        lower.includes('sdf') ||
        lower.includes('spawn') ||
        lower.includes('text_mesh') ||
        lower.includes('heightmap')
      ) {
        return { key: 'shapes', label: 'Shapes & Primitives' };
      }
      if (
        lower.includes('boolean') ||
        lower.includes('solidify') ||
        lower.includes('subd') ||
        lower.includes('merge') ||
        lower.includes('separate') ||
        lower.includes('retopologize') ||
        lower.includes('sculpt')
      ) {
        return { key: 'modifiers', label: 'CSG & Modifiers' };
      }
      if (
        lower.includes('material') ||
        lower.includes('texture') ||
        lower.includes('decal') ||
        lower.includes('uv') ||
        lower.includes('bake')
      ) {
        return { key: 'materials', label: 'Materials & UV' };
      }
      if (lower.includes('voxel')) {
        return { key: 'voxels', label: 'Voxels' };
      }
      if (
        lower.includes('rig') ||
        lower.includes('transform') ||
        lower.includes('clone') ||
        lower.includes('delete')
      ) {
        return { key: 'transforms', label: 'Transforms & Rigging' };
      }
      return { key: 'workflow', label: 'Scene & Workflow' };
    };

    const escapeAttr = (str: string) =>
      str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const escapeHtml = (str: string) =>
      str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const sortedTools = [...tools].sort((a, b) => a.name.localeCompare(b.name));

    listEl.innerHTML = sortedTools
      .map((tool) => {
        const cat = getCategoryInfo(tool.name);
        return `
          <div class="prompt-tool-item" data-tool-name="${escapeAttr(tool.name)}" data-tool-category="${cat.key}" data-tool-desc="${escapeAttr(tool.description)}">
            <div class="prompt-tool-header">
              <div class="prompt-tool-identity">
                <code class="prompt-tool-code">${escapeHtml(tool.name)}</code>
                <span class="prompt-tool-cat-badge">${escapeHtml(cat.label)}</span>
              </div>
              <div class="prompt-tool-actions">
                <button type="button" class="tool-mini-btn btn-copy-tool" data-tool-name="${escapeAttr(tool.name)}" title="Copy tool name to clipboard">
                  <i class="app-icon" data-lucide="copy"></i> <span>Copy</span>
                </button>
                <button type="button" class="tool-mini-btn btn-primary btn-insert-tool" data-tool-name="${escapeAttr(tool.name)}" title="Insert tool into prompt">
                  <i class="app-icon" data-lucide="corner-down-left"></i> <span>Insert</span>
                </button>
              </div>
            </div>
            <div class="prompt-tool-desc">
              ${escapeHtml(tool.description)}
            </div>
          </div>
        `;
      })
      .join('');

    listEl.querySelectorAll<HTMLButtonElement>('.btn-copy-tool').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const toolName = btn.getAttribute('data-tool-name') || '';
        if (!toolName) return;

        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(toolName).catch(() => {});
        } else {
          const ta = document.createElement('textarea');
          ta.value = toolName;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          ta.remove();
        }

        const label = btn.querySelector('span');
        const originalText = label ? label.textContent : 'Copy';
        if (label) label.textContent = 'Copied!';
        btn.classList.add('copied');
        this.app.showToast(`Copied "${toolName}" to clipboard.`, 'info');

        setTimeout(() => {
          if (label) label.textContent = originalText;
          btn.classList.remove('copied');
        }, 1500);
      });
    });

    listEl.querySelectorAll<HTMLButtonElement>('.btn-insert-tool').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const toolName = btn.getAttribute('data-tool-name') || '';
        if (toolName) {
          this.insertToolIntoPrompt(toolName);
          this.hidePromptHelp();
        }
      });
    });
  }

  private renderPromptHelpTemplates(modal: HTMLElement): void {
    const container = modal.querySelector<HTMLElement>('#promptTemplatesContainer');
    if (!container || container.children.length > 0) return;

    const templates = [
      {
        title: 'Classical Greek Temple Facade',
        badge: 'Architecture',
        prompt: 'Build a classical Greek temple facade with 4 fluted ionic columns (modeler_create_column), stone steps (modeler_create_stairs), and a pediment gable roof (modeler_create_roof). Apply weathered marble material.',
      },
      {
        title: 'Medieval Fortress Watchtower',
        badge: 'Architecture',
        prompt: 'Create a circular stone watchtower with modeler_create_wall and modeler_create_arch for arched windows. Add battlements around the roof and apply cobblestone texture with modeler_generate_texture.',
      },
      {
        title: 'Ceramic Lathe Goblet / Vase',
        badge: 'Lathe & Shell',
        prompt: 'Use modeler_create_lathe with 16 points to generate a smooth ceramic vase with an elegant curved silhouette. Solidify with modeler_solidify_mesh (thickness: 0.12) and apply glazed porcelain PBR material.',
      },
      {
        title: 'Reinforced Wooden Treasure Chest',
        badge: 'Bevel & CSG',
        prompt: 'Build a wooden treasure chest using modeler_create_rounded_box for the base and an arched lid. Add iron bands with metallic rivets, a front keyhole lock, and weathered oak wood texture.',
      },
      {
        title: 'Sci-Fi Electronic Device Casing',
        badge: 'CSG & Modifiers',
        prompt: 'Create a rounded device casing using modeler_create_rounded_box, carve a central hexagonal display cavity using modeler_boolean_operation (subtract), and apply brushed steel material.',
      },
      {
        title: 'Stylized Low-Poly Fantasy Tree',
        badge: 'Tube & SDF',
        prompt: 'Create a stylized fantasy tree with a twisted wooden trunk using modeler_create_tube, top it with organic metaball foliage using modeler_create_sdf_mesh, and apply bark and leaf materials.',
      },
      {
        title: 'Organic Character Torso & Sub-D Smooth',
        badge: 'Sub-D Modeling',
        prompt: 'Spawn a character blockout base mesh using modeler_spawn_base_mesh, then apply modeler_subd_smooth with iterations 2 for clean organic surface curvature.',
      },
      {
        title: 'Game-Ready UV Unwrapping & Island Packing',
        badge: 'UV & Unwrapping',
        prompt: 'Unwrap UVs on the selected mesh using modeler_uv_unwrap with smart seams, normalized texel density 256 px/m, and pack islands into [0, 1] space.',
      },
      {
        title: 'High-to-Low Normal & AO Texture Baking',
        badge: 'Baking & Detail',
        prompt: 'Bake normal and ambient occlusion maps from the high-poly sculpt onto the low-poly mesh using modeler_bake_textures with a 0.05 projection cage.',
      },
      {
        title: '3D Extruded Sci-Fi Logo Signboard',
        badge: 'Text Mesh',
        prompt: "Create an extruded 3D logo text mesh saying 'CYBERPUNK' using modeler_create_text_mesh with font kenney_future, depth 0.4, and cyan emissive glowing color.",
      },
      {
        title: 'Retro Pixel-Art Campfire Prop',
        badge: 'Voxel Painter',
        prompt: 'Build a 16x16 pixel-art campfire using modeler_build_voxel_mesh with log wood, red ember voxels, and orange flame voxels.',
      },
      {
        title: 'Heightmap Terrain & Splat Path',
        badge: 'Heightmap Terrain',
        prompt:
          "Build an alpine mountain range or tropical island terrain using modeler_create_heightmap with preset 'island', maxHeight 18, texture1 'rock', texture2 'grass', texture3 'sand', custom grayscale heightStrokes, and pathPoints to carve a winding path.",
      },
    ];

    container.innerHTML = templates
      .map(
        (t) => `
        <div class="prompt-template-card">
          <div class="prompt-template-header">
            <div class="prompt-template-title-group">
              <h5 class="prompt-template-title">${t.title}</h5>
              <span class="prompt-template-badge">${t.badge}</span>
            </div>
            <button type="button" class="tool-mini-btn btn-primary btn-use-template" data-prompt="${t.prompt.replace(/"/g, '&quot;')}" title="Insert template into prompt input">
              <i class="app-icon" data-lucide="corner-down-left"></i> <span>Use Prompt</span>
            </button>
          </div>
          <p class="prompt-template-prompt"><code>${t.prompt}</code></p>
        </div>
      `
      )
      .join('');

    container.querySelectorAll<HTMLButtonElement>('.btn-use-template').forEach((btn) => {
      btn.addEventListener('click', () => {
        const p = btn.getAttribute('data-prompt') || '';
        if (p) {
          this.insertToolIntoPrompt(p);
          this.hidePromptHelp();
        }
      });
    });
  }
}
