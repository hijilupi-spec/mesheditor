import { AbstractEditorTool } from './AbstractEditorTool';
import { Mesh } from '@babylonjs/core';
import { RobloxAssetValidator, RobloxValidationReport } from '../../robloxAssetValidator/RobloxAssetValidator';
import { RobloxAssetProfileId } from '../../robloxAssetValidator/RobloxRequirementProfiles';

export class RobloxAssetValidatorEditorTool extends AbstractEditorTool {
  public readonly name = 'roblox_asset_validator';
  public readonly dialogId = 'dialog-roblox-validator';
  public readonly triggerButtonId = 'btnToggleRobloxValidator';
  public readonly menuId = 'menuTools';
  public readonly menuLabel = 'Roblox Asset Validator';
  public readonly category = 'Optimization';
  public readonly icon = 'shield-check';
  public readonly order = 17;
  public readonly description = 'Run a read-only Roblox asset preflight against the active Babylon scene.';
  public readonly helpText = '<h4>Overview</h4><p>Runs a local preflight only. It does not verify Roblox Studio import, marketplace approval, R15 fidelity, or official cage correspondence.</p>';
  private app: any;
  private report: RobloxValidationReport | null = null;
  private invalidated = false;
  private originalSceneModified?: () => void;
  private wrappedSceneModified?: () => void;
  private originalTexturesChanged?: () => void;
  private wrappedTexturesChanged?: () => void;

  public onOpen(app: any): void { this.app = app; this.bind(); this.refresh(); }
  public onUpdateUI(app: any): void { this.app = app; this.bind(); this.refresh(); }
  public onClose(): void { /* Keep invalidation hooks active while the dialog is closed. */ }
  public onMinimize(): void { /* Keep invalidation hooks active while the dialog is minimized. */ }
  public onMaximize(app: any): void { this.app = app; this.bind(); this.refresh(); }

  private bind(): void {
    const root = document.getElementById(this.dialogId);
    if (!root || root.dataset.bound === '1') return;
    root.dataset.bound = '1';
    root.querySelector<HTMLButtonElement>('[data-action="validate"]')?.addEventListener('click', () => this.validate());
    root.querySelector<HTMLButtonElement>('[data-action="export"]')?.addEventListener('click', () => this.downloadReport());
    root.querySelector<HTMLButtonElement>('[data-action="postflight"]')?.addEventListener('click', () => root.querySelector<HTMLInputElement>('[data-field="glb"]')?.click());
    root.querySelector<HTMLInputElement>('[data-field="glb"]')?.addEventListener('change', async (event) => {
      const file = (event.currentTarget as HTMLInputElement).files?.[0]; if (!file || !this.report || this.report.stale) return;
      const result = await RobloxAssetValidator.validateGlbPostflight(file, this.getMeshes());
      if (result) { result.filename = file.name; this.report.exportPostflight = result; this.persistReport(); this.refresh(); }
    });
    root.querySelector<HTMLSelectElement>('[data-field="profile"]')?.addEventListener('change', () => this.validate());
    const events = this.app?.service?.events;
    if (events && !this.wrappedSceneModified) {
      this.originalSceneModified = events.onSceneModified;
      this.wrappedSceneModified = () => { this.originalSceneModified?.(); this.invalidated = true; this.refresh(); };
      events.onSceneModified = this.wrappedSceneModified;
      this.originalTexturesChanged = events.onTexturesChanged;
      this.wrappedTexturesChanged = () => { this.originalTexturesChanged?.(); this.invalidated = true; this.refresh(); };
      events.onTexturesChanged = this.wrappedTexturesChanged;
    }
  }
  private getMeshes(): Mesh[] {
    return (this.app?.service?.scene?.meshes || []).filter((mesh: Mesh) => mesh instanceof Mesh && !mesh.isDisposed() && mesh.isEnabled() && !mesh.metadata?.isEditorHelper);
  }
  private getProfile(): RobloxAssetProfileId {
    return (document.querySelector<HTMLSelectElement>(`#${this.dialogId} [data-field="profile"]`)?.value || 'static_prop_mesh_v1') as RobloxAssetProfileId;
  }
  private validate(): void {
    if (!this.app?.service?.scene) return;
    try {
      this.report = RobloxAssetValidator.validate(this.getMeshes(), this.getProfile(), this.app.service.scene.metadata?.robloxAssetManifest || {});
      this.invalidated = false;
      this.persistReport();
      this.refresh();
    } catch (error) {
      const status = document.querySelector(`#${this.dialogId} [data-field="status"]`);
      if (status) status.textContent = error instanceof Error ? error.message : String(error);
    }
  }
  private persistReport(): void {
    if (!this.report || !this.app?.service?.scene) return;
    const scene = this.app.service.scene;
    scene.metadata = { ...(scene.metadata || {}), robloxAssetManifest: { profileId: this.report.profileId, profileVersion: this.report.profileVersion }, robloxAssetValidation: this.report };
  }
  private refresh(): void {
    const root = document.getElementById(this.dialogId);
    if (!root) return;
    const stored = this.app?.service?.scene?.metadata?.robloxAssetValidation as RobloxValidationReport | undefined;
    const fingerprint = RobloxAssetValidator.fingerprint(this.getMeshes());
    if (stored && (!this.report || (this.report.sceneFingerprint !== fingerprint && stored.sceneFingerprint === fingerprint))) {
      this.report = stored;
      this.invalidated = false;
      const profileSelect = root.querySelector<HTMLSelectElement>('[data-field="profile"]');
      if (profileSelect) profileSelect.value = stored.profileId;
    }
    if (this.report) this.report.stale = this.invalidated || this.report.sceneFingerprint !== RobloxAssetValidator.fingerprint(this.getMeshes());
    const report = this.report;
    const countEl = root.querySelector<HTMLElement>('[data-field="counts"]');
    const detailEl = root.querySelector<HTMLElement>('[data-field="checks"]');
    const statusEl = root.querySelector<HTMLElement>('[data-field="status"]');
    if (!report) { if (statusEl) statusEl.textContent = 'No report yet. Run validation.'; return; }
    const counts = RobloxAssetValidator.getCounts(report);
    if (countEl) countEl.textContent = `PASS ${counts.PASS} · WARNING ${counts.WARNING} · FAIL ${counts.FAIL} · NOT TESTED ${counts.NOT_TESTED}`;
    if (statusEl) statusEl.textContent = report.stale ? 'STALE — revalidate before using this report.' : `Local preflight · ${report.profileId} v${report.profileVersion} · ${report.generatedAt}${report.exportPostflight ? ` · GLB postflight ${report.exportPostflight.status}` : ''} · Roblox Studio NOT VERIFIED`;
    if (detailEl) detailEl.innerHTML = report.checks.concat(report.exportPostflight?.checks || []).map((check) => `<details class="tool-control-group"><summary><strong>${this.escape(check.status)} · ${this.escape(check.checkId)}</strong>${check.meshNodeId ? ` <span class="tool-sublabel">${this.escape(check.meshNodeId)}</span>` : ''}</summary><div>${this.escape(check.explanation)}</div><div class="tool-sublabel">Expected: ${this.escape(JSON.stringify(check.expected))} | Actual: ${this.escape(JSON.stringify(check.actual))}</div><a href="${this.escape(check.sourceUrl)}" target="_blank" rel="noopener">Source documentation</a>${check.suggestedAction ? `<div>Action: ${this.escape(check.suggestedAction)}</div>` : ''}</details>`).join('');
  }
  private downloadReport(): void {
    if (!this.report || this.report.stale) { this.validate(); }
    if (!this.report || this.report.stale) return;
    const blob = new Blob([JSON.stringify(this.report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${this.report.profileId}-validation.json`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  private escape(value: string): string { const div = document.createElement('div'); div.textContent = value; return div.innerHTML; }
}
