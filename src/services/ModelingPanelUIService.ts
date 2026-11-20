import type { PrimitiveShape } from '../types';
import type { MeshEditorAppHost } from './MeshEditorAppHost';

export class ModelingPanelUIService {
  constructor(private readonly app: MeshEditorAppHost) {}

  public setCSGTargetFromSelected(): void {
    if (
      !this.app.service.selectedMesh ||
      this.app.service.isEditorHelper(this.app.service.selectedMesh) ||
      this.app.service.selectedMesh.getTotalVertices() === 0
    ) {
      this.app.showToast('Please select a valid 3D mesh with geometry first.', 'warning');
      return;
    }
    this.app.csgParams.targetMesh = this.app.service.selectedMesh.name;
    this.updateCSGGUI();
    this.app.showToast(`Target mesh set to "${this.app.service.selectedMesh.name}"`, 'info');
  }

  public setCSGToolFromSelected(): void {
    if (
      !this.app.service.selectedMesh ||
      this.app.service.isEditorHelper(this.app.service.selectedMesh) ||
      this.app.service.selectedMesh.getTotalVertices() === 0
    ) {
      this.app.showToast('Please select a valid 3D mesh with geometry first.', 'warning');
      return;
    }
    this.app.csgParams.toolMesh = this.app.service.selectedMesh.name;
    this.updateCSGGUI();
    this.app.showToast(`Tool / Cutter mesh set to "${this.app.service.selectedMesh.name}"`, 'info');
  }

  public swapCSGMeshes(): void {
    const tmp = this.app.csgParams.targetMesh;
    this.app.csgParams.targetMesh = this.app.csgParams.toolMesh;
    this.app.csgParams.toolMesh = tmp;
    this.updateCSGGUI();
    this.app.showToast('Swapped CSG Target and Tool meshes.', 'info');
  }

  public addQuickCutter(shape: 'Box' | 'Cylinder' | 'Sphere'): void {
    const cutterMesh = this.app.service.addQuickCutter(shape, this.app.csgParams.targetMesh);
    if (cutterMesh) {
      this.app.csgParams.toolMesh = cutterMesh.name;
      this.app.updateOutliner();
      this.updateCSGGUI();
    }
  }

  public async performCSGOperation(op: 'subtract' | 'union' | 'intersect'): Promise<void> {
    const targetMesh = this.app.service.importedMeshes.find((m) => m.name === this.app.csgParams.targetMesh);
    const toolMesh = this.app.service.importedMeshes.find((m) => m.name === this.app.csgParams.toolMesh);

    if (!targetMesh) {
      this.app.showToast('Please select a Target Mesh first.', 'warning');
      return;
    }
    if (!toolMesh) {
      this.app.showToast('Please select a Tool / Cutter Mesh first.', 'warning');
      return;
    }

    const chkNonDestructive = this.app.getElement<HTMLInputElement>('chkCSGNonDestructive');
    const sliderBevelWidth = this.app.getElement<HTMLInputElement>('sliderCSGBevelWidth');
    const selectBevelSegments = this.app.getElement<HTMLSelectElement>('selectCSGBevelSegments');
    const numBevelAngle = this.app.getElement<HTMLInputElement>('numCSGBevelAngle');

    const nonDestructive = chkNonDestructive ? chkNonDestructive.checked : true;
    const bevelWidth = sliderBevelWidth ? parseFloat(sliderBevelWidth.value) || 0 : 0;
    const bevelSegments = selectBevelSegments ? parseInt(selectBevelSegments.value, 10) || 2 : 2;
    const angleThresholdDeg = numBevelAngle ? parseFloat(numBevelAngle.value) || 30 : 30;

    const result = await this.app.service.performCSGOperation(
      targetMesh,
      toolMesh,
      op,
      this.app.csgParams.keepToolMesh,
      {
        nonDestructive,
        bevelWidth,
        bevelSegments,
        angleThresholdDeg,
      }
    );
    if (result) {
      this.app.csgParams.targetMesh = result.name;
      if (!this.app.csgParams.keepToolMesh) {
        this.app.csgParams.toolMesh = 'None';
      }
      this.app.updateOutliner();
      this.updateCSGGUI();
    }
  }

  public updateCSGGUI(): void {
    const validMeshes = this.app.service.importedMeshes.filter(
      (m) => !this.app.service.isEditorHelper(m) && m.name !== '__root__' && m.getTotalVertices() > 0 && (!m.isEnabled || m.isEnabled())
    );
    const meshNames = validMeshes.map((m) => m.name);
    const options = ['None', ...meshNames];

    // If current target no longer exists, reset to None
    if (this.app.csgParams.targetMesh !== 'None' && !meshNames.includes(this.app.csgParams.targetMesh)) {
      this.app.csgParams.targetMesh = 'None';
    }
    // If current tool no longer exists, reset to None
    if (this.app.csgParams.toolMesh !== 'None' && !meshNames.includes(this.app.csgParams.toolMesh)) {
      this.app.csgParams.toolMesh = 'None';
    }

    // Auto-suggest selected mesh as target if target is None, or pick first valid mesh
    if (this.app.csgParams.targetMesh === 'None') {
      const sel = this.app.service.selectedMesh;
      if (sel && !this.app.service.isEditorHelper(sel) && sel.name !== '__root__' && sel.getTotalVertices() > 0) {
        this.app.csgParams.targetMesh = sel.name;
      } else if (validMeshes.length > 0) {
        this.app.csgParams.targetMesh = validMeshes[0].name;
      }
    }

    if (this.app.csgControllers['targetMesh']) {
      this.updateDropdownOptions(this.app.csgControllers['targetMesh'], options, this.app.csgParams.targetMesh);
      this.app.csgControllers['targetMesh'].updateDisplay();
    }
    if (this.app.csgControllers['toolMesh']) {
      this.updateDropdownOptions(this.app.csgControllers['toolMesh'], options, this.app.csgParams.toolMesh);
      this.app.csgControllers['toolMesh'].updateDisplay();
    }

    const badge = this.app.getElement('csgNonDestructiveBadge');
    const selMesh = this.app.service.selectedMesh;
    if (badge) {
      const ndMeta = selMesh?.metadata?.nonDestructiveCSG;
      if (ndMeta?.isNonDestructive) {
        badge.textContent = ndMeta.bevel?.enabled
          ? `Beveled (${ndMeta.bevel.sharpEdgeCount} edges)`
          : 'Non-Destructive Ready';
      } else {
        badge.textContent = 'Active';
      }
    }
  }

  public initCSGBevelUI(): void {
    const sliderWidth = this.app.getElement<HTMLInputElement>('sliderCSGBevelWidth');
    const widthVal = this.app.getElement('csgBevelWidthVal');
    const selectSegments = this.app.getElement<HTMLSelectElement>('selectCSGBevelSegments');
    const numAngle = this.app.getElement<HTMLInputElement>('numCSGBevelAngle');
    const chkNonDestructive = this.app.getElement<HTMLInputElement>('chkCSGNonDestructive');

    if (sliderWidth) {
      sliderWidth.addEventListener('input', () => {
        const val = parseFloat(sliderWidth.value);
        if (widthVal) widthVal.textContent = val.toFixed(2);
      });
    }

    this.app.getElement('btnApplyCSGBevel')?.addEventListener('click', () => {
      const target =
        this.app.service.selectedMesh ||
        this.app.service.importedMeshes.find((m) => m.name === this.app.csgParams.targetMesh);
      if (!target) {
        this.app.showToast('Please select a mesh to apply the Bevel Modifier.', 'warning');
        return;
      }
      const width = sliderWidth ? parseFloat(sliderWidth.value) || 0.04 : 0.04;
      const segments = selectSegments ? parseInt(selectSegments.value, 10) || 2 : 2;
      const angleThresholdDeg = numAngle ? parseFloat(numAngle.value) || 30 : 30;
      const nonDestructive = chkNonDestructive ? chkNonDestructive.checked : true;

      const { sharpEdgeCount } = this.app.service.applyNonDestructiveBevel(target, {
        width,
        segments,
        angleThresholdDeg,
        nonDestructive,
      });
      this.app.showToast(
        `Applied Non-Destructive Bevel (w=${width.toFixed(2)}, ${segments} segs) across ${sharpEdgeCount} sharp edges on "${target.name}".`,
        'success'
      );
      this.updateCSGGUI();
    });

    this.app.getElement('btnRevertCSGBase')?.addEventListener('click', () => {
      const target =
        this.app.service.selectedMesh ||
        this.app.service.importedMeshes.find((m) => m.name === this.app.csgParams.targetMesh);
      if (!target) {
        this.app.showToast('Please select a mesh to revert.', 'warning');
        return;
      }
      const reverted = this.app.service.revertNonDestructiveMesh(target);
      if (reverted) {
        this.app.showToast(`Reverted "${target.name}" to its original un-beveled base geometry.`, 'info');
        this.updateCSGGUI();
      } else {
        this.app.showToast(`Mesh "${target.name}" has no non-destructive modifier state to revert.`, 'warning');
      }
    });
  }

  public playAnimation(): void {
    this.app.service.playAnimation(this.app.animParams.loop, this.app.animParams.speed);
  }

  public pauseAnimation(): void {
    this.app.service.pauseAnimation();
  }

  public stopAnimation(): void {
    this.app.service.stopAnimation();
    this.app.animParams.frame = 0;
    this.app.animControllers['frame']?.updateDisplay();
  }

  public selectAnimationGroup(name: string): void {
    if (name === 'None' || name === 'No animations') return;
    const ag = this.app.service.selectAnimationGroup(name);
    if (ag) {
      this.app.animParams.clip = ag.name || name;
      const from = Math.floor(ag.from || 0);
      const to = Math.max(from + 1, Math.floor(ag.to || 100));
      if (this.app.animControllers['frame']) {
        this.app.animControllers['frame'].min(from);
        this.app.animControllers['frame'].max(to);
        this.app.animParams.frame = from;
        this.app.animControllers['frame'].updateDisplay();
      }
      this.app.animParams.loop = ag.loopAnimation !== undefined ? ag.loopAnimation : true;
      this.app.animParams.speed = ag.speedRatio || 1.0;
      this.app.animControllers['loop']?.updateDisplay();
      this.app.animControllers['speed']?.updateDisplay();
      this.playAnimation();
    }
  }

  public setupAnimations(names: string[], currentGroup: any | null): void {
    if (names.length > 0 && currentGroup) {
      this.app.animParams.clip = currentGroup.name || names[0];
      if (this.app.animControllers['clip']) {
        this.updateDropdownOptions(this.app.animControllers['clip'], names, this.app.animParams.clip);
        this.app.animControllers['clip'].setValue(this.app.animParams.clip);
        this.app.animControllers['clip'].updateDisplay();
      }
      const from = Math.floor(currentGroup.from || 0);
      const to = Math.max(from + 1, Math.floor(currentGroup.to || 100));
      if (this.app.animControllers['frame']) {
        this.app.animControllers['frame'].min(from);
        this.app.animControllers['frame'].max(to);
        this.app.animParams.frame = from;
        this.app.animControllers['frame'].updateDisplay();
      }
      this.app.animParams.loop = currentGroup.loopAnimation !== undefined ? currentGroup.loopAnimation : true;
      this.app.animParams.speed = currentGroup.speedRatio || 1.0;
      this.app.animControllers['loop']?.updateDisplay();
      this.app.animControllers['speed']?.updateDisplay();

      // Automatically open the Animation Player dialog
      this.app.toggleDialog('dialog-anim', true);

      // Automatically play the default clip
      this.playAnimation();
    } else {
      this.app.animParams.clip = 'No animations';
      if (this.app.animControllers['clip']) {
        this.updateDropdownOptions(this.app.animControllers['clip'], ['No animations'], 'No animations');
        this.app.animControllers['clip'].setValue('No animations');
        this.app.animControllers['clip'].updateDisplay();
      }
      if (this.app.animControllers['frame']) {
        this.app.animControllers['frame'].min(0);
        this.app.animControllers['frame'].max(100);
        this.app.animParams.frame = 0;
        this.app.animControllers['frame'].updateDisplay();
      }
    }
  }

  public updateCreateShapeVisibility(shape: string): void {
    const isBox = shape === 'Box';
    const isSphere = shape === 'Sphere';
    const isCylinder = shape === 'Cylinder' || shape === 'Cone';
    const isCapsule = shape === 'Capsule';
    const isTorus = shape === 'Torus' || shape === 'TorusKnot';
    const isPlane = shape === 'Plane';
    const isDisc = shape === 'Disc';
    const isGround = shape === 'Ground';
    const isPoly = shape === 'Polyhedron';

    const toggle = (ctrl: dat.GUIController | undefined, show: boolean) => {
      if (!ctrl || !ctrl.domElement) return;
      const li = ctrl.domElement.closest('li');
      if (li) (li as HTMLElement).style.display = show ? 'block' : 'none';
    };

    toggle(this.app.createControllers['width'], isBox || isPlane || isGround);
    toggle(this.app.createControllers['height'], isBox || isCylinder || isCapsule || isPlane);
    toggle(this.app.createControllers['depth'], isBox || isGround);
    toggle(this.app.createControllers['diameter'], isSphere || isCylinder || isCapsule || isTorus || isDisc);
    toggle(this.app.createControllers['thickness'], isTorus);
    toggle(this.app.createControllers['tessellation'], isSphere || isCylinder || isCapsule || isTorus || isDisc);
    toggle(this.app.createControllers['subdivisions'], isSphere || isGround);
    toggle(this.app.createControllers['size'], isPoly || isPlane);
    toggle(this.app.createControllers['polyType'], isPoly);
  }

  public createPrimitiveMesh(): void {
    const polyTypeNum = parseInt(this.app.createParams.polyType.split(':')[0], 10) || 1;
    this.app.service.createPrimitive({
      shape: this.app.createParams.shape,
      name: this.app.createParams.name,
      size: this.app.createParams.size,
      width: this.app.createParams.width,
      height: this.app.createParams.height,
      depth: this.app.createParams.depth,
      diameter: this.app.createParams.diameter,
      thickness: this.app.createParams.thickness,
      tessellation: this.app.createParams.tessellation,
      subdivisions: this.app.createParams.subdivisions,
      polyType: polyTypeNum,
      color: this.app.createParams.color,
      roughness: this.app.createParams.roughness,
      metallic: this.app.createParams.metallic,
    });
  }

  public startPrimitivePlacement(): void {
    const polyTypeNum = parseInt(this.app.createParams.polyType.split(':')[0], 10) || 1;
    this.app.service.startPlacementMode({
      shape: this.app.createParams.shape,
      name: this.app.createParams.name,
      size: this.app.createParams.size,
      width: this.app.createParams.width,
      height: this.app.createParams.height,
      depth: this.app.createParams.depth,
      diameter: this.app.createParams.diameter,
      thickness: this.app.createParams.thickness,
      tessellation: this.app.createParams.tessellation,
      subdivisions: this.app.createParams.subdivisions,
      polyType: polyTypeNum,
      color: this.app.createParams.color,
      roughness: this.app.createParams.roughness,
      metallic: this.app.createParams.metallic,
    });
  }

  public updateDropdownOptions(controller: dat.GUIController, options: string[], currentVal: string): void {
    if (!controller || !controller.domElement) return;
    const select = controller.domElement.querySelector('select');
    if (select) {
      select.innerHTML = '';
      for (const opt of options) {
        const optionElem = document.createElement('option');
        optionElem.value = opt;
        optionElem.textContent = opt;
        if (opt === currentVal) {
          optionElem.selected = true;
        }
        select.appendChild(optionElem);
      }
      if (options.includes(currentVal)) {
        select.value = currentVal;
      } else {
        select.value = options[0] || 'None';
      }
    }
  }
}
