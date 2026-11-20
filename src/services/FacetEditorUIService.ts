import { Color3, Material, Mesh, PBRMaterial, StandardMaterial, Texture, Vector3 } from '@babylonjs/core';
import type { MeshEditorAppHost } from './MeshEditorAppHost';

export class FacetEditorUIService {
  constructor(private readonly app: MeshEditorAppHost) {}

  public updateFacetPickUI(): void {
    const btnPickToggle = this.app.getElement<HTMLButtonElement>('btnFacetPickToggle');
    const lblPickState = this.app.getElement<HTMLElement>('lblFacetPickState');
    const active = this.app.service.facetEditorActive;
    btnPickToggle?.classList.toggle('active', active);
    btnPickToggle?.setAttribute('aria-pressed', String(active));
    if (lblPickState) lblPickState.textContent = active ? 'Pick: ON' : 'Pick: OFF';
  }

  public initFacetToolUI(): void {
    const btnPickToggle = this.app.getElement<HTMLButtonElement>('btnFacetPickToggle');
    const badge = this.app.getElement<HTMLElement>('facetSelectedBadge');
    const btnModeFace = this.app.getElement<HTMLButtonElement>('btnFacetModeFace');
    const btnModeVertex = this.app.getElement<HTMLButtonElement>('btnFacetModeVertex');
    const coordsStrip = this.app.getElement<HTMLElement>('facetVertexCoordsStrip');
    const inputX = this.app.getElement<HTMLInputElement>('facetVertexX');
    const inputY = this.app.getElement<HTMLInputElement>('facetVertexY');
    const inputZ = this.app.getElement<HTMLInputElement>('facetVertexZ');

    const updateModeUI = (mode: 'face' | 'vertex') => {
      btnModeFace?.classList.toggle('active', mode === 'face');
      btnModeVertex?.classList.toggle('active', mode === 'vertex');
      if (mode === 'vertex') {
        if (coordsStrip && this.app.service.selectedVertexIndex !== null) {
          coordsStrip.style.display = 'flex';
        }
      } else {
        if (coordsStrip) coordsStrip.style.display = 'none';
      }
    };

    btnModeFace?.addEventListener('click', () => {
      this.app.service.setFacetEditMode('face');
      updateModeUI('face');
    });

    btnModeVertex?.addEventListener('click', () => {
      this.app.service.setFacetEditMode('vertex');
      updateModeUI('vertex');
    });

    btnPickToggle?.addEventListener('click', () => {
      if (!this.app.service.facetEditorActive) {
        this.app.activateExclusive3DTool('facet_editor');
      } else {
        this.app.service.toggleFacetEditor(false);
      }
      this.updateFacetPickUI();
      this.app.updatePanelButtonStates();
    });

    this.app.service.events.onFacetEditorStateChanged = (active: boolean) => {
      this.app.facetParams.active = active;
      this.updateFacetPickUI();
      this.app.updatePanelButtonStates();
    };

    this.updateFacetPickUI();

    this.app.service.events.onFacetEditModeChanged = (mode: 'face' | 'vertex') => {
      updateModeUI(mode);
    };

    this.app.service.events.onFaceSelected = (faceId: number | null, isQuad?: boolean) => {
      if (badge) {
        if (faceId !== null) {
          badge.textContent = isQuad ? `Quad #${faceId} selected` : `Face #${faceId} selected`;
          badge.classList.add('active');
        } else {
          badge.textContent = this.app.service.facetEditMode === 'vertex' ? 'No vertex picked' : 'No face picked';
          badge.classList.remove('active');
        }
      }
      this.updateFacetSurfaceUI();
    };

    this.app.service.events.onVertexSelected = (vertexIndex: number | null, pos?: Vector3) => {
      if (vertexIndex !== null && pos) {
        if (badge) {
          badge.textContent = `Vertex #${vertexIndex} selected`;
          badge.classList.add('active');
        }
        if (coordsStrip) coordsStrip.style.display = 'flex';
        if (inputX && document.activeElement !== inputX) inputX.value = pos.x.toFixed(2);
        if (inputY && document.activeElement !== inputY) inputY.value = pos.y.toFixed(2);
        if (inputZ && document.activeElement !== inputZ) inputZ.value = pos.z.toFixed(2);
      } else {
        if (coordsStrip) coordsStrip.style.display = 'none';
        if (this.app.service.facetEditMode === 'vertex' && badge) {
          badge.textContent = 'No vertex picked';
          badge.classList.remove('active');
        }
      }
    };

    const applyVertexCoords = () => {
      if (this.app.service.selectedVertexIndex === null) return;
      const x = parseFloat(inputX?.value || '0');
      const y = parseFloat(inputY?.value || '0');
      const z = parseFloat(inputZ?.value || '0');
      this.app.service.setVertexPosition(x, y, z);
    };
    inputX?.addEventListener('change', applyVertexCoords);
    inputY?.addEventListener('change', applyVertexCoords);
    inputZ?.addEventListener('change', applyVertexCoords);

    // Initial sync
    this.updateFacetPickUI();
    updateModeUI(this.app.service.facetEditMode);
    this.updateFacetSurfaceUI();

    const chkSingleTri = this.app.getElement<HTMLInputElement>('chkFacetSingleTri');
    chkSingleTri?.addEventListener('change', () => {
      this.app.service.setFacetSingleTriangleMode(!!chkSingleTri.checked);
      this.updateFacetSurfaceUI();
    });

    this.app.getElement('btnFacetUVFit')?.addEventListener('click', () => {
      this.app.service.projectSelectedFacetUVs('fit');
    });
    this.app.getElement('btnFacetUVPlanar')?.addEventListener('click', () => {
      this.app.service.projectSelectedFacetUVs('planar');
    });
    this.app.getElement('btnFacetUVRot90')?.addEventListener('click', () => {
      this.app.service.transformSelectedFacetUVs({ rotateDeg: 90 });
    });
    this.app.getElement('btnFacetUVFlipU')?.addEventListener('click', () => {
      this.app.service.transformSelectedFacetUVs({ flipU: true });
    });
    this.app.getElement('btnFacetUVFlipV')?.addEventListener('click', () => {
      this.app.service.transformSelectedFacetUVs({ flipV: true });
    });

    this.app.getElement('btnFacetApplyUVRect')?.addEventListener('click', () => {
      const uMin = parseFloat(this.app.getElement<HTMLInputElement>('facetUVMinU')?.value ?? '0');
      const uMax = parseFloat(this.app.getElement<HTMLInputElement>('facetUVMaxU')?.value ?? '1');
      const vMin = parseFloat(this.app.getElement<HTMLInputElement>('facetUVMinV')?.value ?? '0');
      const vMax = parseFloat(this.app.getElement<HTMLInputElement>('facetUVMaxV')?.value ?? '1');
      this.app.service.setSelectedFacetUVRect(uMin, uMax, vMin, vMax);
    });

    this.app.getElement('btnFacetApplyCornerUVs')?.addEventListener('click', () => {
      const cornerGrid = this.app.getElement<HTMLElement>('facetCornerUVGrid');
      if (!cornerGrid) return;
      const uInputs = Array.from(cornerGrid.querySelectorAll<HTMLInputElement>('.facet-corner-u'));
      const vInputs = Array.from(cornerGrid.querySelectorAll<HTMLInputElement>('.facet-corner-v'));
      const pairs: Array<{ u: number; v: number }> = [];
      for (let i = 0; i < Math.min(uInputs.length, vInputs.length); i++) {
        pairs.push({
          u: parseFloat(uInputs[i].value),
          v: parseFloat(vInputs[i].value),
        });
      }
      this.app.service.setSelectedFacetCornerUVs(pairs);
    });

    const atlasSelect = this.app.getElement<HTMLSelectElement>('facetUVAtlasSelect');
    atlasSelect?.addEventListener('change', () => {
      this.renderFacetAtlasTileGrid(atlasSelect.value);
    });

    this.app.getElement('btnFacetAssignMaterial')?.addEventListener('click', () => {
      const matSelect = this.app.getElement<HTMLSelectElement>('facetMaterialSelect');
      if (matSelect?.value) {
        this.app.service.assignMaterialToSelectedFacet(matSelect.value);
      }
    });

    this.app.getElement('btnFacetApplyColorMat')?.addEventListener('click', () => {
      const colorInput = this.app.getElement<HTMLInputElement>('facetNewMatColor');
      const nameInput = this.app.getElement<HTMLInputElement>('facetNewMatName');
      this.app.service.assignNewColorMaterialToSelectedFacet(
        colorInput?.value || '#4f8cf6',
        nameInput?.value
      );
    });

    this.app.getElement('btnFacetApplyEmbeddedTex')?.addEventListener('click', () => {
      const texSelect = this.app.getElement<HTMLSelectElement>('facetEmbeddedTexSelect');
      if (!texSelect?.value) return;
      const selectedOpt = texSelect.options[texSelect.selectedIndex];
      this.app.service.assignTextureToSelectedFacet(texSelect.value, selectedOpt?.textContent || undefined);
    });

    const texFileInput = this.app.getElement<HTMLInputElement>('facetTextureFileInput');
    this.app.getElement('btnFacetUploadTexture')?.addEventListener('click', () => {
      texFileInput?.click();
    });
    texFileInput?.addEventListener('change', () => {
      const file = texFileInput.files?.[0];
      if (file) {
        this.app.service.assignTextureToSelectedFacet(file, file.name);
        texFileInput.value = '';
      }
    });

    const inputDist = this.app.getElement<HTMLInputElement>('facetInputDistance');
    inputDist?.addEventListener('input', () => {
      this.app.facetParams.extrudeDist = parseFloat(inputDist.value) || 0.5;
    });

    const inputInset = this.app.getElement<HTMLInputElement>('facetInputInset');
    inputInset?.addEventListener('input', () => {
      this.app.facetParams.insetAmount = parseFloat(inputInset.value) || 0.25;
    });

    const inputThickness = this.app.getElement<HTMLInputElement>('facetInputThickness');
    inputThickness?.addEventListener('input', () => {
      this.app.facetParams.thickness = parseFloat(inputThickness.value) || 0.2;
    });

    const inputSegments = this.app.getElement<HTMLInputElement>('facetInputSegments');
    inputSegments?.addEventListener('input', () => {
      this.app.facetParams.segments = parseInt(inputSegments.value, 10) || 4;
    });

    this.app.getElement('btnFacetExtrude')?.addEventListener('click', () => this.app.facetParams.extrudeNow());
    this.app.getElement('btnFacetInset')?.addEventListener('click', () => this.app.facetParams.insetNow());
    this.app.getElement('btnFacetArc')?.addEventListener('click', () => this.app.facetParams.arcNow());
    this.app.getElement('btnFacetKnife')?.addEventListener('click', () => this.app.facetParams.knifeNow());
    this.app.getElement('btnFacetLoopCut')?.addEventListener('click', () => this.app.facetParams.loopCutNow());
    this.app.getElement('btnFacetBevel')?.addEventListener('click', () => this.app.facetParams.bevelNow());
    this.app.getElement('btnFacetSolidify')?.addEventListener('click', () => this.app.facetParams.solidifyNow());
    this.app.getElement('btnFacetArray')?.addEventListener('click', () => this.app.facetParams.arrayNow());
    this.app.getElement('btnFacetCutThrough')?.addEventListener('click', () => this.app.facetParams.cutThroughNow());
    this.app.getElement('btnFacetRelax')?.addEventListener('click', () => this.app.facetParams.relaxNow());
    this.app.getElement('btnFacetSubdivide')?.addEventListener('click', () => this.app.facetParams.subdivideNow());
    this.app.getElement('btnFacetSubD')?.addEventListener('click', () => this.app.facetParams.subDNow());
    this.app.getElement('btnFacetFlipNormal')?.addEventListener('click', () => this.app.facetParams.flipNormal());
    this.app.getElement('btnFacetDelete')?.addEventListener('click', () => this.app.facetParams.deleteFacet());
  }

  public renderFacetAtlasTileGrid(selectedAtlasId?: string): void {
    const grid = this.app.getElement<HTMLElement>('facetUVAtlasTileGrid');
    const atlasSelect = this.app.getElement<HTMLSelectElement>('facetUVAtlasSelect');
    if (!grid) return;

    const atlases = this.app.service.textureAtlasManager.getAtlases();
    const targetId = selectedAtlasId || atlasSelect?.value || atlases[0]?.id;
    const atlas = atlases.find((a) => a.id === targetId) || atlases[0];

    if (!atlas) {
      grid.dataset.atlasKey = '';
      grid.innerHTML = '<div class="tool-sublabel">No texture atlas loaded.</div>';
      return;
    }

    const atlasKey = `${atlas.id}:${atlas.frames.length}`;
    if (grid.dataset.atlasKey === atlasKey && grid.children.length > 0) {
      return;
    }
    grid.dataset.atlasKey = atlasKey;
    grid.innerHTML = '';

    for (const frame of atlas.frames) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'facet-atlas-tile-btn';
      btn.dataset.frameId = frame.id;
      btn.title = `${frame.name} (U: ${frame.uMin.toFixed(2)}..${frame.uMax.toFixed(2)}, V: ${frame.vMin.toFixed(2)}..${frame.vMax.toFixed(2)})`;

      const thumbUrl =
        frame.thumbnailDataUrl ||
        this.app.service.textureAtlasManager.extractFrameDataUrl(atlas.id, frame.id);
      if (thumbUrl) {
        const img = document.createElement('img');
        img.src = thumbUrl;
        img.alt = frame.name;
        btn.appendChild(img);
      }

      const label = document.createElement('span');
      label.textContent = frame.name;
      btn.appendChild(label);

      btn.addEventListener('click', () => {
        const assignMat = !!this.app.getElement<HTMLInputElement>('chkFacetAtlasAssignMat')?.checked;
        this.app.service.assignAtlasTileToSelectedFacet(atlas.id, frame.id, assignMat);
      });

      grid.appendChild(btn);
    }
  }

  public updateFacetSurfaceUI(): void {
    const chkSingleTri = this.app.getElement<HTMLInputElement>('chkFacetSingleTri');
    if (chkSingleTri) {
      chkSingleTri.checked = this.app.service.facetSingleTriangleMode;
    }

    const matInfo = this.app.service.getSelectedFacetMaterialInfo();
    const uvInfo = this.app.service.getSelectedFacetUVInfo();
    const hasFace = !!matInfo || !!uvInfo;

    const matBadge = this.app.getElement<HTMLElement>('facetMaterialBadge');
    if (matBadge) {
      matBadge.textContent = matInfo ? `Mat: ${matInfo.materialName}` : 'Mat: -';
      matBadge.title = matInfo ? `Active material: ${matInfo.materialName}` : 'No face picked';
    }

    const uvStatus = this.app.getElement<HTMLElement>('facetUVStatus');
    if (uvStatus) {
      uvStatus.textContent = uvInfo
        ? uvInfo.isQuad
          ? 'Quad (4 corners)'
          : 'Tri (3 corners)'
        : 'No face';
    }

    const slotInfo = this.app.getElement<HTMLElement>('facetMatSlotInfo');
    if (slotInfo) {
      slotInfo.textContent = matInfo
        ? matInfo.totalSlots > 1
          ? `Slot ${matInfo.materialIndex + 1}/${matInfo.totalSlots} (Multi)`
          : 'Slot 1/1 (Single)'
        : 'No face';
    }

    const actionBtnIds = [
      'btnFacetUVFit',
      'btnFacetUVPlanar',
      'btnFacetUVRot90',
      'btnFacetUVFlipU',
      'btnFacetUVFlipV',
      'btnFacetApplyUVRect',
      'btnFacetApplyCornerUVs',
      'btnFacetAssignMaterial',
      'btnFacetApplyColorMat',
      'btnFacetApplyEmbeddedTex',
      'btnFacetUploadTexture',
    ];
    for (const id of actionBtnIds) {
      const btn = this.app.getElement<HTMLButtonElement>(id);
      if (btn) btn.disabled = !hasFace;
    }

    const activeEl = typeof document !== 'undefined' ? document.activeElement : null;
    const setNumericInput = (id: string, val: number) => {
      const el = this.app.getElement<HTMLInputElement>(id);
      if (!el || activeEl === el) return;
      el.value = Number(val.toFixed(4)).toString();
    };
    setNumericInput('facetUVMinU', uvInfo ? uvInfo.uMin : 0);
    setNumericInput('facetUVMaxU', uvInfo ? uvInfo.uMax : 1);
    setNumericInput('facetUVMinV', uvInfo ? uvInfo.vMin : 0);
    setNumericInput('facetUVMaxV', uvInfo ? uvInfo.vMax : 1);

    const cornerGrid = this.app.getElement<HTMLElement>('facetCornerUVGrid');
    if (cornerGrid && (!activeEl || !cornerGrid.contains(activeEl))) {
      if (!uvInfo || uvInfo.corners.length === 0) {
        cornerGrid.innerHTML = '<div class="tool-sublabel">Pick a face to inspect corner UVs.</div>';
      } else {
        cornerGrid.innerHTML = '';
        uvInfo.corners.forEach((c, idx) => {
          const row = document.createElement('div');
          row.className = 'facet-corner-uv-row';

          const lbl = document.createElement('span');
          lbl.className = 'facet-corner-uv-label';
          lbl.textContent = `C${idx}`;

          const uInput = document.createElement('input');
          uInput.type = 'number';
          uInput.step = '0.05';
          uInput.className = 'tool-input facet-uv-num-input facet-corner-u';
          uInput.value = Number(c.u.toFixed(4)).toString();
          uInput.title = `Corner ${idx} U`;

          const vInput = document.createElement('input');
          vInput.type = 'number';
          vInput.step = '0.05';
          vInput.className = 'tool-input facet-uv-num-input facet-corner-v';
          vInput.value = Number(c.v.toFixed(4)).toString();
          vInput.title = `Corner ${idx} V`;

          row.appendChild(lbl);
          row.appendChild(uInput);
          row.appendChild(vInput);
          cornerGrid.appendChild(row);
        });
      }
    }

    const matSelect = this.app.getElement<HTMLSelectElement>('facetMaterialSelect');
    if (matSelect && activeEl !== matSelect) {
      const editableMats = this.app.service.getSceneEditableMaterials();
      const prevVal = matSelect.value;
      matSelect.innerHTML = '';
      if (editableMats.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = '(No editable materials)';
        matSelect.appendChild(opt);
      } else {
        for (const m of editableMats) {
          const opt = document.createElement('option');
          opt.value = m.id || m.name;
          opt.textContent = m.name || m.id;
          matSelect.appendChild(opt);
        }
        const activeMatKey = matInfo?.material ? matInfo.material.id || matInfo.material.name : '';
        if (
          activeMatKey &&
          editableMats.some((m) => (m.id || m.name) === activeMatKey)
        ) {
          matSelect.value = activeMatKey;
        } else if (prevVal && editableMats.some((m) => (m.id || m.name) === prevVal)) {
          matSelect.value = prevVal;
        }
      }
    }

    const texSelect = this.app.getElement<HTMLSelectElement>('facetEmbeddedTexSelect');
    if (texSelect && activeEl !== texSelect) {
      const standaloneTex = this.app.service.getEmbeddedTexturesInfo().filter((t) => !t.isAtlas);
      const prevTex = texSelect.value;
      texSelect.innerHTML = '';
      if (standaloneTex.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = '(No scene textures)';
        texSelect.appendChild(opt);
      } else {
        for (const tex of standaloneTex) {
          const opt = document.createElement('option');
          opt.value = tex.url;
          opt.textContent = tex.name;
          texSelect.appendChild(opt);
        }
        if (prevTex && standaloneTex.some((t) => t.url === prevTex)) {
          texSelect.value = prevTex;
        }
      }
    }

    const atlasSelect = this.app.getElement<HTMLSelectElement>('facetUVAtlasSelect');
    if (atlasSelect && activeEl !== atlasSelect) {
      const atlases = this.app.service.textureAtlasManager.getAtlases();
      const prevAtlas = atlasSelect.value;
      atlasSelect.innerHTML = '';
      if (atlases.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = '(No texture atlas loaded)';
        atlasSelect.appendChild(opt);
      } else {
        for (const atlas of atlases) {
          const opt = document.createElement('option');
          opt.value = atlas.id;
          opt.textContent = `${atlas.name} (${atlas.frames.length} tiles)`;
          atlasSelect.appendChild(opt);
        }
        if (prevAtlas && atlases.some((a) => a.id === prevAtlas)) {
          atlasSelect.value = prevAtlas;
        }
      }
      this.renderFacetAtlasTileGrid(atlasSelect.value);
    } else {
      this.renderFacetAtlasTileGrid();
    }
  }
}
