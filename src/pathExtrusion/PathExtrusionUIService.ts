import type { MeshEditorAppHost } from '../services/MeshEditorAppHost';
import { PathExtrusionStudio } from './PathExtrusionStudio';

export class PathExtrusionUIService {
  constructor(private readonly app: MeshEditorAppHost) {}

  public initPathExtrusionUI(): void {
    const pathSelect = this.app.getElement<HTMLSelectElement>('pathExtrusionSelect') || this.app.getElement<HTMLSelectElement>('pathwaySelect');
    const btnNew = this.app.getElement<HTMLButtonElement>('btnPathExtrusionNew') || this.app.getElement<HTMLButtonElement>('btnPathNew');
    const btnDelete = this.app.getElement<HTMLButtonElement>('btnPathExtrusionDelete') || this.app.getElement<HTMLButtonElement>('btnPathDelete');
    const shapeTypeSelect = this.app.getElement<HTMLSelectElement>('pathExtrusionShapeType') || this.app.getElement<HTMLSelectElement>('pathwayShapeType');
    const widthInput = this.app.getElement<HTMLInputElement>('pathExtrusionWidth') || this.app.getElement<HTMLInputElement>('pathwayWidth');
    const heightInput = this.app.getElement<HTMLInputElement>('pathExtrusionHeight') || this.app.getElement<HTMLInputElement>('pathwayHeight');
    const thicknessInput = this.app.getElement<HTMLInputElement>('pathExtrusionThickness') || this.app.getElement<HTMLInputElement>('pathwayThickness');
    const smoothStepsInput = this.app.getElement<HTMLInputElement>('pathExtrusionSmoothSteps') || this.app.getElement<HTMLInputElement>('pathwaySmoothSteps');
    const scaleInput = this.app.getElement<HTMLInputElement>('pathExtrusionScale') || this.app.getElement<HTMLInputElement>('pathwayScale');
    const twistInput = this.app.getElement<HTMLInputElement>('pathExtrusionTwist') || this.app.getElement<HTMLInputElement>('pathwayTwist');
    const colorInput = this.app.getElement<HTMLInputElement>('pathExtrusionColor') || this.app.getElement<HTMLInputElement>('pathwayColor');
    const colorHex = this.app.getElement<HTMLElement>('pathExtrusionColorHex') || this.app.getElement<HTMLElement>('pathwayColorHex');
    const btnRemovePoint = this.app.getElement<HTMLButtonElement>('btnPathExtrusionRemovePoint') || this.app.getElement<HTMLButtonElement>('btnPathRemovePoint');
    const btnClearPoints = this.app.getElement<HTMLButtonElement>('btnPathExtrusionClearPoints') || this.app.getElement<HTMLButtonElement>('btnPathClearPoints');
    const btnBake = this.app.getElement<HTMLButtonElement>('btnPathExtrusionBakeMesh') || this.app.getElement<HTMLButtonElement>('btnPathBakeMesh');

    pathSelect?.addEventListener('change', () => {
      this.app.service.pathExtrusion.selectPath(pathSelect.value);
      this.renderPathExtrusionUI();
    });

    btnNew?.addEventListener('click', () => {
      const created = this.app.service.pathExtrusion.addNewPath();
      this.renderPathExtrusionUI();
      this.app.showToast(`Created new path extrusion "${created.name}"`, 'success');
    });

    btnDelete?.addEventListener('click', () => {
      const active = this.app.service.pathExtrusion.activePath;
      if (!active) return;
      this.app.service.pathExtrusion.deletePath(active.id);
      this.renderPathExtrusionUI();
      this.app.showToast(`Deleted path extrusion "${active.name}"`, 'info');
    });

    shapeTypeSelect?.addEventListener('change', () => {
      this.app.service.pathExtrusion.updateShapeConfig({ shapeType: shapeTypeSelect.value as any });
    });

    const updateParams = () => {
      const cfg: any = {};
      if (widthInput) {
        const val = parseFloat(widthInput.value) || 1.0;
        cfg.width = val;
        cfg.radius = val / 2;
      }
      if (heightInput) cfg.height = parseFloat(heightInput.value) || 0.5;
      if (thicknessInput) cfg.thickness = parseFloat(thicknessInput.value) || 0;
      if (smoothStepsInput) cfg.smoothSteps = parseInt(smoothStepsInput.value, 10) || 10;
      if (scaleInput) cfg.scale = parseFloat(scaleInput.value) || 1.0;
      if (twistInput) cfg.twist = parseFloat(twistInput.value) || 0;
      this.app.service.pathExtrusion.updateShapeConfig(cfg);
    };

    widthInput?.addEventListener('input', updateParams);
    heightInput?.addEventListener('input', updateParams);
    thicknessInput?.addEventListener('input', updateParams);
    smoothStepsInput?.addEventListener('input', updateParams);
    scaleInput?.addEventListener('input', updateParams);
    twistInput?.addEventListener('input', updateParams);

    colorInput?.addEventListener('input', () => {
      if (colorHex) colorHex.textContent = colorInput.value;
      this.app.service.pathExtrusion.updateShapeConfig({ color: colorInput.value });
    });

    btnRemovePoint?.addEventListener('click', () => {
      this.app.service.pathExtrusion.removeSelectedPoint();
    });

    btnClearPoints?.addEventListener('click', () => {
      this.app.service.pathExtrusion.clearPoints();
      this.app.showToast('Cleared all path extrusion points', 'info');
    });

    btnBake?.addEventListener('click', () => {
      const mesh = this.app.service.pathExtrusion.bakeMesh();
      if (mesh) {
        this.renderPathExtrusionUI();
      }
    });

    const btnOpenStudio = this.app.getElement<HTMLButtonElement>('btnOpenPathExtrusionStudio');
    const chkTapPlace = this.app.getElement<HTMLInputElement>('chkPathExtrusionTapPlace');
    chkTapPlace?.addEventListener('change', () => {
      this.app.service.pathExtrusion.tapToPlaceMode = Boolean(chkTapPlace.checked);
    });
    btnOpenStudio?.addEventListener('click', () => {
      this.app.activateExclusive3DTool('path_extrusion');
      PathExtrusionStudio.open(this.app.service, this.app.service.pathExtrusion, () => {
        this.app.updatePanelButtonStates();
      });
      this.app.updatePanelButtonStates();
    });

    this.app.service.pathExtrusion.onStateChanged = () => {
      this.renderPathExtrusionUI();
      if (PathExtrusionStudio.isOpen()) {
        PathExtrusionStudio.open(this.app.service, this.app.service.pathExtrusion).refresh();
      }
    };
  }

  public renderPathExtrusionUI(): void {
    const pathSelect = this.app.getElement<HTMLSelectElement>('pathExtrusionSelect') || this.app.getElement<HTMLSelectElement>('pathwaySelect');
    const shapeTypeSelect = this.app.getElement<HTMLSelectElement>('pathExtrusionShapeType') || this.app.getElement<HTMLSelectElement>('pathwayShapeType');
    const widthInput = this.app.getElement<HTMLInputElement>('pathExtrusionWidth') || this.app.getElement<HTMLInputElement>('pathwayWidth');
    const heightInput = this.app.getElement<HTMLInputElement>('pathExtrusionHeight') || this.app.getElement<HTMLInputElement>('pathwayHeight');
    const thicknessInput = this.app.getElement<HTMLInputElement>('pathExtrusionThickness') || this.app.getElement<HTMLInputElement>('pathwayThickness');
    const smoothStepsInput = this.app.getElement<HTMLInputElement>('pathExtrusionSmoothSteps') || this.app.getElement<HTMLInputElement>('pathwaySmoothSteps');
    const scaleInput = this.app.getElement<HTMLInputElement>('pathExtrusionScale') || this.app.getElement<HTMLInputElement>('pathwayScale');
    const twistInput = this.app.getElement<HTMLInputElement>('pathExtrusionTwist') || this.app.getElement<HTMLInputElement>('pathwayTwist');
    const colorInput = this.app.getElement<HTMLInputElement>('pathExtrusionColor') || this.app.getElement<HTMLInputElement>('pathwayColor');
    const colorHex = this.app.getElement<HTMLElement>('pathExtrusionColorHex') || this.app.getElement<HTMLElement>('pathwayColorHex');

    if (pathSelect) {
      const currentVal = this.app.service.pathExtrusion.activePathId;
      pathSelect.innerHTML = '';
      if (this.app.service.pathExtrusion.paths.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'No paths created yet';
        pathSelect.appendChild(opt);
      } else {
        for (const p of this.app.service.pathExtrusion.paths) {
          const opt = document.createElement('option');
          opt.value = p.id;
          opt.textContent = `${p.name} (${p.points.length} pts)`;
          if (p.id === currentVal) opt.selected = true;
          pathSelect.appendChild(opt);
        }
      }
    }

    const active = this.app.service.pathExtrusion.activePath;
    if (!active) return;
    const cfg = active.shapeConfig;

    if (shapeTypeSelect && cfg.shapeType) shapeTypeSelect.value = cfg.shapeType;
    if (widthInput && cfg.width !== undefined) widthInput.value = String(cfg.width);
    if (heightInput && cfg.height !== undefined) heightInput.value = String(cfg.height);
    if (thicknessInput && cfg.thickness !== undefined) thicknessInput.value = String(cfg.thickness);
    if (smoothStepsInput && cfg.smoothSteps !== undefined) smoothStepsInput.value = String(cfg.smoothSteps);
    if (scaleInput && cfg.scale !== undefined) scaleInput.value = String(cfg.scale);
    if (twistInput && cfg.twist !== undefined) twistInput.value = String(cfg.twist);
    if (colorInput && cfg.color) colorInput.value = cfg.color;
    if (colorHex && cfg.color) colorHex.textContent = cfg.color;
  }

  public initPathWaysUI(): void {
    this.initPathExtrusionUI();
  }

  public renderPathWaysUI(): void {
    this.renderPathExtrusionUI();
  }
}
