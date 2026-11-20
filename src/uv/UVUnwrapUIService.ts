import type { MeshEditorAppHost } from '../services/MeshEditorAppHost';

export class UVUnwrapUIService {
  constructor(private readonly app: MeshEditorAppHost) {}

  public initUVUnwrapUI(): void {
    const dialog = this.app.getElement('dialog-uv-unwrap');
    if (!dialog) return;

    this.app.service.uvUnwrapController.onUVModified = () => {
      this.updateUVUnwrapUI();
    };

    const sliderAngle = this.app.getElement<HTMLInputElement>('sliderUVSeamAngle');
    const valAngle = this.app.getElement('uvSeamAngleVal');
    if (sliderAngle) {
      sliderAngle.addEventListener('input', () => {
        const deg = parseInt(sliderAngle.value, 10) || 60;
        if (valAngle) valAngle.textContent = `${deg}°`;
        this.app.service.uvUnwrapController.angleThresholdDeg = deg;
      });
    }

    const chkSeamPick = this.app.getElement<HTMLInputElement>('chkUVInteractiveSeamPick');
    if (chkSeamPick) {
      chkSeamPick.addEventListener('change', () => {
        this.app.service.uvUnwrapController.seamPickMode = chkSeamPick.checked;
        if (chkSeamPick.checked) {
          this.app.activateExclusive3DTool('uv_unwrap');
        }
      });
    }
    this.app.service.uvUnwrapController.onStateChanged = (active: boolean) => {
      if (chkSeamPick) {
        chkSeamPick.checked = active && this.app.service.uvUnwrapController.seamPickMode;
      }
      this.updateUVUnwrapUI();
      this.app.updatePanelButtonStates();
    };

    this.app.getElement('btnUVMarkSmartSeams')?.addEventListener('click', () => {
      const mesh = this.app.service.uvUnwrapController.getActiveTargetMesh();
      if (!mesh) {
        this.app.showToast('Please select a 3D mesh to mark UV seams.', 'warning');
        return;
      }
      const res = this.app.service.uvUnwrapController.markSmartSeams(
        mesh,
        this.app.service.uvUnwrapController.angleThresholdDeg
      );
      this.app.showToast(`Marked ${res.seamEdgeCount} Smart UV Seam edges on "${mesh.name}".`, 'success');
      this.updateUVUnwrapUI();
    });

    this.app.getElement('btnUVClearSeams')?.addEventListener('click', () => {
      const mesh = this.app.service.uvUnwrapController.getActiveTargetMesh();
      if (!mesh) return;
      this.app.service.uvUnwrapController.clearSeams(mesh);
      this.app.showToast(`Cleared UV seams on "${mesh.name}".`, 'info');
      this.updateUVUnwrapUI();
    });

    const selectMethod = this.app.getElement<HTMLSelectElement>('selectUVUnwrapMethod');
    const selectMargin = this.app.getElement<HTMLSelectElement>('selectUVIslandMargin');
    const chkRotate = this.app.getElement<HTMLInputElement>('chkUVRotateOptimal');
    const chkChecker = this.app.getElement<HTMLInputElement>('chkUVCheckerPreview');
    const selectRes = this.app.getElement<HTMLSelectElement>('selectUVTextureRes');
    const numTargetDensity = this.app.getElement<HTMLInputElement>('numUVTargetTexelDensity');

    if (chkChecker) {
      chkChecker.addEventListener('change', () => {
        const mesh = this.app.service.uvUnwrapController.getActiveTargetMesh();
        if (mesh) {
          this.app.service.uvUnwrapController.toggleCheckerPreview(mesh, chkChecker.checked);
        }
      });
    }

    this.app.getElement('btnExecuteUVUnwrap')?.addEventListener('click', () => {
      const mesh = this.app.service.uvUnwrapController.getActiveTargetMesh();
      if (!mesh) {
        this.app.showToast('Please select a 3D mesh to unwrap.', 'warning');
        return;
      }
      const method = (selectMethod?.value || 'smart_seams') as
        | 'smart_seams'
        | 'angle_project'
        | 'cylindrical';
      const marginPx = parseInt(selectMargin?.value || '6', 10);
      const textureResolution = parseInt(selectRes?.value || '1024', 10);
      const rotateOptimal = chkRotate ? chkRotate.checked : true;

      const stats = this.app.service.uvUnwrapController.unwrapMesh(mesh, {
        method,
        angleThresholdDeg: this.app.service.uvUnwrapController.angleThresholdDeg,
        marginPx,
        textureResolution,
        rotateOptimal,
      });
      this.app.showToast(
        `Unwrapped "${mesh.name}" into ${stats.islandCount} UV islands (${stats.texelDensityPxPerMeter} px/m, ${stats.uvCoveragePercent}% coverage).`,
        'success'
      );
      this.updateUVUnwrapUI();
    });

    this.app.getElement('btnPackUVIslands')?.addEventListener('click', () => {
      const mesh = this.app.service.uvUnwrapController.getActiveTargetMesh();
      if (!mesh) {
        this.app.showToast('Please select a 3D mesh to pack UV islands.', 'warning');
        return;
      }
      const marginPx = parseInt(selectMargin?.value || '6', 10);
      const textureResolution = parseInt(selectRes?.value || '1024', 10);
      const rotateOptimal = chkRotate ? chkRotate.checked : true;
      const stats = this.app.service.uvUnwrapController.packUVIslands(mesh, {
        marginPx,
        textureResolution,
        rotateOptimal,
        normalizeScale: true,
      });
      this.app.showToast(
        `Packed ${stats.islandCount} UV islands (${stats.uvCoveragePercent}% UV space utilization).`,
        'success'
      );
      this.updateUVUnwrapUI();
    });

    this.app.getElement('btnApplyTexelDensity')?.addEventListener('click', () => {
      const mesh = this.app.service.uvUnwrapController.getActiveTargetMesh();
      if (!mesh) {
        this.app.showToast('Please select a 3D mesh to equalize Texel Density.', 'warning');
        return;
      }
      const targetPx = parseInt(numTargetDensity?.value || '512', 10) || 512;
      const textureResolution = parseInt(selectRes?.value || '1024', 10) || 1024;
      const stats = this.app.service.uvUnwrapController.normalizeTexelDensity(
        mesh,
        targetPx,
        textureResolution,
        false
      );
      this.app.showToast(
        `Normalized Texel Density on "${mesh.name}" to ${stats.texelDensityPxPerMeter} px/m.`,
        'success'
      );
      this.updateUVUnwrapUI();
    });

    this.updateUVUnwrapUI();
  }

  public updateUVUnwrapUI(): void {
    const dialog = this.app.getElement('dialog-uv-unwrap');
    if (!dialog) return;

    const mesh = this.app.service.uvUnwrapController.getActiveTargetMesh();
    const selectRes = this.app.getElement<HTMLSelectElement>('selectUVTextureRes');
    const res = parseInt(selectRes?.value || '1024', 10) || 1024;
    const stats = mesh
      ? this.app.service.uvUnwrapController.analyzeUVs(mesh, res)
      : {
          islandCount: 0,
          seamEdgeCount: 0,
          texelDensityPxPerMeter: 0,
          worldSurfaceAreaM2: 0,
          uvCoveragePercent: 0,
        };

    const islandsEl = this.app.getElement('uvStatIslandsSeams');
    const densityEl = this.app.getElement('uvStatTexelDensity');
    const areaEl = this.app.getElement('uvStatSurfaceArea');
    const covEl = this.app.getElement('uvCoverageBadge');
    const canvas = this.app.getElement<HTMLCanvasElement>('uvPreviewCanvas');

    if (islandsEl) {
      islandsEl.textContent = `${stats.islandCount} islands / ${stats.seamEdgeCount} seams`;
    }
    if (densityEl) {
      densityEl.textContent = `${stats.texelDensityPxPerMeter} px/m`;
    }
    if (areaEl) {
      areaEl.textContent = `${stats.worldSurfaceAreaM2.toFixed(2)} m²`;
    }
    if (covEl) {
      covEl.textContent = `Coverage: ${stats.uvCoveragePercent}%`;
    }
    if (canvas) {
      this.app.service.uvUnwrapController.renderUVLayoutToCanvas(mesh, canvas);
    }
  }
}
