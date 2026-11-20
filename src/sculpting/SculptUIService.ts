import type { Mesh } from '@babylonjs/core';
import type { MeshEditorAppHost } from '../services/MeshEditorAppHost';
import { SculptBrushType } from './SculptController';

export class SculptUIService {
  constructor(private readonly app: MeshEditorAppHost) {}

  public openSculptTool(): void {
    this.app.service.sculptController.setActive(true);
    this.updateSculptUI();
  }

  public closeSculptTool(): void {
    this.app.service.sculptController.setActive(false);
  }

  public initSculptUI(): void {
    const dialog = this.app.getElement('dialog-sculpt');
    if (!dialog) return;

    // Hook model modification & active state changes
    this.app.service.sculptController.onMeshModified = () => {
      this.updateSculptUI();
    };
    this.app.service.sculptController.onStateChanged = () => {
      this.updateSculptUI();
      this.app.updatePanelButtonStates();
    };

    // Explicit toggle button for Draw / Sculpt brushes
    const btnDrawToggle = this.app.getElement<HTMLButtonElement>('btnSculptDrawToggle');
    btnDrawToggle?.addEventListener('click', () => {
      if (this.app.service.sculptController.isActive) {
        this.app.service.sculptController.setActive(false);
      } else {
        this.app.activateExclusive3DTool('sculpt_retopo');
      }
      this.updateSculptUI();
      this.app.updatePanelButtonStates();
    });

    // Brush selection pills
    const brushButtons = dialog.querySelectorAll<HTMLButtonElement>('.btn-sculpt-brush');
    brushButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const brush = (btn.dataset.brush || 'clay') as SculptBrushType;
        this.app.service.sculptController.setBrushType(brush);
        this.app.activateExclusive3DTool('sculpt_retopo');
        this.updateSculptUI();
        this.app.updatePanelButtonStates();
      });
    });

    // Radius controls
    const sliderRadius = this.app.getElement<HTMLInputElement>('sliderSculptRadius');
    const valRadius = this.app.getElement('sculptRadiusValue');
    if (sliderRadius) {
      sliderRadius.addEventListener('input', () => {
        const val = parseFloat(sliderRadius.value);
        if (valRadius) valRadius.textContent = val.toFixed(2);
        this.app.service.sculptController.setRadius(val);
      });
    }

    // Strength controls
    const sliderStrength = this.app.getElement<HTMLInputElement>('sliderSculptStrength');
    const valStrength = this.app.getElement('sculptStrengthValue');
    if (sliderStrength) {
      sliderStrength.addEventListener('input', () => {
        const val = parseFloat(sliderStrength.value);
        if (valStrength) valStrength.textContent = val.toFixed(2);
        this.app.service.sculptController.setStrength(val);
      });
    }

    // Symmetry & Invert checkboxes
    const chkSymmetry = this.app.getElement<HTMLInputElement>('chkSculptSymmetry');
    if (chkSymmetry) {
      chkSymmetry.addEventListener('change', () => {
        this.app.service.sculptController.setSymmetry(chkSymmetry.checked);
      });
    }
    const chkInvert = this.app.getElement<HTMLInputElement>('chkSculptInvert');
    if (chkInvert) {
      chkInvert.addEventListener('change', () => {
        this.app.service.sculptController.setInvert(chkInvert.checked);
      });
    }

    // Base Mesh Spawners
    const getSelectedPose = (): 't_pose' | 'a_pose' => {
      const selectPose = this.app.getElement<HTMLSelectElement>('selectSculptPose');
      return selectPose?.value === 'a_pose' ? 'a_pose' : 't_pose';
    };

    const getSelectedStyle = (): 'organic' | 'mannequin' => {
      const selectStyle = this.app.getElement<HTMLSelectElement>('selectSculptStyle');
      return selectStyle?.value === 'mannequin' ? 'mannequin' : 'organic';
    };

    this.app.getElement('btnSpawnHumanoidBase')?.addEventListener('click', () => {
      const pose = getSelectedPose();
      const style = getSelectedStyle();
      const mesh = this.app.service.sculptController.spawnHumanoidBaseMesh({ pose, style });
      this.app.activateExclusive3DTool('sculpt_retopo');
      this.app.showToast(`Spawned Humanoid Base Mesh "${mesh.name}" (8-Head ${pose === 't_pose' ? 'T-Pose' : 'A-Pose'}).`, 'success');
      this.updateSculptUI();
      this.app.updatePanelButtonStates();
    });

    this.app.getElement('btnSpawnChibiBase')?.addEventListener('click', () => {
      const pose = getSelectedPose();
      const style = getSelectedStyle();
      const mesh = this.app.service.sculptController.spawnChibiBaseMesh({ pose, style });
      this.app.activateExclusive3DTool('sculpt_retopo');
      this.app.showToast(`Spawned Chibi / Toon Base Mesh "${mesh.name}" (3.5-Head ${pose === 't_pose' ? 'T-Pose' : 'A-Pose'}, ${style}).`, 'success');
      this.updateSculptUI();
      this.app.updatePanelButtonStates();
    });

    this.app.getElement('btnSpawnCreatureBase')?.addEventListener('click', () => {
      const mesh = this.app.service.sculptController.spawnOrganicCreatureBaseMesh();
      this.app.activateExclusive3DTool('sculpt_retopo');
      this.app.showToast(`Spawned Organic Creature / Demon Base Mesh "${mesh.name}" (Soft Continuous Contours).`, 'success');
      this.updateSculptUI();
      this.app.updatePanelButtonStates();
    });

    this.app.getElement('btnSpawnQuadrupedBase')?.addEventListener('click', () => {
      const mesh = this.app.service.sculptController.spawnQuadrupedBaseMesh();
      this.app.activateExclusive3DTool('sculpt_retopo');
      this.app.showToast(`Spawned Quadruped Base Mesh "${mesh.name}" (Digitigrade locomotion).`, 'success');
      this.updateSculptUI();
      this.app.updatePanelButtonStates();
    });

    this.app.getElement('btnSpawnHeadBust')?.addEventListener('click', () => {
      const mesh = this.app.service.sculptController.spawnHeadBust();
      this.app.activateExclusive3DTool('sculpt_retopo');
      this.app.showToast(`Spawned Head & Facial Plane Bust "${mesh.name}".`, 'success');
      this.updateSculptUI();
      this.app.updatePanelButtonStates();
    });

    this.app.getElement('btnSpawnSculptSphere')?.addEventListener('click', () => {
      const mesh = this.app.service.sculptController.spawnSculptSphere();
      this.app.activateExclusive3DTool('sculpt_retopo');
      this.app.showToast(`Spawned Digital Clay Sphere "${mesh.name}".`, 'success');
      this.updateSculptUI();
      this.app.updatePanelButtonStates();
    });

    // Retopology presets & execution
    const selectPreset = this.app.getElement<HTMLSelectElement>('selectRetopoPreset');
    const numTargetFaces = this.app.getElement<HTMLInputElement>('numRetopoTargetFaces');
    const selectHighPoly = this.app.getElement<HTMLSelectElement>('selectRetopoHighPolyTarget');
    const numSurfaceOffset = this.app.getElement<HTMLInputElement>('numRetopoSurfaceOffset');

    if (selectPreset && numTargetFaces) {
      selectPreset.addEventListener('change', () => {
        if (selectPreset.value !== 'custom') {
          numTargetFaces.value = selectPreset.value;
        }
      });
    }

    if (numSurfaceOffset) {
      numSurfaceOffset.addEventListener('change', () => {
        const val = parseFloat(numSurfaceOffset.value) || 0.004;
        this.app.service.sculptController.quadSurfaceOffset = val;
      });
    }

    this.app.getElement('btnShrinkwrapMesh')?.addEventListener('click', () => {
      const lowMesh = this.app.service.selectedMesh;
      if (!lowMesh) {
        this.app.showToast('Please select a low-poly mesh in the viewport to Shrinkwrap.', 'warning');
        return;
      }
      const targetVal = selectHighPoly?.value || 'auto';
      const highMesh =
        targetVal !== 'auto'
          ? this.app.service.importedMeshes.find((m) => m.name === targetVal) || lowMesh
          : this.app.service.importedMeshes.find((m) => m !== lowMesh && !this.app.service.isEditorHelper(m)) ||
            lowMesh;
      const offset = numSurfaceOffset ? parseFloat(numSurfaceOffset.value) || 0.004 : 0.004;
      const analysis = this.app.service.sculptController.shrinkwrapMesh(lowMesh, highMesh, {
        offset,
        mode: 'nearest',
        smoothIterations: 1,
      });
      this.app.showToast(
        `Shrinkwrapped "${lowMesh.name}" onto "${highMesh.name}" (${analysis.triangleCount} tris).`,
        'success'
      );
      this.updateSculptUI();
    });

    this.app.getElement('btnGenerateQuadCage')?.addEventListener('click', () => {
      const targetMesh =
        this.app.service.selectedMesh ||
        this.app.service.importedMeshes.find((m) => !this.app.service.isEditorHelper(m));
      if (!targetMesh) {
        this.app.showToast('Please select a target sculpt mesh first.', 'warning');
        return;
      }
      const offset = numSurfaceOffset ? parseFloat(numSurfaceOffset.value) || 0.004 : 0.004;
      const cage = this.app.service.sculptController.generateQuadFlowCage(targetMesh, 14, 16, offset);
      this.app.service.selectMesh(cage);
      this.app.showToast(`Generated Quad-Flow Retopology Cage "${cage.name}".`, 'success');
      this.updateSculptUI();
    });

    this.app.getElement('btnExecuteRetopology')?.addEventListener('click', async () => {
      const targetMesh = this.app.service.selectedMesh;
      if (!targetMesh) {
        this.app.showToast('Please select a 3D mesh in the viewport to retopologize.', 'warning');
        return;
      }

      const targetFaces = parseInt(numTargetFaces?.value || '15000', 10);
      try {
        this.app.showToast('Retopologizing mesh with Quadric Error Metrics...', 'info');
        const analysis = await this.app.service.sculptController.retopologizeMesh(targetMesh, targetFaces);
        this.app.showToast(
          `Retopologized "${targetMesh.name}" to ${analysis.triangleCount} triangles (${analysis.gameReadiness}).`,
          'success'
        );
        this.updateSculptUI();
      } catch (err: any) {
        this.app.showToast(`Retopology failed: ${err.message || err}`, 'error');
      }
    });

    this.updateSculptUI();
  }

  public updateSculptUI(): void {
    const dialog = this.app.getElement('dialog-sculpt');
    if (!dialog) return;

    const isSculptActive = Boolean(this.app.service.sculptController?.isActive);
    const activeBrush = this.app.service.sculptController?.brushType || 'clay';
    const btnDrawToggle = this.app.getElement<HTMLButtonElement>('btnSculptDrawToggle');
    const lblDrawState = this.app.getElement<HTMLElement>('lblSculptDrawState');
    btnDrawToggle?.classList.toggle('active', isSculptActive);
    btnDrawToggle?.setAttribute('aria-pressed', String(isSculptActive));
    if (lblDrawState) {
      lblDrawState.textContent = isSculptActive ? 'Draw: ON' : 'Draw: OFF';
    }
    dialog.querySelectorAll<HTMLButtonElement>('.btn-sculpt-brush').forEach((btn) => {
      const isSelected = isSculptActive && btn.dataset.brush === activeBrush;
      btn.classList.toggle('active', isSelected);
      btn.setAttribute('aria-pressed', String(isSelected));
    });

    const targetMesh = this.app.service.selectedMesh || (this.app.service.importedMeshes[0] as Mesh);
    const nameEl = this.app.getElement('sculptMeshName');
    const triEl = this.app.getElement('sculptTriCount');
    const vertEl = this.app.getElement('sculptVertCount');
    const badgeEl = this.app.getElement('sculptGameBadge');

    if (!targetMesh) {
      if (nameEl) nameEl.textContent = 'None';
      if (triEl) triEl.textContent = '0';
      if (vertEl) vertEl.textContent = '0';
      if (badgeEl) {
        badgeEl.textContent = 'No Mesh';
        badgeEl.className = 'badge badge-secondary';
      }
      return;
    }

    const analysis = this.app.service.sculptController.analyzeTopology(targetMesh);
    if (nameEl) nameEl.textContent = targetMesh.name;
    if (triEl) triEl.textContent = analysis.triangleCount.toLocaleString();
    if (vertEl) vertEl.textContent = analysis.vertexCount.toLocaleString();
    if (badgeEl) {
      badgeEl.textContent = analysis.gameReadiness;
      badgeEl.style.background =
        analysis.gameReadinessClass === 'success'
          ? 'rgba(35, 134, 54, 0.2)'
          : analysis.gameReadinessClass === 'warning'
            ? 'rgba(210, 153, 34, 0.2)'
            : 'rgba(248, 81, 73, 0.2)';
      badgeEl.style.color =
        analysis.gameReadinessClass === 'success'
          ? '#3fb950'
          : analysis.gameReadinessClass === 'warning'
            ? '#d29922'
            : '#f85149';
      badgeEl.style.border =
        analysis.gameReadinessClass === 'success'
          ? '1px solid rgba(63, 185, 80, 0.3)'
          : analysis.gameReadinessClass === 'warning'
            ? '1px solid rgba(210, 153, 34, 0.3)'
            : '1px solid rgba(248, 81, 73, 0.3)';
    }

    const selectHighPoly = this.app.getElement<HTMLSelectElement>('selectRetopoHighPolyTarget');
    if (selectHighPoly) {
      const prevVal = selectHighPoly.value;
      const validMeshes = this.app.service.importedMeshes.filter(
        (m) => !this.app.service.isEditorHelper(m) && !m.isDisposed() && (!m.isEnabled || m.isEnabled())
      );
      selectHighPoly.innerHTML = `<option value="auto">Auto / Active High-Poly</option>`;
      for (const m of validMeshes) {
        const opt = document.createElement('option');
        opt.value = m.name;
        opt.textContent = m.name;
        selectHighPoly.appendChild(opt);
      }
      if (prevVal && Array.from(selectHighPoly.options).some((o) => o.value === prevVal)) {
        selectHighPoly.value = prevVal;
      }
    }
  }
}
