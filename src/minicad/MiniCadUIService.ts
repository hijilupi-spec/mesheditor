import { Matrix, Vector3 } from '@babylonjs/core';
import type { MeshEditorAppHost } from '../services/MeshEditorAppHost';
import { getMiniCadRecipe, roundMm } from './MiniCadGeometry';
import {
  MINICAD_HOLE_PRESETS,
  MiniCadAlignAction,
  MiniCadFaceDir,
  MiniCadHolePresetId,
  MiniCadInteractionMode,
  MiniCadProfileId,
  MiniCadShapeKind,
  MiniCadStarterTemplateId,
} from './types';

export class MiniCadUIService {
  constructor(private readonly app: MeshEditorAppHost) {}

  public initMiniCadUI(): void {
    const dialog = this.app.getElement('dialog-minicad');
    if (!dialog || (dialog as any)._miniCadInitialized) return;
    (dialog as any)._miniCadInitialized = true;

    const ctrl = this.app.service.miniCadController;
    ctrl.onStateChanged = () => {
      this.updateMiniCadUI();
      this.app.updatePanelButtonStates();
    };
    ctrl.onHudRefresh = () => {
      this.updateViewportHud();
    };

    // Main active toggle
    this.app.getElement('btnMiniCadToggleMode')?.addEventListener('click', () => {
      if (ctrl.isActive) {
        ctrl.setActive(false);
      } else {
        this.app.activateExclusive3DTool('minicad');
      }
      this.updateMiniCadUI();
      this.updateViewportHud();
    });

    // Profile & Snap
    const profileSelect = this.app.getElement<HTMLSelectElement>('miniCadProfileSelect');
    profileSelect?.addEventListener('change', () => {
      ctrl.setProfile(profileSelect.value as MiniCadProfileId);
      const snapSel = this.app.getElement<HTMLSelectElement>('miniCadSnapSelect');
      if (snapSel) snapSel.value = String(ctrl.snapMm);
      this.app.showToast(`MiniCAD Profile: ${ctrl.getProfile().label}`, 'info');
    });

    const snapSelect = this.app.getElement<HTMLSelectElement>('miniCadSnapSelect');
    snapSelect?.addEventListener('change', () => {
      ctrl.snapMm = parseFloat(snapSelect.value) || 0;
      this.updateViewportHud();
    });

    const colorInput = this.app.getElement<HTMLInputElement>('miniCadColorPicker');
    colorInput?.addEventListener('input', () => {
      ctrl.defaultColor = colorInput.value || '#3b82f6';
    });

    // Mode buttons inside panel
    const modeButtons: Array<[string, MiniCadInteractionMode]> = [
      ['btnMiniCadModeSelect', 'select'],
      ['btnMiniCadModePushPull', 'push_pull'],
      ['btnMiniCadModeBox', 'draw_box'],
      ['btnMiniCadModeCyl', 'draw_cylinder'],
      ['btnMiniCadModeHole', 'punch_hole'],
    ];
    for (const [btnId, mode] of modeButtons) {
      this.app.getElement(btnId)?.addEventListener('click', () => {
        if (!ctrl.isActive) this.app.activateExclusive3DTool('minicad');
        ctrl.setInteractionMode(mode);
      });
    }

    // Viewport HUD mode buttons
    const hudModeButtons: Array<[string, MiniCadInteractionMode]> = [
      ['btnHudCadSelect', 'select'],
      ['btnHudCadPushPull', 'push_pull'],
      ['btnHudCadBox', 'draw_box'],
      ['btnHudCadCyl', 'draw_cylinder'],
      ['btnHudCadHole', 'punch_hole'],
    ];
    for (const [btnId, mode] of hudModeButtons) {
      this.app.getElement(btnId)?.addEventListener('click', () => {
        ctrl.setInteractionMode(mode);
      });
    }

    this.app.getElement('btnHudCadClose')?.addEventListener('click', () => {
      ctrl.setActive(false);
    });

    // Quick Create Shapes
    const quickShapes: Array<[string, MiniCadShapeKind]> = [
      ['btnMiniCadAddBox', 'box'],
      ['btnMiniCadAddRoundedBox', 'rounded_box'],
      ['btnMiniCadAddCylinder', 'cylinder'],
      ['btnMiniCadAddTube', 'tube'],
      ['btnMiniCadAddBracket', 'l_bracket'],
      ['btnMiniCadAddPlate', 'plate'],
    ];
    for (const [btnId, shape] of quickShapes) {
      this.app.getElement(btnId)?.addEventListener('click', () => {
        const mesh = ctrl.createPart({ shape, color: ctrl.defaultColor });
        this.app.updateOutliner();
        this.app.showToast(`Created CAD ${shape} "${mesh.name}"`, 'success');
      });
    }

    // Starter Templates
    const templates: Array<[string, MiniCadStarterTemplateId]> = [
      ['btnMiniCadTplEnclosure', 'enclosure'],
      ['btnMiniCadTplBracket', 'bracket'],
      ['btnMiniCadTplShelf', 'shelf_unit'],
      ['btnMiniCadTplSpacer', 'spacer_hub'],
    ];
    for (const [btnId, tplId] of templates) {
      this.app.getElement(btnId)?.addEventListener('click', () => {
        const meshes = ctrl.createStarterTemplate(tplId);
        this.app.updateOutliner();
        this.app.showToast(`Created "${tplId}" starter (${meshes.length} part(s))`, 'success');
      });
    }

    // Inline Dimension Editing (both panel & Viewport HUD)
    const applyDimFromInputs = (wId: string, hId: string, dId: string, rId?: string) => {
      const w = parseFloat(this.app.getElement<HTMLInputElement>(wId)?.value || '');
      const h = parseFloat(this.app.getElement<HTMLInputElement>(hId)?.value || '');
      const d = parseFloat(this.app.getElement<HTMLInputElement>(dId)?.value || '');
      const r = rId ? parseFloat(this.app.getElement<HTMLInputElement>(rId)?.value || '') : NaN;
      ctrl.updateSelectedDimensions({
        width: Number.isFinite(w) && w > 0 ? w : undefined,
        height: Number.isFinite(h) && h > 0 ? h : undefined,
        depth: Number.isFinite(d) && d > 0 ? d : undefined,
        cornerRadius: Number.isFinite(r) && r >= 0 ? r : undefined,
      });
    };

    for (const id of ['miniCadDimW', 'miniCadDimH', 'miniCadDimD', 'miniCadDimR']) {
      this.app.getElement(id)?.addEventListener('change', () => {
        applyDimFromInputs('miniCadDimW', 'miniCadDimH', 'miniCadDimD', 'miniCadDimR');
      });
    }
    for (const id of ['hudCadDimW', 'hudCadDimH', 'hudCadDimD']) {
      this.app.getElement(id)?.addEventListener('change', () => {
        applyDimFromInputs('hudCadDimW', 'hudCadDimH', 'hudCadDimD');
      });
    }

    this.app.getElement('btnMiniCadDropFloor')?.addEventListener('click', () => {
      if (this.app.service.selectedMesh) {
        ctrl.dropMeshToFloor(this.app.service.selectedMesh);
      }
    });

    // Hole Punch Options
    const holePresetSel = this.app.getElement<HTMLSelectElement>('miniCadHolePreset');
    if (holePresetSel && holePresetSel.options.length === 0) {
      for (const preset of Object.values(MINICAD_HOLE_PRESETS)) {
        const opt = document.createElement('option');
        opt.value = preset.id;
        opt.textContent = preset.label;
        holePresetSel.appendChild(opt);
      }
      holePresetSel.value = ctrl.holePresetId;
    }
    holePresetSel?.addEventListener('change', () => {
      ctrl.holePresetId = holePresetSel.value as MiniCadHolePresetId;
    });

    const chkThrough = this.app.getElement<HTMLInputElement>('chkMiniCadHoleThrough');
    chkThrough?.addEventListener('change', () => {
      ctrl.holeThroughAll = chkThrough.checked;
    });
    const chkCorners = this.app.getElement<HTMLInputElement>('chkMiniCadHoleCorners');
    chkCorners?.addEventListener('change', () => {
      ctrl.holeSymmetricCorners = chkCorners.checked;
    });
    const numInset = this.app.getElement<HTMLInputElement>('numMiniCadHoleInset');
    numInset?.addEventListener('change', () => {
      ctrl.holeCornerInsetMm = Math.max(1, parseFloat(numInset.value) || 6);
    });

    // Shell & Bevel Modifiers
    this.app.getElement('btnMiniCadApplyShell')?.addEventListener('click', () => {
      const mesh = this.app.service.selectedMesh;
      if (!mesh) {
        this.app.showToast('Select a part first.', 'warning');
        return;
      }
      const wall = parseFloat(this.app.getElement<HTMLInputElement>('numMiniCadShellWall')?.value || '2') || 2;
      const openFace = (this.app.getElement<HTMLSelectElement>('selMiniCadShellFace')?.value || 'top') as MiniCadFaceDir | 'none';
      ctrl.setShellOnMesh(mesh, wall, openFace);
      this.app.showToast(`Applied ${wall} mm shell (open ${openFace})`, 'success');
    });

    this.app.getElement('btnMiniCadApplyBevel')?.addEventListener('click', () => {
      const mesh = this.app.service.selectedMesh;
      if (!mesh) {
        this.app.showToast('Select a part first.', 'warning');
        return;
      }
      const width = parseFloat(this.app.getElement<HTMLInputElement>('numMiniCadBevelWidth')?.value || '0.8') || 0;
      const segs = parseInt(this.app.getElement<HTMLSelectElement>('selMiniCadBevelSegs')?.value || '2', 10) || 2;
      ctrl.setBevelOnMesh(mesh, width, segs);
      this.app.showToast(width > 0 ? `Applied ${width} mm bevel` : 'Removed bevel', 'success');
    });

    this.app.getElement('btnMiniCadBake')?.addEventListener('click', () => {
      const mesh = this.app.service.selectedMesh;
      if (mesh && ctrl.bakeMeshToStatic(mesh)) {
        this.app.showToast(`Baked "${mesh.name}" to static mesh.`, 'info');
      }
    });

    // Align buttons
    const alignActions: Array<[string, MiniCadAlignAction]> = [
      ['btnMiniCadAlignCenterX', 'center_x'],
      ['btnMiniCadAlignCenterZ', 'center_z'],
      ['btnMiniCadAlignStackTop', 'stack_on_top'],
      ['btnMiniCadAlignFlushLeft', 'flush_left'],
      ['btnMiniCadAlignFlushFront', 'flush_front'],
      ['btnMiniCadAlignGapX', 'gap_x'],
    ];
    for (const [btnId, action] of alignActions) {
      this.app.getElement(btnId)?.addEventListener('click', () => {
        const nodes = this.app.service.selectedNodes;
        const gapMm = parseFloat(this.app.getElement<HTMLInputElement>('numMiniCadAlignGap')?.value || '0') || 0;
        let target = this.app.service.selectedMesh;
        let anchor: any = null;
        if (nodes.length >= 2) {
          anchor = nodes[0];
          target = nodes[nodes.length - 1] as any;
        } else if (target) {
          const siblings = this.app.service.importedMeshes.filter(
            (m) => m !== target && !m.isDisposed() && m.isEnabled() && !this.app.service.isEditorHelper(m)
          );
          anchor = siblings[0];
        }
        if (!target || !anchor || target === anchor) {
          this.app.showToast('Select 2 parts (or have another part in scene) to align.', 'warning');
          return;
        }
        ctrl.alignMeshes(target, anchor, action, gapMm);
      });
    }

    // Printability & Cut List & Export STL (mm)
    this.app.getElement('btnMiniCadPrintCheck')?.addEventListener('click', () => {
      const report = ctrl.inspectSelectedPrintability();
      const out = this.app.getElement('miniCadReportOutput');
      if (!report) {
        this.app.showToast('Select a part to inspect.', 'warning');
        return;
      }
      if (out) {
        const statusBadge = report.isWatertight
          ? '<span style="color:#3fb950;font-weight:600;">Watertight Manifold</span>'
          : '<span style="color:#f85149;font-weight:600;">Non-Watertight</span>';
        const warnHtml =
          report.warnings.length > 0
            ? `<ul style="margin:6px 0 0 16px;padding:0;color:#d29922;">${report.warnings.map((w) => `<li>${w}</li>`).join('')}</ul>`
            : '<div style="color:#3fb950;margin-top:4px;">No printability issues detected.</div>';
        out.innerHTML = `
          <div><strong>${report.meshName}</strong> · ${statusBadge}</div>
          <div style="margin-top:4px;">Size: ${report.stats.widthMm} × ${report.stats.heightMm} × ${report.stats.depthMm} mm · Vol: ${report.stats.volumeCm3} cm³ · Tris: ${report.stats.triangleCount}</div>
          ${warnHtml}
        `;
        out.style.display = 'block';
      }
    });

    this.app.getElement('btnMiniCadCutList')?.addEventListener('click', () => {
      const items = ctrl.getWoodworkCutList();
      const out = this.app.getElement('miniCadReportOutput');
      if (!out) return;
      if (items.length === 0) {
        out.innerHTML = '<div>No parts in scene.</div>';
        out.style.display = 'block';
        return;
      }
      const rows = items
        .map(
          (it) =>
            `<tr><td>${it.name}</td><td>${it.quantity}×</td><td>${it.lengthMm} × ${it.widthMm} × ${it.thicknessMm} mm</td></tr>`
        )
        .join('');
      out.innerHTML = `
        <div style="font-weight:600;margin-bottom:4px;">Woodwork / Parts Cut List</div>
        <table class="minicad-cutlist-table"><thead><tr><th>Part</th><th>Qty</th><th>L × W × T</th></tr></thead><tbody>${rows}</tbody></table>
      `;
      out.style.display = 'block';
    });

    this.app.getElement('btnMiniCadExportStl')?.addEventListener('click', () => {
      const blob = ctrl.exportStlInTrueMm(false, 'minicad_model_mm');
      if (!blob) {
        this.app.showToast('Nothing to export.', 'warning');
        return;
      }
      this.app.triggerDownloadBlob(blob, 'minicad_model_mm.stl');
      this.app.showToast('Exported STL scaled to true millimeters.', 'success');
    });

    this.updateMiniCadUI();
    this.updateViewportHud();
  }

  public updateMiniCadUI(): void {
    const ctrl = this.app.service.miniCadController;
    const btnToggle = this.app.getElement<HTMLButtonElement>('btnMiniCadToggleMode');
    if (btnToggle) {
      btnToggle.classList.toggle('active', ctrl.isActive);
      btnToggle.innerHTML = ctrl.isActive
        ? '<i class="app-icon" data-lucide="ruler"></i> MiniCAD Mode Active (Click to Pause)'
        : '<i class="app-icon" data-lucide="ruler"></i> Enable MiniCAD Viewport Mode';
    }

    const modeMap: Record<MiniCadInteractionMode, string> = {
      select: 'btnMiniCadModeSelect',
      push_pull: 'btnMiniCadModePushPull',
      draw_box: 'btnMiniCadModeBox',
      draw_cylinder: 'btnMiniCadModeCyl',
      punch_hole: 'btnMiniCadModeHole',
    };
    for (const [m, id] of Object.entries(modeMap)) {
      this.app.getElement(id)?.classList.toggle('active', ctrl.isActive && ctrl.interactionMode === m);
    }

    const profileSel = this.app.getElement<HTMLSelectElement>('miniCadProfileSelect');
    if (profileSel && profileSel.value !== ctrl.profileId) {
      profileSel.value = ctrl.profileId;
    }

    const mesh = this.app.service.selectedMesh;
    const dimsSection = this.app.getElement('miniCadSelectedSection');
    const emptySection = this.app.getElement('miniCadNoSelectionHint');
    if (mesh && !this.app.service.isEditorHelper(mesh)) {
      if (dimsSection) dimsSection.style.display = 'block';
      if (emptySection) emptySection.style.display = 'none';
      const dims = ctrl.getMeshDimensionsMm(mesh);
      const setVal = (id: string, val: number | undefined) => {
        const el = this.app.getElement<HTMLInputElement>(id);
        if (el && document.activeElement !== el && val !== undefined) {
          el.value = String(roundMm(val, 2));
        }
      };
      setVal('miniCadDimW', dims.width);
      setVal('miniCadDimH', dims.height);
      setVal('miniCadDimD', dims.depth);
      setVal('miniCadDimR', dims.cornerRadius ?? 0);

      // Render Feature Stack
      const stackEl = this.app.getElement('miniCadFeatureList');
      if (stackEl) {
        const recipe = getMiniCadRecipe(mesh);
        if (!recipe || recipe.features.length === 0) {
          stackEl.innerHTML =
            '<div class="tool-sublabel">No parametric features yet. Use Shell, Bevel, or Punch Hole.</div>';
        } else {
          stackEl.innerHTML = recipe.features
            .map(
              (f) =>
                `<div class="minicad-feature-item">
                  <span>${f.label || f.kind}</span>
                  <button type="button" class="minicad-feature-del" data-feature-id="${f.id}" title="Remove feature">×</button>
                </div>`
            )
            .join('');
          stackEl.querySelectorAll<HTMLButtonElement>('.minicad-feature-del').forEach((btn) => {
            btn.addEventListener('click', () => {
              const fid = btn.dataset.featureId;
              if (fid) ctrl.removeFeatureFromMesh(mesh, fid);
            });
          });
        }
      }
    } else {
      if (dimsSection) dimsSection.style.display = 'none';
      if (emptySection) emptySection.style.display = 'block';
    }

    this.app.refreshIcons();
    this.updateViewportHud();
  }

  public updateViewportHud(): void {
    const ctrl = this.app.service.miniCadController;
    const hud = this.app.getElement('minicadViewportHud');
    const overlayContainer = this.app.getElement('minicadDimensionOverlays');
    if (!hud) return;

    if (!ctrl.isActive) {
      hud.style.display = 'none';
      if (overlayContainer) overlayContainer.innerHTML = '';
      return;
    }

    hud.style.display = 'flex';
    const hudModeMap: Record<MiniCadInteractionMode, string> = {
      select: 'btnHudCadSelect',
      push_pull: 'btnHudCadPushPull',
      draw_box: 'btnHudCadBox',
      draw_cylinder: 'btnHudCadCyl',
      punch_hole: 'btnHudCadHole',
    };
    for (const [m, id] of Object.entries(hudModeMap)) {
      this.app.getElement(id)?.classList.toggle('active', ctrl.interactionMode === m);
    }

    const badge = this.app.getElement('hudCadProfileBadge');
    if (badge) {
      badge.textContent = `${ctrl.getProfile().label} · Snap ${ctrl.snapMm > 0 ? `${ctrl.snapMm} mm` : 'Off'}`;
    }

    const faceBadge = this.app.getElement('hudCadHoverBadge');
    if (faceBadge) {
      if (ctrl.lastLiveActionLabel) {
        faceBadge.textContent = ctrl.lastLiveActionLabel;
      } else if (ctrl.hoveredFace) {
        faceBadge.textContent = `Face: ${ctrl.hoveredFace.faceDir.toUpperCase()} (${ctrl.hoveredFace.offsetUMm}, ${ctrl.hoveredFace.offsetVMm} mm)`;
      } else {
        faceBadge.textContent = 'Hover any face to snap, push/pull, or punch holes';
      }
    }

    const mesh = this.app.service.selectedMesh;
    const dimsRow = this.app.getElement('hudCadDimsRow');
    if (dimsRow) {
      if (mesh && !this.app.service.isEditorHelper(mesh)) {
        dimsRow.style.display = 'flex';
        const dims = ctrl.getMeshDimensionsMm(mesh);
        const setHudVal = (id: string, val: number) => {
          const el = this.app.getElement<HTMLInputElement>(id);
          if (el && document.activeElement !== el) el.value = String(roundMm(val, 1));
        };
        setHudVal('hudCadDimW', dims.width);
        setHudVal('hudCadDimH', dims.height);
        setHudVal('hudCadDimD', dims.depth);
      } else {
        dimsRow.style.display = 'none';
      }
    }

    // Project 3D smart guides into 2D screen badges
    if (overlayContainer) {
      const scene = this.app.service.scene;
      const camera = this.app.service.camera;
      const engine = scene.getEngine();
      if (!camera || !engine || ctrl.activeGuides.length === 0) {
        overlayContainer.innerHTML = '';
        return;
      }
      const viewport = camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight());
      const transform = scene.getTransformMatrix();
      const pills: string[] = [];
      for (const g of ctrl.activeGuides) {
        const mid = new Vector3(
          (g.fromWorld[0] + g.toWorld[0]) * 0.5,
          (g.fromWorld[1] + g.toWorld[1]) * 0.5,
          (g.fromWorld[2] + g.toWorld[2]) * 0.5
        );
        const projected = Vector3.Project(mid, Matrix.Identity(), transform, viewport);
        if (projected.z >= 0 && projected.z <= 1) {
          const cls = g.kind === 'center' ? 'minicad-guide-pill is-center' : 'minicad-guide-pill';
          pills.push(
            `<div class="${cls}" style="left:${Math.round(projected.x)}px;top:${Math.round(projected.y)}px;">${g.label}</div>`
          );
        }
      }
      overlayContainer.innerHTML = pills.join('');
    }
  }
}
