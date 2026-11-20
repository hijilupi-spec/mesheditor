import { Vector3 } from '@babylonjs/core';
import type { MeshEditorAppHost } from '../services/MeshEditorAppHost';

export class RiggingUIService {
  constructor(private readonly app: MeshEditorAppHost) {}

  public initRiggingUI(): void {
    const dialog = this.app.getElement('dialog-rigging');
    if (!dialog) return;

    this.app.service.weightPaintController.onWeightsModified = () => {
      this.updateRiggingUI();
    };

    const selectPreset = this.app.getElement<HTMLSelectElement>('selectRigPreset');
    const selectBone = this.app.getElement<HTMLSelectElement>('selectRigActiveBone');
    const sliderRadius = this.app.getElement<HTMLInputElement>('sliderWeightRadius');
    const valRadius = this.app.getElement('weightRadiusVal');
    const sliderStrength = this.app.getElement<HTMLInputElement>('sliderWeightStrength');
    const valStrength = this.app.getElement('weightStrengthVal');
    const chkSymmetry = this.app.getElement<HTMLInputElement>('chkWeightSymmetry');
    const chkHeatmap = this.app.getElement<HTMLInputElement>('chkWeightHeatmap');
    const sliderPose = this.app.getElement<HTMLInputElement>('sliderRigPoseAngle');
    const valPose = this.app.getElement('rigPoseAngleVal');

    this.app.getElement('btnCreateAutoRig')?.addEventListener('click', () => {
      const mesh = this.app.service.weightPaintController.getActiveTargetMesh();
      if (!mesh) {
        this.app.showToast('Please select a 3D mesh to rig.', 'warning');
        return;
      }

      const preset = (selectPreset?.value || 'humanoid') as 'humanoid' | 'chibi' | 'quadruped' | 'spine_chain';
      const skel = this.app.service.weightPaintController.createAutoRig(mesh, preset);
      this.app.activateExclusive3DTool('rigging_skinning');
      this.app.showToast(
        `Created ${preset} skeleton "${skel.name}" (${skel.bones.length} bones) and bound envelope skin weights!`,
        'success'
      );
      this.updateRiggingUI();
      this.app.updatePanelButtonStates();
    });

    const sliderArmHeight = this.app.getElement<HTMLInputElement>('sliderRigArmHeight');
    const valArmHeight = this.app.getElement('rigArmHeightVal');
    const sliderHipHeight = this.app.getElement<HTMLInputElement>('sliderRigHipHeight');
    const valHipHeight = this.app.getElement('rigHipHeightVal');

    if (selectPreset) {
      selectPreset.addEventListener('change', () => {
        const val = selectPreset.value;
        if (val === 'chibi') {
          if (sliderArmHeight) sliderArmHeight.value = '0.59';
          if (valArmHeight) valArmHeight.textContent = '59%';
          if (sliderHipHeight) sliderHipHeight.value = '0.36';
          if (valHipHeight) valHipHeight.textContent = '36%';
        } else if (val === 'humanoid') {
          if (sliderArmHeight) sliderArmHeight.value = '0.78';
          if (valArmHeight) valArmHeight.textContent = '78%';
          if (sliderHipHeight) sliderHipHeight.value = '0.48';
          if (valHipHeight) valHipHeight.textContent = '48%';
        }
      });
    }

    const applyProportionAdjustments = () => {
      const mesh = this.app.service.weightPaintController.getActiveTargetMesh();
      if (!mesh || !mesh.skeleton) return;
      const armRatio = parseFloat(sliderArmHeight?.value || '0.78');
      const hipRatio = parseFloat(sliderHipHeight?.value || '0.48');
      this.app.service.weightPaintController.adjustBoneHeights(mesh, armRatio, hipRatio);
    };

    if (sliderArmHeight) {
      sliderArmHeight.addEventListener('input', () => {
        const v = parseFloat(sliderArmHeight.value) || 0.78;
        if (valArmHeight) valArmHeight.textContent = `${Math.round(v * 100)}%`;
        applyProportionAdjustments();
      });
    }

    if (sliderHipHeight) {
      sliderHipHeight.addEventListener('input', () => {
        const v = parseFloat(sliderHipHeight.value) || 0.48;
        if (valHipHeight) valHipHeight.textContent = `${Math.round(v * 100)}%`;
        applyProportionAdjustments();
      });
    }

    this.app.getElement('btnNudgeBoneUp')?.addEventListener('click', () => {
      const mesh = this.app.service.weightPaintController.getActiveTargetMesh();
      if (!mesh || !mesh.skeleton) return;
      this.app.service.weightPaintController.nudgeActiveBone(mesh, new Vector3(0, 0.03, 0));
    });

    this.app.getElement('btnNudgeBoneDown')?.addEventListener('click', () => {
      const mesh = this.app.service.weightPaintController.getActiveTargetMesh();
      if (!mesh || !mesh.skeleton) return;
      this.app.service.weightPaintController.nudgeActiveBone(mesh, new Vector3(0, -0.03, 0));
    });

    this.app.getElement('btnAutoBindWeights')?.addEventListener('click', () => {
      const mesh = this.app.service.weightPaintController.getActiveTargetMesh();
      if (!mesh || !mesh.skeleton) {
        this.app.showToast('Please create an Auto-Rig skeleton on the mesh first.', 'warning');
        return;
      }
      this.app.service.weightPaintController.autoBindSkinWeights(mesh, mesh.skeleton);
      this.app.showToast(`Recalculated smooth envelope skin weights for "${mesh.name}".`, 'info');
      this.updateRiggingUI();
    });

    this.app.getElement('btnMergeRigParts')?.addEventListener('click', () => {
      const mesh = this.app.service.weightPaintController.getActiveTargetMesh();
      if (!mesh) return;
      const targets = this.app.service.weightPaintController.getTargetMeshes(mesh);
      if (targets.length <= 1) {
        this.app.showToast('Model is already a single unified mesh.', 'info');
        return;
      }
      this.app.service.weightPaintController.prepareMeshesForExport();
      this.app.service.selectNodes(targets);
      const merged = this.app.service.mergeSelectedMeshes();
      if (merged) {
        this.app.service.selectNodes([merged]);
        this.app.activateExclusive3DTool('rigging_skinning');
        this.app.showToast(`Merged ${targets.length} character parts into "${merged.name}".`, 'success');
        this.updateRiggingUI();
      }
    });

    if (selectBone) {
      selectBone.addEventListener('change', () => {
        const idx = parseInt(selectBone.value, 10) || 0;
        this.app.service.weightPaintController.setActiveBoneIndex(idx);
        if (sliderPose) sliderPose.value = '0';
        if (valPose) valPose.textContent = '0°';
      });
    }

    const modeButtons = dialog.querySelectorAll<HTMLButtonElement>('.btn-weight-mode');
    modeButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        modeButtons.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const mode = (btn.dataset.mode || 'add') as 'add' | 'subtract' | 'smooth' | 'replace';
        this.app.service.weightPaintController.setBrushMode(mode);
        this.app.activateExclusive3DTool('rigging_skinning');
        this.app.updatePanelButtonStates();
      });
    });

    if (sliderRadius) {
      sliderRadius.addEventListener('input', () => {
        const v = parseFloat(sliderRadius.value) || 0.35;
        if (valRadius) valRadius.textContent = v.toFixed(2);
        this.app.service.weightPaintController.setRadius(v);
      });
    }

    if (sliderStrength) {
      sliderStrength.addEventListener('input', () => {
        const v = parseFloat(sliderStrength.value) || 0.5;
        if (valStrength) valStrength.textContent = v.toFixed(2);
        this.app.service.weightPaintController.setStrength(v);
      });
    }

    if (chkSymmetry) {
      chkSymmetry.addEventListener('change', () => {
        this.app.service.weightPaintController.symmetryX = chkSymmetry.checked;
      });
    }

    if (chkHeatmap) {
      chkHeatmap.addEventListener('change', () => {
        this.app.service.weightPaintController.showHeatmap = chkHeatmap.checked;
        const mesh = this.app.service.weightPaintController.getActiveTargetMesh();
        if (mesh) {
          if (chkHeatmap.checked) {
            this.app.service.weightPaintController.updateWeightHeatmap(mesh);
          } else {
            this.app.service.weightPaintController.restoreOriginalVertexColors(mesh);
          }
        }
      });
    }

    if (sliderPose) {
      sliderPose.addEventListener('input', () => {
        const angle = parseFloat(sliderPose.value) || 0;
        if (valPose) valPose.textContent = `${angle}°`;
        const mesh = this.app.service.weightPaintController.getActiveTargetMesh();
        if (mesh) {
          this.app.service.weightPaintController.poseActiveBone(mesh, angle, 0, 0);
        }
      });
    }

    this.app.getElement('btnResetBindPose')?.addEventListener('click', () => {
      const mesh = this.app.service.weightPaintController.getActiveTargetMesh();
      if (mesh) {
        this.app.service.weightPaintController.resetBindPose(mesh);
      }
      if (sliderPose) sliderPose.value = '0';
      if (valPose) valPose.textContent = '0°';
    });

    this.updateRiggingUI();
  }

  public updateRiggingUI(): void {
    const dialog = this.app.getElement('dialog-rigging');
    if (!dialog) return;

    const mesh = this.app.service.weightPaintController.getActiveTargetMesh();
    const stats = this.app.service.weightPaintController.analyzeWeights(mesh);

    const selectBone = this.app.getElement<HTMLSelectElement>('selectRigActiveBone');
    if (selectBone) {
      if (mesh && mesh.skeleton && mesh.skeleton.bones.length > 0) {
        selectBone.innerHTML = '';
        mesh.skeleton.bones.forEach((b, idx) => {
          const opt = document.createElement('option');
          opt.value = idx.toString();
          opt.textContent = `${idx}: ${b.name}`;
          selectBone.appendChild(opt);
        });
        selectBone.value = stats.activeBoneIndex.toString();
      } else {
        selectBone.innerHTML = `<option value="0">None (Create Rig First)</option>`;
      }
    }

    const boneCountEl = this.app.getElement('rigStatBoneCount');
    const influencedEl = this.app.getElement('rigStatInfluencedVerts');
    if (boneCountEl) {
      boneCountEl.textContent = `${stats.boneCount} bones`;
    }
    if (influencedEl) {
      influencedEl.textContent = `${stats.influencedVertexCount} verts (avg ${stats.averageActiveWeight.toFixed(2)})`;
    }

    const targets = mesh ? this.app.service.weightPaintController.getTargetMeshes(mesh) : [];
    const multiBadge = this.app.getElement('rigMultiPartsBadge');
    const multiCount = this.app.getElement('rigMultiPartsCount');
    if (multiBadge) {
      if (targets.length > 1) {
        multiBadge.style.display = 'block';
        if (multiCount) multiCount.textContent = `${targets.length} Parts`;
      } else {
        multiBadge.style.display = 'none';
      }
    }
  }
}
