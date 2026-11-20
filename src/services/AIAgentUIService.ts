import { marked } from 'marked';
import { AI_PROTOCOL_INFO, resolveProtocol } from '../AIAgentService';
import { AI_CHAT_EMPTY_HTML } from '../template';
import {
  AI_QUICK_PROMPTS,
  AIQuickPrompt,
  getAllQuickPrompts,
  getQuickPromptById,
  normalizePromptImageUrl,
} from '../tools/editor/aiQuickPrompts';
import type { AIAgentProtocol, AIAgentToolExecutionStep } from '../types';
import type { MeshEditorAppHost } from './MeshEditorAppHost';

export class AIAgentUIService {
  public aiPendingImages: string[] = [];
  public aiAbortController: AbortController | null = null;
  public isAIGenerating: boolean = false;
  public initialChatEmptyHtml: string = '';
  private speechRecognition: any = null;
  private isRecordingSpeech: boolean = false;
  private speechInitialPrompt: string = '';
  public syncAIAgentImageGenUI: (() => void) | null = null;

  constructor(private readonly app: MeshEditorAppHost) {}

  public dispose(): void {
    this.stopSpeechRecognition();
  }

  public renderAISkills(): void {
    const skillsList = this.app.getElement<HTMLElement>('aiSkillsList');
    if (!skillsList) return;
    const skills = this.app.service.aiAgent.getSkills();
    skillsList.innerHTML = '';
    for (const skill of skills) {
      const checked = skill.enabled;
      const label = document.createElement('label');
      label.className = 'ai-skill-item';
      label.title = skill.description;
      label.innerHTML = `
        <input type="checkbox" data-skill-id="${skill.id}" ${checked ? 'checked' : ''} />
        <span class="ai-skill-info">
          <span class="ai-skill-name">${skill.name}</span>
          <span class="ai-skill-desc">${skill.description}</span>
        </span>
      `;
      const checkbox = label.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
      checkbox?.addEventListener('change', () => {
        this.app.service.aiAgent.setSkillEnabled(skill.id, !!checkbox.checked);
      });
      skillsList.appendChild(label);
    }
  }

  public refreshAIEndpointBadge(): void {
    const endpointBadge =
      this.app.getElement<HTMLElement>('aiEndpointSummaryText') || this.app.getElement<HTMLElement>('aiEndpointBadge');
    const endpointDot = this.app.getElement<HTMLElement>('aiEndpointStatusDot');
    const cfg = this.app.service.aiAgent.getConfig();
    const protocol = resolveProtocol(cfg);
    const protoBadge =
      protocol !== 'openai' ? `${AI_PROTOCOL_INFO[protocol]?.shortBadge || protocol} • ` : '';
    const isAgy =
      cfg.baseUrl.includes('/api/antigravity') ||
      cfg.baseUrl.includes('localhost:8787') ||
      cfg.baseUrl.includes('127.0.0.1:8787');
    const isCliBridge =
      cfg.baseUrl.includes('localhost:8788') || cfg.baseUrl.includes('127.0.0.1:8788');
    let host = isAgy ? 'Antigravity' : isCliBridge ? 'CLI Bridge' : cfg.baseUrl;
    if (!isAgy && !isCliBridge) {
      try {
        const u = new URL(cfg.baseUrl);
        host = u.host;
      } catch {
        // Keep raw string if not a valid URL
      }
    }
    const isLocal = isAgy || isCliBridge || host.includes('localhost') || host.includes('127.0.0.1');
    const hasKey = !!cfg.apiKey || isLocal;
    const keyStatus = isAgy
      ? 'Account ✓'
      : isCliBridge
        ? 'Local CLI'
        : cfg.apiKey
          ? 'Key ✓'
          : isLocal
            ? 'Local'
            : 'No Key';
    const minP = cfg.minPolygons ?? 200;
    const maxP = cfg.maxPolygons ?? 5000;
    const formatPoly = (n: number) => {
      if (n >= 1000000) return (n / 1000000).toFixed(n % 1000000 === 0 ? 0 : 1) + 'M';
      if (n >= 1000) return (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + 'k';
      return String(n);
    };
    const polySummary = `${formatPoly(minP)}–${formatPoly(maxP)}p`;
    const enabledNeural = this.app.service.aiAgent.getEnabledNeural3DProviders();
    const neuralSuffix =
      enabledNeural.length > 0
        ? ` • 3D: ${enabledNeural.map((p) => (p.id === 'trellis' ? 'TRELLIS' : p.id === 'hunyuan3d' ? 'Hunyuan3D' : 'Hi3D')).join('+')}`
        : '';
    if (endpointBadge) {
      endpointBadge.textContent = `${cfg.model} • ${protoBadge}${polySummary} • ${host} (${keyStatus})${neuralSuffix}`;
    }
    if (endpointDot) {
      endpointDot.classList.toggle('is-ready', hasKey);
    }
  }

  public copyToClipboard(text: string, button?: HTMLElement): void {
    if (!text) return;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => {
        this.fallbackCopyToClipboard(text);
      });
    } else {
      this.fallbackCopyToClipboard(text);
    }
    if (button) {
      button.classList.add('is-copied');
      const icon = button.querySelector('i');
      if (icon) {
        icon.setAttribute('data-lucide', 'check');
        if (typeof (window as any).lucide?.createIcons === 'function') {
          (window as any).lucide.createIcons();
        }
      }
      setTimeout(() => {
        button.classList.remove('is-copied');
        if (icon) {
          icon.setAttribute('data-lucide', 'copy');
          if (typeof (window as any).lucide?.createIcons === 'function') {
            (window as any).lucide.createIcons();
          }
        }
      }, 1500);
    }
    this.app.showToast('Copied to clipboard!', 'info');
  }

  private fallbackCopyToClipboard(text: string): void {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    } catch {
      // ignore
    }
  }

  public initAIAgentUI(): void {
    const promptInput = this.app.getElement<HTMLTextAreaElement>('aiPromptInput');
    const imageFileInput = this.app.getElement<HTMLInputElement>('aiImageFileInput');
    const chatLog = this.app.getElement<HTMLElement>('aiChatLog');
    const createTexturesCheckQuick = this.app.getElement<HTMLInputElement>('aiCreateTexturesCheckQuick');
    const createNormalMapsCheckQuick = this.app.getElement<HTMLInputElement>('aiCreateNormalMapsCheckQuick');
    const visualCritiqueCheckQuick = this.app.getElement<HTMLInputElement>('aiVisualCritiqueCheckQuick');
    const checkZFightingCheckQuick = this.app.getElement<HTMLInputElement>('aiCheckZFightingCheckQuick');

    if (chatLog) {
      if (!chatLog.innerHTML.trim()) {
        chatLog.innerHTML = AI_CHAT_EMPTY_HTML;
      }
      this.initialChatEmptyHtml = chatLog.innerHTML;
    }

    const initialConfig = this.app.service.aiAgent.getConfig();
    if (createTexturesCheckQuick) createTexturesCheckQuick.checked = initialConfig.createTextures !== false;
    if (createNormalMapsCheckQuick) createNormalMapsCheckQuick.checked = initialConfig.createNormalMaps !== false;
    if (visualCritiqueCheckQuick) visualCritiqueCheckQuick.checked = !!initialConfig.visualCritique;
    if (checkZFightingCheckQuick) checkZFightingCheckQuick.checked = initialConfig.checkZFighting !== false;

    createTexturesCheckQuick?.addEventListener('change', () => {
      this.app.service.aiAgent.saveConfig({ createTextures: !!createTexturesCheckQuick.checked });
      this.app.syncAISettingsControlsUI?.();
      this.refreshAIEndpointBadge();
    });

    createNormalMapsCheckQuick?.addEventListener('change', () => {
      this.app.service.aiAgent.saveConfig({ createNormalMaps: !!createNormalMapsCheckQuick.checked });
      this.app.syncAISettingsControlsUI?.();
      this.refreshAIEndpointBadge();
    });

    visualCritiqueCheckQuick?.addEventListener('change', () => {
      this.app.service.aiAgent.saveConfig({ visualCritique: !!visualCritiqueCheckQuick.checked });
      this.app.syncAISettingsControlsUI?.();
      this.refreshAIEndpointBadge();
    });

    checkZFightingCheckQuick?.addEventListener('change', () => {
      this.app.service.aiAgent.saveConfig({ checkZFighting: !!checkZFightingCheckQuick.checked });
      this.app.syncAISettingsControlsUI?.();
      this.refreshAIEndpointBadge();
    });

    this.refreshAIEndpointBadge();

    this.app.getElement('btnOpenAISettingsInline')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.app.openSettingsModal('ai');
    });

    // Initialize AI Quick Prompts select-like dropdown from JS array
    this.initAIQuickPrompts();

    // Image attachments (Upload File, Capture 3D Viewport, Paste)
    this.app.getElement('btnAIAttachImage')?.addEventListener('click', () => {
      imageFileInput?.click();
    });

    imageFileInput?.addEventListener('change', (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (!files || files.length === 0) return;
      Array.from(files).forEach((file) => {
        if (!file.type.startsWith('image/')) return;
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === 'string') {
            this.aiPendingImages.push(reader.result);
            this.renderAIAttachments();
          }
        };
        reader.readAsDataURL(file);
      });
      imageFileInput.value = '';
    });

    this.app.getElement('btnAICaptureView')?.addEventListener('click', () => {
      const dataUrl = this.app.service.aiAgent.captureViewportDataUrl();
      if (dataUrl) {
        this.aiPendingImages.push(dataUrl);
        this.renderAIAttachments();
        this.app.showToast('Captured 3D viewport snapshot for AI Agent.', 'info');
      } else {
        this.app.showToast('Could not capture viewport image.', 'warning');
      }
    });

    promptInput?.addEventListener('paste', (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            const reader = new FileReader();
            reader.onload = () => {
              if (typeof reader.result === 'string') {
                this.aiPendingImages.push(reader.result);
                this.renderAIAttachments();
              }
            };
            reader.readAsDataURL(file);
          }
        }
      }
    });

    // Prompting Guide & Tools Directory buttons
    this.app.getElement('btnAIPromptHelp')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.app.showPromptHelp('guide');
    });

    this.app.getElement('btnAIPromptHelpHeader')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.app.showPromptHelp('guide');
    });

    // Speech-to-Text Voice Recording
    this.app.getElement('btnAIRecordSpeech')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleSpeechRecognition();
    });

    // Clear chat history
    this.app.getElement('btnAIClearChat')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.app.service.aiAgent.clearChatHistory();
      const chatLog = this.app.getElement('aiChatLog');
      if (chatLog) {
        chatLog.innerHTML = this.initialChatEmptyHtml || AI_CHAT_EMPTY_HTML;
      }
      this.app.showToast('AI Agent chat history cleared.', 'info');
    });

    // Generate & Stop buttons
    this.app.getElement('btnAIGenerate')?.addEventListener('click', () => {
      this.runAIAgentPrompt();
    });

    this.app.getElement('btnAIStop')?.addEventListener('click', () => {
      this.stopAIGeneration();
    });

    promptInput?.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (!e.shiftKey || e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        this.runAIAgentPrompt();
      }
    });
  }

  public renderAIAttachments(): void {
    const bar = this.app.getElement('aiImageAttachmentsBar');
    if (!bar) return;

    if (this.aiPendingImages.length === 0) {
      bar.style.display = 'none';
      bar.innerHTML = '';
      return;
    }

    bar.style.display = 'flex';
    bar.innerHTML = '';
    this.aiPendingImages.forEach((dataUrl, idx) => {
      const thumb = document.createElement('div');
      thumb.className = 'ai-attachment-thumb';
      thumb.innerHTML = `
        <img src="${dataUrl}" alt="Reference ${idx + 1}" />
        <button type="button" class="ai-attachment-remove" title="Remove image">&times;</button>
      `;
      thumb.querySelector('.ai-attachment-remove')?.addEventListener('click', () => {
        this.aiPendingImages.splice(idx, 1);
        this.renderAIAttachments();
      });
      bar.appendChild(thumb);
    });
  }

  public getQuickPrompts(): AIQuickPrompt[] {
    return getAllQuickPrompts();
  }

  public initAIQuickPrompts(): void {
    const container = this.app.getElement('aiQuickPrompts');
    if (!container) return;

    const wrapper = this.app.getElement('aiQuickSelectWrapper');
    const selectBtn = this.app.getElement<HTMLButtonElement>('btnAIQuickSelect');
    const menu = this.app.getElement('aiQuickPromptMenu');
    const nativeSelect = this.app.getElement<HTMLSelectElement>('aiQuickPromptSelect');
    const textEl = this.app.getElement('aiQuickSelectText');
    const thumbWrap = this.app.getElement('aiQuickSelectThumb');
    const thumbImg = this.app.getElement<HTMLImageElement>('aiQuickSelectThumbImg');
    const iconEl = this.app.getElement('aiQuickSelectIcon');
    const promptInput = this.app.getElement<HTMLTextAreaElement>('aiPromptInput');

    if (!menu) return;

    // Render quick prompt items from the central JS array
    const prompts = getAllQuickPrompts();
    menu.innerHTML = '';
    if (nativeSelect) {
      nativeSelect.innerHTML = '<option value="">Quick Prompts (Examples)...</option>';
    }

    // Top clear/reset option in menu
    const resetItem = document.createElement('button');
    resetItem.type = 'button';
    resetItem.className = 'ai-quick-menu-item';
    resetItem.style.borderBottom = '1px solid rgba(255, 255, 255, 0.08)';
    resetItem.style.marginBottom = '2px';
    resetItem.innerHTML = `
      <div class="ai-quick-item-thumb" style="width: 28px; height: 28px;">
        <span class="ai-quick-item-thumb-placeholder" style="color: var(--text-secondary); font-size: 14px;">&times;</span>
      </div>
      <div class="ai-quick-item-info">
        <div class="ai-quick-item-title" style="color: var(--text-secondary);">Clear / Reset Selection</div>
      </div>
    `;
    resetItem.addEventListener('click', (e) => {
      e.stopPropagation();
      if (promptInput) promptInput.value = '';
      this.aiPendingImages = [];
      this.renderAIAttachments();
      if (textEl) textEl.textContent = 'Quick Prompts (Examples)...';
      if (thumbWrap) thumbWrap.style.display = 'none';
      if (iconEl) iconEl.style.display = '';
      if (nativeSelect) nativeSelect.value = '';
      menu.querySelectorAll('.ai-quick-menu-item').forEach((i) => i.classList.remove('active'));
      wrapper?.classList.remove('open');
      menu.style.display = 'none';
      selectBtn?.setAttribute('aria-expanded', 'false');
    });
    menu.appendChild(resetItem);

    const applyPrompt = (prompt: AIQuickPrompt, itemEl?: HTMLElement) => {
      if (promptInput) {
        promptInput.value = prompt.prompt;
        promptInput.focus();
      }

      // Handle image attachment with normalized URL
      const primaryImage = normalizePromptImageUrl(prompt.image);
      const rawImages = prompt.images && prompt.images.length > 0 ? prompt.images : (primaryImage ? [primaryImage] : []);
      if (rawImages.length > 0) {
        const toAttach = rawImages.map((u) => normalizePromptImageUrl(u) || u);
        this.aiPendingImages = [...toAttach];
        this.renderAIAttachments();
        this.app.showToast(`Selected: ${prompt.title} (+ image attached)`, 'info');
      } else {
        this.app.showToast(`Selected: ${prompt.title}`, 'info');
      }

      // Update select trigger button UI
      if (textEl) {
        textEl.textContent = `[${prompt.tag}] ${prompt.title}`;
      }
      if (primaryImage && thumbWrap && thumbImg) {
        thumbImg.src = primaryImage;
        thumbWrap.style.display = 'flex';
        if (iconEl) iconEl.style.display = 'none';
      } else {
        if (thumbWrap) thumbWrap.style.display = 'none';
        if (iconEl) iconEl.style.display = '';
      }

      if (nativeSelect) {
        nativeSelect.value = prompt.id;
      }

      // Update active highlight in menu
      menu.querySelectorAll('.ai-quick-menu-item').forEach((i) => i.classList.remove('active'));
      if (itemEl) {
        itemEl.classList.add('active');
      }

      // Close dropdown
      wrapper?.classList.remove('open');
      menu.style.display = 'none';
      selectBtn?.setAttribute('aria-expanded', 'false');
    };

    prompts.forEach((prompt) => {
      // 1. Add to native select for accessibility & syncing
      if (nativeSelect) {
        const opt = document.createElement('option');
        opt.value = prompt.id;
        opt.textContent = `[${prompt.tag}] ${prompt.title}`;
        nativeSelect.appendChild(opt);
      }

      // 2. Add to custom dropdown menu
      const resolvedImg = normalizePromptImageUrl(prompt.image);
      const itemBtn = document.createElement('button');
      itemBtn.type = 'button';
      itemBtn.className = 'ai-quick-menu-item ai-prompt-chip';
      itemBtn.setAttribute('data-id', prompt.id);
      itemBtn.setAttribute('data-technique', prompt.technique);
      itemBtn.setAttribute('data-prompt', prompt.prompt);
      if (resolvedImg) itemBtn.setAttribute('data-image', resolvedImg);
      itemBtn.title = `${prompt.title}: ${prompt.description}`;
      itemBtn.setAttribute('role', 'option');

      const thumbHtml = resolvedImg
        ? `<img src="${resolvedImg}" alt="${prompt.title}" onerror="this.style.display='none'; if (this.nextElementSibling) this.nextElementSibling.style.display='flex';" /><span class="ai-quick-item-thumb-placeholder" style="display: none;">${prompt.tag}</span>`
        : `<span class="ai-quick-item-thumb-placeholder">${prompt.tag}</span>`;

      itemBtn.innerHTML = `
        <div class="ai-quick-item-thumb">
          ${thumbHtml}
        </div>
        <div class="ai-quick-item-info">
          <div class="ai-quick-item-header">
            <span class="ai-quick-item-badge">${prompt.tag}</span>
            <span class="ai-quick-item-title">${prompt.title}</span>
            ${resolvedImg ? '<span class="ai-quick-item-img-tag" title="Includes reference image">IMG</span>' : ''}
          </div>
          <div class="ai-quick-item-desc">${prompt.description}</div>
        </div>
      `;

      itemBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        applyPrompt(prompt, itemBtn);
      });

      menu.appendChild(itemBtn);
    });

    // Toggle dropdown open/close on trigger button click
    selectBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = wrapper?.classList.contains('open') || menu.style.display === 'flex';
      if (isOpen) {
        wrapper?.classList.remove('open');
        menu.style.display = 'none';
        selectBtn.setAttribute('aria-expanded', 'false');
      } else {
        wrapper?.classList.add('open');
        menu.style.display = 'flex';
        selectBtn.setAttribute('aria-expanded', 'true');
      }
    });

    // Close on click outside
    this.app.addGlobalListener(document, 'click', (e) => {
      if (wrapper && !wrapper.contains(e.target as unknown as HTMLElement)) {
        wrapper.classList.remove('open');
        menu.style.display = 'none';
        selectBtn?.setAttribute('aria-expanded', 'false');
      }
    });

    // Native select change sync
    nativeSelect?.addEventListener('change', () => {
      const selected = getQuickPromptById(nativeSelect.value);
      if (selected) {
        const itemEl = menu.querySelector<HTMLElement>(`[data-id="${selected.id}"]`) || undefined;
        applyPrompt(selected, itemEl);
      }
    });
  }

  public escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  public toggleSpeechRecognition(): void {
    if (this.isRecordingSpeech) {
      this.stopSpeechRecognition();
      return;
    }
    this.startSpeechRecognition();
  }

  private startSpeechRecognition(): void {
    const SpeechRecognitionClass =
      typeof window !== 'undefined'
        ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
        : null;

    if (!SpeechRecognitionClass) {
      this.app.showToast('Speech recognition is not supported in this browser.', 'warning');
      return;
    }

    const promptInput = this.app.getElement<HTMLTextAreaElement>('aiPromptInput');
    const btnRecord = this.app.getElement<HTMLButtonElement>('btnAIRecordSpeech');

    try {
      const recognition = new SpeechRecognitionClass();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang =
        typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'en-US';

      this.speechInitialPrompt = promptInput?.value || '';

      recognition.onstart = () => {
        this.isRecordingSpeech = true;
        if (btnRecord) {
          btnRecord.classList.add('btn-recording');
          btnRecord.title = 'Listening... Speak into your microphone (click to stop)';
          const label = btnRecord.querySelector('.btn-label');
          if (label) label.textContent = 'Listening...';
        }
        this.app.showToast('Listening... Speak into your microphone.', 'info');
      };

      recognition.onresult = (event: any) => {
        let interimTranscript = '';
        let finalTranscript = '';

        if (event && event.results) {
          for (let i = 0; i < event.results.length; ++i) {
            const res = event.results[i];
            if (res && res[0]) {
              if (res.isFinal) {
                finalTranscript += res[0].transcript;
              } else {
                interimTranscript += res[0].transcript;
              }
            }
          }
        }

        const spoken = (finalTranscript + ' ' + interimTranscript).trim();
        if (promptInput) {
          const base = this.speechInitialPrompt.trim();
          promptInput.value = base ? `${base} ${spoken}` : spoken;
          promptInput.scrollTop = promptInput.scrollHeight;
        }
      };

      recognition.onerror = (event: any) => {
        const errType = event?.error;
        console.warn('[AI Speech Recognition] Error:', errType);
        if (errType === 'not-allowed') {
          this.app.showToast('Microphone access was denied.', 'error');
        } else if (errType !== 'no-speech' && errType !== 'aborted') {
          this.app.showToast(`Speech recognition error: ${errType || 'unknown'}`, 'warning');
        }
        this.stopSpeechRecognition();
      };

      recognition.onend = () => {
        this.cleanupSpeechRecognitionUI();
      };

      this.speechRecognition = recognition;
      recognition.start();
    } catch (err: any) {
      console.error('[AI Speech Recognition] Failed to start:', err);
      this.app.showToast('Failed to start speech recognition.', 'error');
      this.cleanupSpeechRecognitionUI();
    }
  }

  public stopSpeechRecognition(): void {
    if (this.speechRecognition) {
      try {
        this.speechRecognition.stop();
      } catch {
        // ignore
      }
    }
    this.cleanupSpeechRecognitionUI();
  }

  private cleanupSpeechRecognitionUI(): void {
    this.isRecordingSpeech = false;
    this.speechRecognition = null;
    const btnRecord = this.app.getElement<HTMLButtonElement>('btnAIRecordSpeech');
    if (btnRecord) {
      btnRecord.classList.remove('btn-recording');
      btnRecord.title = 'Voice: Record prompt using Speech-to-Text';
      const label = btnRecord.querySelector('.btn-label');
      if (label) label.textContent = 'Voice';
    }
  }

  public async runAIAgentPrompt(promptOverride?: string): Promise<void> {
    if (this.isAIGenerating) {
      return;
    }
    if (this.isRecordingSpeech) {
      this.stopSpeechRecognition();
    }
    const promptInput = this.app.getElement<HTMLTextAreaElement>('aiPromptInput');
    const endpointInput = this.app.getElement<HTMLInputElement>('aiEndpointUrlInput');
    const apiKeyInput = this.app.getElement<HTMLInputElement>('aiApiKeyInput');
    const modelInput = this.app.getElement<HTMLInputElement>('aiModelInput');
    const chatLog = this.app.getElement<HTMLElement>('aiChatLog');
    const btnGenerate = this.app.getElement<HTMLButtonElement>('btnAIGenerate');
    const btnStop = this.app.getElement<HTMLButtonElement>('btnAIStop');
    const actionModeSelect = this.app.getElement<HTMLSelectElement>('aiActionModeSelect');
    const includeViewportCheck = this.app.getElement<HTMLInputElement>('aiIncludeViewportCheck');
    const visualCritiqueCheckQuick = this.app.getElement<HTMLInputElement>('aiVisualCritiqueCheckQuick');
    const checkZFightingCheckQuick = this.app.getElement<HTMLInputElement>('aiCheckZFightingCheckQuick');

    const promptText = (promptOverride !== undefined ? promptOverride : promptInput?.value || '').trim();
    const images = [...this.aiPendingImages];

    if (!promptText && images.length === 0) {
      this.app.showToast('Please enter a prompt or attach a reference image.', 'warning');
      return;
    }

    // Sync any edits in the settings inputs before calling the endpoint
    const protocolSelect = this.app.getElement<HTMLSelectElement>('aiProtocolSelect');
    if (endpointInput?.value.trim() || modelInput?.value.trim() || apiKeyInput?.value !== undefined) {
      const updatedCfg = this.app.service.aiAgent.saveConfig({
        protocol: (protocolSelect?.value || this.app.service.aiAgent.getConfig().protocol) as AIAgentProtocol,
        baseUrl: endpointInput?.value.trim() || this.app.service.aiAgent.getConfig().baseUrl,
        apiKey: apiKeyInput ? apiKeyInput.value.trim() : this.app.service.aiAgent.getConfig().apiKey,
        model: modelInput?.value.trim() || this.app.service.aiAgent.getConfig().model,
      });
      if (endpointInput) endpointInput.value = updatedCfg.baseUrl;
      if (modelInput) modelInput.value = updatedCfg.model;
      this.refreshAIEndpointBadge();
    }

    if (promptInput && promptOverride === undefined) {
      promptInput.value = '';
    }
    this.aiPendingImages = [];
    this.renderAIAttachments();

    // Remove empty state or welcome banner if present
    chatLog?.querySelector('.ai-chat-empty, .ai-chat-welcome')?.remove();

    // Append user bubble
    if (chatLog) {
      const userEl = document.createElement('div');
      userEl.className = 'ai-msg ai-msg-user';
      const userHeader = document.createElement('div');
      userHeader.className = 'ai-msg-header';
      userHeader.innerHTML = `
        <span class="ai-msg-role"><i class="app-icon" data-lucide="user"></i> You</span>
        <div class="ai-msg-header-right">
          <span class="ai-msg-time">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          <button type="button" class="ai-msg-copy-btn" title="Copy prompt" aria-label="Copy prompt">
            <i class="app-icon" data-lucide="copy"></i>
          </button>
        </div>
      `;
      const copyUserBtn = userHeader.querySelector<HTMLButtonElement>('.ai-msg-copy-btn');
      copyUserBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.copyToClipboard(promptText, copyUserBtn);
      });
      userEl.appendChild(userHeader);

      if (images.length > 0) {
        const imgsDiv = document.createElement('div');
        imgsDiv.className = 'ai-msg-images';
        imgsDiv.innerHTML = images.map((u) => `<img src="${u}" alt="Ref" />`).join('');
        userEl.appendChild(imgsDiv);
      }

      const userTextDiv = document.createElement('div');
      userTextDiv.className = 'ai-msg-text';
      userTextDiv.innerHTML = marked.parse(promptText || '(Image-to-Mesh Reference)', {
        async: false,
        breaks: true,
        gfm: true,
      }) as string;
      userEl.appendChild(userTextDiv);
      chatLog.appendChild(userEl);
      chatLog.scrollTop = chatLog.scrollHeight;
    }

    // Create assistant progress bubble
    const assistantEl = document.createElement('div');
    assistantEl.className = 'ai-msg ai-msg-assistant';

    const assistantHeader = document.createElement('div');
    assistantHeader.className = 'ai-msg-header';
    assistantHeader.innerHTML = `
      <span class="ai-msg-role"><i class="app-icon" data-lucide="bot"></i> AI Mesh Agent</span>
      <div class="ai-msg-header-right">
        <span class="ai-msg-timer" id="aiMsgTimer">Thinking (0s)...</span>
        <button type="button" class="ai-msg-copy-btn" title="Copy response" aria-label="Copy response">
          <i class="app-icon" data-lucide="copy"></i>
        </button>
      </div>
    `;
    const copyAssistantBtn = assistantHeader.querySelector<HTMLButtonElement>('.ai-msg-copy-btn');
    assistantEl.appendChild(assistantHeader);

    // Active Skills Bar - instant feedback of loaded capabilities
    const activeSkills = this.app.service.aiAgent.getSkills().filter((s) => s.enabled);
    if (activeSkills.length > 0) {
      const skillsBar = document.createElement('div');
      skillsBar.className = 'ai-active-skills-bar';
      skillsBar.innerHTML = `
        <span class="ai-skills-pill-label"><i class="app-icon" data-lucide="sparkles"></i> Active Skills:</span>
        <div class="ai-skills-pills" style="display: inline-flex; flex-wrap: wrap; gap: 3px;">
          ${activeSkills.map((s) => `<span class="ai-skill-pill">${this.escapeHtml(s.name)}</span>`).join('')}
        </div>
      `;
      assistantEl.appendChild(skillsBar);
    }

    // Live Thinking & Reasoning Box
    const thinkingBox = document.createElement('div');
    thinkingBox.className = 'ai-thinking-box';
    thinkingBox.innerHTML = `
      <span class="ai-thinking-spinner"></span>
      <span class="ai-thinking-text">Connecting to endpoint & planning 3D operations...</span>
    `;
    assistantEl.appendChild(thinkingBox);

    const stepsContainer = document.createElement('div');
    stepsContainer.className = 'ai-msg-steps';
    const textContainer = document.createElement('div');
    textContainer.className = 'ai-msg-text';
    textContainer.style.display = 'none';

    assistantEl.appendChild(stepsContainer);
    assistantEl.appendChild(textContainer);
    chatLog?.appendChild(assistantEl);
    if (chatLog) chatLog.scrollTop = chatLog.scrollHeight;

    // Refresh icons inside new bubbles
    if (typeof (window as any).lucide?.createIcons === 'function') {
      (window as any).lucide.createIcons();
    }

    copyAssistantBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      const rawText = assistantEl.getAttribute('data-raw-response') || textContainer.textContent || '';
      this.copyToClipboard(rawText, copyAssistantBtn);
    });

    const startTime = Date.now();
    const timerEl = assistantHeader.querySelector<HTMLElement>('#aiMsgTimer');
    const thinkingTextEl = thinkingBox.querySelector<HTMLElement>('.ai-thinking-text');
    const timerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      if (timerEl) timerEl.textContent = `Thinking (${elapsed}s)...`;
      if (elapsed >= 12 && thinkingTextEl && thinkingTextEl.textContent?.includes('Connecting')) {
        thinkingTextEl.textContent = `Model reasoning & building 3D mesh operations (${elapsed}s)...`;
      }
    }, 1000);

    const stepElements = new Map<string, HTMLElement>();

    if (btnGenerate) btnGenerate.disabled = true;
    if (btnStop) btnStop.style.display = 'inline-flex';
    this.aiAbortController = new AbortController();
    this.setAIGeneratingState(true);

    try {
      const modeVal =
        actionModeSelect?.value === 'replace_scene' ? 'replace_scene' : 'create_or_update';
      const result = await this.app.service.aiAgent.runPrompt({
        prompt: promptText || 'Build a 3D mesh matching the attached reference image.',
        images,
        mode: modeVal,
        includeViewportSnapshot: !!includeViewportCheck?.checked,
        visualCritique: visualCritiqueCheckQuick
          ? !!visualCritiqueCheckQuick.checked
          : this.app.service.aiAgent.getConfig().visualCritique,
        checkZFighting: checkZFightingCheckQuick
          ? !!checkZFightingCheckQuick.checked
          : this.app.service.aiAgent.getConfig().checkZFighting,
        signal: this.aiAbortController.signal,
        onStep: (step: AIAgentToolExecutionStep) => {
          const stepLabel = `Executing tool: ${step.toolName.replace(/^modeler_/, '')}...`;
          if (thinkingTextEl) {
            thinkingTextEl.textContent = stepLabel;
          }
          if (this.isAIGenerating) {
            this.app.showSceneLoader(stepLabel, 'AI MESH AGENT • LIVE SCENE GENERATION', {
              topHud: true,
              showStop: true,
            });
          }
          const isErr = !!step.isError;
          const statusClass = isErr ? 'error' : 'success';
          let stepEl = stepElements.get(step.id);
          if (!stepEl) {
            stepEl = document.createElement('div');
            stepEl.className = `ai-tool-step is-${statusClass}`;
            stepElements.set(step.id, stepEl);
            stepsContainer.appendChild(stepEl);
          } else {
            stepEl.className = `ai-tool-step is-${statusClass}`;
          }

          const iconSymbol = isErr ? '⚠' : '✓';
          const argSummary =
            step.args?.name ||
            step.args?.meshName ||
            step.args?.targetMeshName ||
            step.args?.materialName ||
            step.args?.shape ||
            '';
          stepEl.innerHTML = `
            <span class="ai-step-icon">${iconSymbol}</span>
            <span class="ai-step-name">${this.escapeHtml(step.toolName.replace(/^modeler_/, ''))}</span>
            <span class="ai-step-summary">${this.escapeHtml(String(argSummary))}</span>
            <span class="ai-step-duration">${step.durationMs ? `${step.durationMs}ms` : ''}</span>
          `;
          if (chatLog) chatLog.scrollTop = chatLog.scrollHeight;
        },
        onStatus: (statusText: string) => {
          if (thinkingTextEl) {
            thinkingTextEl.textContent = statusText;
          }
          if (this.isAIGenerating) {
            this.app.showSceneLoader(statusText, 'AI MESH AGENT • LIVE SCENE GENERATION', {
              topHud: true,
              showStop: true,
            });
          }
          if (chatLog) chatLog.scrollTop = chatLog.scrollHeight;
        },
      });

      clearInterval(timerInterval);
      const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      if (timerEl) timerEl.textContent = `Done in ${totalElapsed}s`;
      thinkingBox.remove();

      const responseMarkdown = result.content || 'Completed 3D mesh operations.';
      assistantEl.setAttribute('data-raw-response', responseMarkdown);
      textContainer.style.display = 'block';
      textContainer.innerHTML = marked.parse(responseMarkdown, {
        async: false,
        breaks: true,
        gfm: true,
      }) as string;

      if (modelInput) {
        modelInput.value = this.app.service.aiAgent.getConfig().model;
      }
      this.app.updateOutliner();
      this.app.updateMeshGUI();
      this.app.updateMaterialGUI();
      this.app.updateCSGGUI();
    } catch (err: any) {
      clearInterval(timerInterval);
      const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      if (timerEl) timerEl.textContent = `Failed after ${totalElapsed}s`;
      thinkingBox.remove();

      assistantEl.classList.add('ai-msg-error');
      textContainer.style.display = 'block';
      const errMsg = err?.message || String(err);
      textContainer.textContent = `Error: ${errMsg}`;
      this.app.showToast(errMsg, 'error');

      // Automatically open endpoint settings if API key or connection failed
      // and surface the error inline inside the modal so it isn't hidden behind the backdrop.
      if (
        errMsg.includes('401') ||
        errMsg.includes('API key') ||
        errMsg.includes('Endpoint') ||
        /failed to fetch|networkerror|econnrefused|load failed/i.test(errMsg)
      ) {
        this.app.openSettingsModal('ai', {
          endpointFeedback: {
            message: errMsg,
            type: 'error',
          },
        });
      }
    } finally {
      this.aiAbortController = null;
      this.setAIGeneratingState(false);
      if (btnGenerate) btnGenerate.disabled = false;
      if (btnStop) btnStop.style.display = 'none';
      if (chatLog) chatLog.scrollTop = chatLog.scrollHeight;
    }
  }

  public stopAIGeneration(): void {
    if (this.aiAbortController) {
      this.aiAbortController.abort();
      this.aiAbortController = null;
    }
  }

  public setAIGeneratingState(active: boolean): void {
    this.isAIGenerating = active;
    this.app.rootContainer?.classList.toggle('is-ai-scene-locked', active);

    if (active) {
      if (this.app.service.isPlaceModeActive) {
        this.app.service.cancelPlacementMode();
      }
      this.app.deactivateOtherExclusiveTools(null);
      this.app.service.setSceneInteractionLocked(true);
      this.app.updatePanelButtonStates();
      this.app.showSceneLoader('AI Agent working...', 'AI MESH AGENT • LIVE SCENE GENERATION', {
        topHud: true,
        showStop: true,
      });
      this.app.refreshIcons();
    } else {
      this.app.service.setSceneInteractionLocked(false);
      this.app.hideSceneLoader(true);
      this.app.sceneLoaderElement?.classList.remove('is-top-hud');
      if (this.app.statusIndicator) this.app.statusIndicator.classList.remove('busy');
      this.app.updateOutliner();
      this.app.updatePanelButtonStates();
    }
  }
}
