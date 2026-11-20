import { createDefaultToolRegistry, ToolInterface } from '../tools';
import { AIQuickPrompt, getAllQuickPrompts, normalizePromptImageUrl } from '../tools/editor/aiQuickPrompts';
import type { MeshEditorAppHost } from './MeshEditorAppHost';

export class HelpModalService {
  private hasInitializedPromptHelpModal = false;

  constructor(private readonly app: MeshEditorAppHost) {}

  public openHelpModal(): void {
    const helpModal = this.app.getElement('helpModal') || document.getElementById('helpModal');
    if (helpModal) {
      helpModal.classList.add('active');
    }
  }

  public closeHelpModal(): void {
    const helpModal = this.app.getElement('helpModal') || document.getElementById('helpModal');
    if (helpModal && helpModal.classList.contains('active')) {
      helpModal.classList.remove('active');
      this.app.canvas?.focus();
    }
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
