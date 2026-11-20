import type { MeshEditorAppHost } from '../services/MeshEditorAppHost';

export class AITextureUIService {
  private activeAITextureId: string | null = null;
  private activeAITexturePreviewMode: 'albedo' | 'normal' | 'tiled' = 'albedo';

  constructor(private readonly app: MeshEditorAppHost) {}

  public initAITextureUI(): void {
    const dialog = this.app.getElement('dialog-ai-texture');
    if (!dialog || (dialog as any)._aiTextureInitialized) return;
    (dialog as any)._aiTextureInitialized = true;

    const promptInput = this.app.getElement<HTMLTextAreaElement>('aiTexturePrompt');
    const presetSelect = this.app.getElement<HTMLSelectElement>('aiTexturePresetSelect');
    const backendSelect = this.app.getElement<HTMLSelectElement>('aiTextureBackendSelect');
    const btnToggleConfig = this.app.getElement<HTMLButtonElement>('btnToggleAITextureSettings');
    const configDrawer = this.app.getElement<HTMLElement>('aiTextureExternalConfigDrawer');
    const endpointUrlInput = this.app.getElement<HTMLInputElement>('aiTextureEndpointUrl');
    const apiKeyInput = this.app.getElement<HTMLInputElement>('aiTextureApiKey');
    const btnToggleApiKeyVis = this.app.getElement<HTMLButtonElement>('btnToggleTextureApiKeyVis');
    const modelIdInput = this.app.getElement<HTMLInputElement>('aiTextureModelId');
    const promptEnhanceCheck = this.app.getElement<HTMLInputElement>('aiTexturePromptEnhanceCheck');
    const btnTestConnection = this.app.getElement<HTMLButtonElement>('btnTestAITextureConnection');
    const styleSelect = this.app.getElement<HTMLSelectElement>('aiTextureStyleSelect');
    const sizeSelect = this.app.getElement<HTMLSelectElement>('aiTextureSizeSelect');
    const seamlessCheck = this.app.getElement<HTMLInputElement>('aiTextureSeamlessCheck');
    const normalCheck = this.app.getElement<HTMLInputElement>('aiTextureNormalCheck');
    const customColorsCheck = this.app.getElement<HTMLInputElement>('aiTextureCustomColorsCheck');
    const colorPickersRow = this.app.getElement<HTMLElement>('aiTextureColorPickersRow');
    const primaryColorInput = this.app.getElement<HTMLInputElement>('aiTexturePrimaryColor');
    const secondaryColorInput = this.app.getElement<HTMLInputElement>('aiTextureSecondaryColor');
    const accentColorInput = this.app.getElement<HTMLInputElement>('aiTextureAccentColor');
    const normalStrengthInput = this.app.getElement<HTMLInputElement>('aiTextureNormalStrength');
    const normalStrengthVal = this.app.getElement<HTMLElement>('aiTextureNormalStrengthVal');
    const uvScaleInput = this.app.getElement<HTMLInputElement>('aiTextureUVScaleInput');
    const btnGenerate = this.app.getElement<HTMLButtonElement>('btnGenerateAITexture');

    const imgGenService = this.app.service.externalImageGenerator;

    const syncTextureBackendUI = () => {
      const active = imgGenService.getActiveBackend();
      if (backendSelect) backendSelect.value = active;
      const isExternal = active !== 'procedural';

      if (btnToggleConfig) btnToggleConfig.style.display = isExternal ? 'inline-flex' : 'none';
      if (!isExternal && configDrawer) configDrawer.style.display = 'none';

      const provider = imgGenService.getProvider(isExternal ? (active as any) : 'pollinations');
      if (endpointUrlInput) endpointUrlInput.value = provider.endpointUrl || '';
      if (apiKeyInput) apiKeyInput.value = provider.apiKey || '';
      if (modelIdInput) modelIdInput.value = provider.modelId || '';
      if (promptEnhanceCheck) promptEnhanceCheck.checked = imgGenService.isPromptEnhanceEnabled();

      if (btnGenerate) {
        btnGenerate.innerHTML = `<i class="app-icon" data-lucide="wand-2"></i> Generate Texture`;
      }
    };

    backendSelect?.addEventListener('change', () => {
      const selected = (backendSelect.value || 'procedural') as any;
      imgGenService.setActiveBackend(selected);
      if (selected === 'procedural') {
        this.app.service.aiAgent.saveConfig({ imageGeneratorEnabled: false });
      } else {
        this.app.service.aiAgent.saveConfig({
          imageGeneratorEnabled: true,
          imageGeneratorActiveBackend: selected,
        });
      }
      syncTextureBackendUI();
      this.app.syncAIAgentImageGenUI?.();
    });

    btnToggleConfig?.addEventListener('click', () => {
      if (!configDrawer) return;
      const isVisible = configDrawer.style.display === 'flex' || configDrawer.style.display === 'block';
      configDrawer.style.display = isVisible ? 'none' : 'flex';
    });

    btnToggleApiKeyVis?.addEventListener('click', () => {
      this.app.toggleApiKeyVisibility(apiKeyInput, btnToggleApiKeyVis);
    });

    const saveBackendConfigFromDOM = () => {
      const active = backendSelect?.value;
      if (!active || active === 'procedural') return;
      imgGenService.updateProvider(active as any, {
        endpointUrl: endpointUrlInput?.value.trim(),
        apiKey: apiKeyInput?.value.trim(),
        modelId: modelIdInput?.value.trim(),
      });
      if (promptEnhanceCheck) {
        imgGenService.setPromptEnhance(promptEnhanceCheck.checked);
      }
      this.app.service.aiAgent.saveConfig({
        imageGeneratorProviders: imgGenService.getProviders(),
      });
      this.app.syncAIAgentImageGenUI?.();
    };

    endpointUrlInput?.addEventListener('change', saveBackendConfigFromDOM);
    apiKeyInput?.addEventListener('change', saveBackendConfigFromDOM);
    modelIdInput?.addEventListener('change', saveBackendConfigFromDOM);
    promptEnhanceCheck?.addEventListener('change', () => {
      if (promptEnhanceCheck) imgGenService.setPromptEnhance(promptEnhanceCheck.checked);
    });

    btnTestConnection?.addEventListener('click', async () => {
      saveBackendConfigFromDOM();
      const active = (backendSelect?.value || 'pollinations') as any;
      if (active === 'procedural') {
        this.app.showToast('Procedural Synthesizer is built-in and always available.', 'info');
        return;
      }
      const res = await imgGenService.testProvider(active);
      this.app.showToast(res.message, res.ok ? 'success' : 'warning');
    });

    syncTextureBackendUI();

    presetSelect?.addEventListener('change', () => {
      if (!presetSelect.value) return;
      const [presetPrompt, presetStyle] = presetSelect.value.split('|');
      if (promptInput && presetPrompt) promptInput.value = presetPrompt;
      if (styleSelect && presetStyle) styleSelect.value = presetStyle;
      presetSelect.value = '';
    });

    customColorsCheck?.addEventListener('change', () => {
      if (colorPickersRow) {
        colorPickersRow.style.display = customColorsCheck.checked ? 'flex' : 'none';
      }
    });

    normalStrengthInput?.addEventListener('input', () => {
      if (normalStrengthVal) normalStrengthVal.textContent = Number(normalStrengthInput.value).toFixed(1);
    });

    const setPreviewMode = (mode: 'albedo' | 'normal' | 'tiled') => {
      this.activeAITexturePreviewMode = mode;
      this.updateAITextureUI();
    };

    this.app.getElement('btnPreviewAlbedo')?.addEventListener('click', () => setPreviewMode('albedo'));
    this.app.getElement('btnPreviewNormal')?.addEventListener('click', () => setPreviewMode('normal'));
    this.app.getElement('btnPreviewTiled')?.addEventListener('click', () => setPreviewMode('tiled'));

    btnGenerate?.addEventListener('click', async () => {
      const prompt = promptInput?.value.trim() || 'Seamless stone texture';
      const style = (styleSelect?.value || 'auto') as any;
      const size = parseInt(sizeSelect?.value || '512', 10) || 512;
      const seamless = seamlessCheck ? seamlessCheck.checked : true;
      const generateNormalMap = normalCheck ? normalCheck.checked : true;
      const normalStrength = parseFloat(normalStrengthInput?.value || '2.2') || 2.2;
      const useCustomColors = Boolean(customColorsCheck?.checked);
      const backend = (backendSelect?.value || 'procedural') as any;
      const enhancePrompt = promptEnhanceCheck ? promptEnhanceCheck.checked : true;

      const originalHtml = btnGenerate.innerHTML;
      btnGenerate.disabled = true;
      btnGenerate.innerHTML = '<i class="app-icon spin" data-lucide="loader-2"></i> Generating...';

      try {
        const item = await this.app.service.aiTextureGenerator.generateTexture({
          prompt,
          style,
          size,
          seamless,
          generateNormalMap,
          normalStrength,
          primaryColor: useCustomColors ? primaryColorInput?.value : undefined,
          secondaryColor: useCustomColors ? secondaryColorInput?.value : undefined,
          accentColor: useCustomColors ? accentColorInput?.value : undefined,
          backend,
          enhancePrompt,
          fallbackToProcedural: false,
          embedInScene: true,
        });

        this.activeAITextureId = item.id;
        const backendLabel = item.isAI ? ` via ${item.generatorBackend || 'AI'}` : '';
        this.app.showToast(`Generated "${item.name}" (${item.size}x${item.size}${backendLabel})`, 'success');
        this.updateAITextureUI();
        this.app.updateDecalUI();
        this.app.updateTexturePaintUI();
        this.app.updateHeightmapUI();
      } catch (err: any) {
        this.app.showToast(err?.message || 'Failed to generate texture.', 'error');
      } finally {
        btnGenerate.disabled = false;
        btnGenerate.innerHTML = originalHtml;
      }
    });

    const btnUploadTex = this.app.getElement<HTMLButtonElement>('btnUploadAITextureImage');
    const fileInputTex = this.app.getElement<HTMLInputElement>('aiTextureImageFileInput');
    btnUploadTex?.addEventListener('click', () => fileInputTex?.click());
    fileInputTex?.addEventListener('change', async () => {
      const file = fileInputTex.files?.[0];
      if (!file) return;
      try {
        const reader = new FileReader();
        reader.onload = async () => {
          const dataUrl = reader.result as string;
          const normalStrength = parseFloat(normalStrengthInput?.value || '2.2') || 2.2;
          const item = await this.app.service.aiTextureGenerator.addExternalTexture(
            file.name.replace(/\.[^/.]+$/, ''),
            dataUrl,
            promptInput?.value.trim() || file.name,
            normalStrength,
          );
          this.activeAITextureId = item.id;
          this.app.showToast(`Imported texture "${item.name}" with normal map!`, 'success');
          this.updateAITextureUI();
          this.app.updateDecalUI();
          this.app.updateHeightmapUI();
        };
        reader.readAsDataURL(file);
      } catch (err: any) {
        this.app.showToast(err?.message || 'Failed to import texture image.', 'error');
      }
      fileInputTex.value = '';
    });

    this.app.getElement('btnApplyAITextureToMesh')?.addEventListener('click', () => {
      const item = this.activeAITextureId
        ? this.app.service.aiTextureGenerator.getTextureById(this.activeAITextureId)
        : this.app.service.aiTextureGenerator.getLatestTexture();
      if (!item) {
        this.app.showToast('Generate a texture first.', 'warning');
        return;
      }
      const uvScale = parseFloat(uvScaleInput?.value || '1') || 1;
      try {
        const res = this.app.service.aiTextureGenerator.applyTextureToMesh(item.id, 'selected', uvScale);
        this.app.showToast(`Applied "${item.name}" to ${res.appliedTo.join(', ')}`, 'success');
      } catch (err: any) {
        this.app.showToast(err?.message || 'Select a mesh first to apply texture.', 'warning');
      }
    });

    this.app.getElement('btnUseAITextureAsDecal')?.addEventListener('click', () => {
      const item = this.activeAITextureId
        ? this.app.service.aiTextureGenerator.getTextureById(this.activeAITextureId)
        : this.app.service.aiTextureGenerator.getLatestTexture();
      if (!item) {
        this.app.showToast('Generate a texture first.', 'warning');
        return;
      }
      this.app.service.decalController.setTexture(item.albedoDataUrl, item.name);
      this.app.toggleDialog('dialog-decal', true);
      this.app.activateExclusive3DTool('decal_painter');
      this.app.updateDecalUI();
      this.app.showToast(`Loaded "${item.name}" into Decal Painter! Click on a mesh to paint.`, 'info');
    });

    this.app.getElement('btnDownloadAITextureAlbedo')?.addEventListener('click', () => {
      const item = this.activeAITextureId
        ? this.app.service.aiTextureGenerator.getTextureById(this.activeAITextureId)
        : this.app.service.aiTextureGenerator.getLatestTexture();
      if (item) {
        this.app.service.aiTextureGenerator.downloadTexture(item.id, 'albedo');
      }
    });

    this.app.getElement('btnDownloadAITextureNormal')?.addEventListener('click', () => {
      const item = this.activeAITextureId
        ? this.app.service.aiTextureGenerator.getTextureById(this.activeAITextureId)
        : this.app.service.aiTextureGenerator.getLatestTexture();
      if (item && item.normalDataUrl) {
        this.app.service.aiTextureGenerator.downloadTexture(item.id, 'normal');
      } else {
        this.app.showToast('No normal map available for this texture.', 'warning');
      }
    });

    this.app.service.aiTextureGenerator.onHistoryChanged = () => {
      this.updateAITextureUI();
      this.app.updateDecalUI();
      this.app.updateHeightmapUI();
    };

    this.updateAITextureUI();
  }

  public updateAITextureUI(): void {
    const dialog = this.app.getElement('dialog-ai-texture');
    if (!dialog) return;

    const history = this.app.service.aiTextureGenerator.getHistory();
    const countBadge = this.app.getElement('aiTextureCountBadge');
    if (countBadge) {
      countBadge.textContent = `${history.length} texture${history.length === 1 ? '' : 's'}`;
    }

    if (!this.activeAITextureId && history.length > 0) {
      this.activeAITextureId = history[0].id;
    }

    const activeItem = this.activeAITextureId
      ? this.app.service.aiTextureGenerator.getTextureById(this.activeAITextureId) || history[0]
      : history[0];

    const previewContainer = this.app.getElement<HTMLElement>('aiTexturePreviewContainer');
    const previewBox = this.app.getElement<HTMLElement>('aiTexturePreviewBox');
    const metaLabel = this.app.getElement<HTMLElement>('aiTextureMetaLabel');

    if (previewContainer && previewBox) {
      if (activeItem) {
        previewContainer.style.display = 'block';
        if (metaLabel) {
          const aiTag = activeItem.isAI ? ` • ${activeItem.generatorBackend || 'AI'}` : '';
          metaLabel.textContent = `${activeItem.name} (${activeItem.size}px • ${activeItem.style}${aiTag})`;
        }
        const url =
          this.activeAITexturePreviewMode === 'normal' && activeItem.normalDataUrl
            ? activeItem.normalDataUrl
            : activeItem.albedoDataUrl;
        previewBox.style.backgroundImage = `url("${url}")`;
        if (this.activeAITexturePreviewMode === 'tiled') {
          previewBox.style.backgroundSize = '50% 50%';
          previewBox.style.backgroundRepeat = 'repeat';
        } else {
          previewBox.style.backgroundSize = 'contain';
          previewBox.style.backgroundRepeat = 'no-repeat';
        }
      } else {
        previewContainer.style.display = 'none';
      }
    }

    const modes: Array<{ id: string; mode: 'albedo' | 'normal' | 'tiled' }> = [
      { id: 'btnPreviewAlbedo', mode: 'albedo' },
      { id: 'btnPreviewNormal', mode: 'normal' },
      { id: 'btnPreviewTiled', mode: 'tiled' },
    ];
    for (const m of modes) {
      const btn = this.app.getElement<HTMLButtonElement>(m.id);
      if (btn) {
        const isCurrent = this.activeAITexturePreviewMode === m.mode;
        btn.classList.toggle('active', isCurrent);
      }
    }

    const historyList = this.app.getElement<HTMLElement>('aiTextureHistoryList');
    if (historyList) {
      const currentThumbs = historyList.querySelectorAll<HTMLButtonElement>('button');
      if (currentThumbs.length === history.length && currentThumbs.length > 0) {
        let matches = true;
        for (let i = 0; i < history.length; i++) {
          if (currentThumbs[i].getAttribute('data-id') !== history[i].id) {
            matches = false;
            break;
          }
        }
        if (matches) {
          for (let i = 0; i < history.length; i++) {
            const isSelected = activeItem && activeItem.id === history[i].id;
            currentThumbs[i].style.borderColor = isSelected ? '#3b82f6' : 'rgba(255,255,255,0.12)';
          }
          return;
        }
      }

      historyList.innerHTML = '';
      for (const item of history) {
        const thumb = document.createElement('button');
        thumb.type = 'button';
        thumb.title = `${item.name}: ${item.prompt}`;
        thumb.setAttribute('data-id', item.id);
        const isSelected = activeItem && activeItem.id === item.id;
        thumb.style.cssText = `
          height: 52px;
          border-radius: 5px;
          border: 2px solid ${isSelected ? '#3b82f6' : 'rgba(255,255,255,0.12)'};
          background-color: #161b22;
          background-image: url("${item.albedoDataUrl}");
          background-size: cover;
          background-position: center;
          cursor: pointer;
          padding: 0;
        `;
        thumb.addEventListener('click', () => {
          this.activeAITextureId = item.id;
          this.updateAITextureUI();
        });
        historyList.appendChild(thumb);
      }
    }
  }
}
