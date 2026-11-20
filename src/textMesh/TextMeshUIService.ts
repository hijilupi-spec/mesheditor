import type { MeshEditorAppHost } from '../services/MeshEditorAppHost';

export class TextMeshUIService {
  constructor(private readonly app: MeshEditorAppHost) {}

  public initTextMeshUI(): void {
    const dialog = this.app.getElement('dialog-text-mesh');
    if (!dialog || (dialog as any)._textMeshInitialized) return;
    (dialog as any)._textMeshInitialized = true;

    const textInput = this.app.getElement<HTMLInputElement>('textMeshInput');
    const fontSelect = this.app.getElement<HTMLSelectElement>('textMeshFontSelect');
    const sizeRange = this.app.getElement<HTMLInputElement>('textMeshSizeRange');
    const sizeNum = this.app.getElement<HTMLInputElement>('textMeshSizeNum');
    const depthRange = this.app.getElement<HTMLInputElement>('textMeshDepthRange');
    const depthNum = this.app.getElement<HTMLInputElement>('textMeshDepthNum');
    const resRange = this.app.getElement<HTMLInputElement>('textMeshResolutionRange');
    const resNum = this.app.getElement<HTMLInputElement>('textMeshResolutionNum');
    const colorPicker = this.app.getElement<HTMLInputElement>('textMeshColorPicker');
    const colorHex = this.app.getElement<HTMLElement>('textMeshColorHex');
    const roughnessRange = this.app.getElement<HTMLInputElement>('textMeshRoughnessRange');
    const roughnessVal = this.app.getElement<HTMLElement>('textMeshRoughnessVal');
    const metallicRange = this.app.getElement<HTMLInputElement>('textMeshMetallicRange');
    const metallicVal = this.app.getElement<HTMLElement>('textMeshMetallicVal');
    const emissivePicker = this.app.getElement<HTMLInputElement>('textMeshEmissivePicker');
    const emissiveIntensityRange = this.app.getElement<HTMLInputElement>('textMeshEmissiveIntensityRange');
    const surfacePlaceCheck = this.app.getElement<HTMLInputElement>('textMeshSurfacePlaceCheck');

    const syncPair = (range: HTMLInputElement | null, num: HTMLInputElement | null) => {
      range?.addEventListener('input', () => {
        if (num) num.value = range.value;
      });
      num?.addEventListener('change', () => {
        if (range) range.value = num.value;
      });
    };
    syncPair(sizeRange, sizeNum);
    syncPair(depthRange, depthNum);
    syncPair(resRange, resNum);

    colorPicker?.addEventListener('input', () => {
      if (colorHex) colorHex.textContent = colorPicker.value;
    });
    roughnessRange?.addEventListener('input', () => {
      if (roughnessVal) roughnessVal.textContent = Number(roughnessRange.value).toFixed(2);
    });
    metallicRange?.addEventListener('input', () => {
      if (metallicVal) metallicVal.textContent = Number(metallicRange.value).toFixed(2);
    });
    surfacePlaceCheck?.addEventListener('change', () => {
      if (surfacePlaceCheck.checked) {
        this.app.deactivateOtherExclusiveTools(null);
      }
      this.app.service.textMeshController.setSurfacePlacementActive(Boolean(surfacePlaceCheck.checked));
      this.app.updatePanelButtonStates();
    });
    this.app.service.textMeshController.onSurfacePlacementChanged = (active: boolean) => {
      if (surfacePlaceCheck) {
        surfacePlaceCheck.checked = active;
      }
    };

    const readFormConfig = () => ({
      text: textInput?.value.trim() || 'Hello 3D',
      fontUrl: fontSelect?.value || 'assets/fonts/Kenney_Future_Regular.json',
      size: parseFloat(sizeNum?.value || sizeRange?.value || '1.0') || 1.0,
      depth: parseFloat(depthNum?.value || depthRange?.value || '0.25') || 0.25,
      resolution: parseInt(resNum?.value || resRange?.value || '8', 10) || 8,
      color: colorPicker?.value || '#3b82f6',
      roughness: parseFloat(roughnessRange?.value || '0.35') ?? 0.35,
      metallic: parseFloat(metallicRange?.value || '0.2') ?? 0.2,
      emissiveColor: emissivePicker?.value || '#000000',
      emissiveIntensity: parseFloat(emissiveIntensityRange?.value || '0') || 0,
    });

    this.app.getElement('btnCreateTextMesh')?.addEventListener('click', async () => {
      const cfg = readFormConfig();
      const mesh = await this.app.service.textMeshController.createTextMesh(cfg);
      this.app.showToast(`Created 3D Text "${cfg.text}" (${mesh.name})`, 'success');
      this.updateTextMeshUI();
    });

    this.app.getElement('btnUpdateTextMesh')?.addEventListener('click', async () => {
      const sel = this.app.service.selectedMesh;
      if (!sel || !this.app.service.textMeshController.isTextMesh(sel)) {
        this.app.showToast('Select a 3D Text mesh first to update it.', 'warning');
        return;
      }
      const cfg = readFormConfig();
      const updated = await this.app.service.textMeshController.updateTextMesh(sel, cfg);
      this.app.showToast(`Updated 3D Text "${updated.name}"`, 'success');
      this.updateTextMeshUI();
    });

    this.app.getElement('btnDuplicateTextMesh')?.addEventListener('click', async () => {
      const sel = this.app.service.selectedMesh;
      if (!sel || !this.app.service.textMeshController.isTextMesh(sel)) {
        this.app.showToast('Select a 3D Text mesh first to duplicate it.', 'warning');
        return;
      }
      const dup = await this.app.service.textMeshController.duplicateTextMesh(sel);
      this.app.showToast(`Duplicated 3D Text as "${dup.name}"`, 'success');
      this.updateTextMeshUI();
    });

    this.updateTextMeshUI();
  }

  public updateTextMeshUI(): void {
    const dialog = this.app.getElement('dialog-text-mesh');
    if (!dialog) return;

    const sel = this.app.service.selectedMesh;
    const isText = Boolean(sel && this.app.service.textMeshController.isTextMesh(sel));
    const badge = this.app.getElement<HTMLElement>('textMeshSelectedBadge');
    const btnUpdate = this.app.getElement<HTMLButtonElement>('btnUpdateTextMesh');
    const btnDuplicate = this.app.getElement<HTMLButtonElement>('btnDuplicateTextMesh');

    if (btnUpdate) btnUpdate.disabled = !isText;
    if (btnDuplicate) btnDuplicate.disabled = !isText;

    if (isText && sel) {
      const cfg = this.app.service.textMeshController.getTextConfig(sel);
      if (badge) {
        badge.innerHTML = `Editing 3D Text: <strong>${sel.name}</strong>`;
      }
      if (cfg) {
        const textInput = this.app.getElement<HTMLInputElement>('textMeshInput');
        const fontSelect = this.app.getElement<HTMLSelectElement>('textMeshFontSelect');
        const sizeRange = this.app.getElement<HTMLInputElement>('textMeshSizeRange');
        const sizeNum = this.app.getElement<HTMLInputElement>('textMeshSizeNum');
        const depthRange = this.app.getElement<HTMLInputElement>('textMeshDepthRange');
        const depthNum = this.app.getElement<HTMLInputElement>('textMeshDepthNum');
        const resRange = this.app.getElement<HTMLInputElement>('textMeshResolutionRange');
        const resNum = this.app.getElement<HTMLInputElement>('textMeshResolutionNum');
        const colorPicker = this.app.getElement<HTMLInputElement>('textMeshColorPicker');
        const colorHex = this.app.getElement<HTMLElement>('textMeshColorHex');

        if (textInput && document.activeElement !== textInput) textInput.value = cfg.text;
        if (fontSelect) fontSelect.value = cfg.fontUrl;
        if (sizeRange) sizeRange.value = String(cfg.size);
        if (sizeNum && document.activeElement !== sizeNum) sizeNum.value = String(cfg.size);
        if (depthRange) depthRange.value = String(cfg.depth);
        if (depthNum && document.activeElement !== depthNum) depthNum.value = String(cfg.depth);
        if (resRange) resRange.value = String(cfg.resolution);
        if (resNum && document.activeElement !== resNum) resNum.value = String(cfg.resolution);
        if (colorPicker) colorPicker.value = cfg.color;
        if (colorHex) colorHex.textContent = cfg.color;
      }
    } else if (badge) {
      badge.innerHTML =
        'Enter text and click <strong>Create 3D Text</strong>, or select an existing 3D text mesh to edit it.';
    }
  }
}
