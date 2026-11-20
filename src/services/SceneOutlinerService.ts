import { Material, Mesh, Node, TransformNode } from '@babylonjs/core';
import type { MeshEditorAppHost } from './MeshEditorAppHost';

export class SceneOutlinerService {
  public searchFilter: string = '';
  public collapsedNodeIds: Set<string> = new Set<string>();

  constructor(private readonly app: MeshEditorAppHost) {}

  public setSearchFilter(value: string): void {
    this.searchFilter = value;
    this.updateOutliner();
  }

  public updateOutliner(): void {
    if (!this.app.outlinerTreeContainer) return;
    const prevScrollTop = this.app.outlinerTreeContainer.scrollTop;
    this.app.outlinerTreeContainer.innerHTML = '';

    const filter = this.searchFilter.toLowerCase().trim();

    const isValidSceneNode = (n: any): boolean => {
      if (!n || n.isDisposed()) return false;
      if (typeof n.isEnabled === 'function' && !n.isEnabled()) return false;
      if (this.app.service.isEditorHelper(n)) return false;
      const className = n.getClassName ? n.getClassName() : '';
      if (className.includes('Camera') || className.includes('Light')) return false;
      return true;
    };

    const getLogicalParent = (n: Node): Node | null => {
      if (this.app.service.selectionProxyActive && n.parent === this.app.service.selectionProxyNode) {
        return (this.app.service as any).selectionProxyMap?.get(n) || null;
      }
      const p = n.parent;
      if (!p || !isValidSceneNode(p)) return null;
      return p;
    };

    const getLogicalChildren = (parent: Node): (TransformNode | Mesh)[] => {
      const children: (TransformNode | Mesh)[] = [];
      const rawChildren = parent.getChildren ? parent.getChildren() : [];
      for (const c of rawChildren) {
        if (isValidSceneNode(c) && !children.includes(c as any)) {
          children.push(c as any);
        }
      }
      if (this.app.service.selectionProxyActive) {
        const map = (this.app.service as any).selectionProxyMap as Map<any, any>;
        if (map) {
          for (const [proxiedNode, origParent] of map.entries()) {
            if (origParent === parent && isValidSceneNode(proxiedNode) && !children.includes(proxiedNode)) {
              children.push(proxiedNode);
            }
          }
        }
      }
      return children;
    };

    // Gather all potential scene nodes
    const candidateNodes = new Set<Node>();
    for (const n of this.app.service.scene.rootNodes) {
      if (isValidSceneNode(n)) candidateNodes.add(n);
    }
    for (const m of this.app.service.importedMeshes) {
      if (isValidSceneNode(m)) candidateNodes.add(m);
    }
    for (const g of this.app.service.groups) {
      if (isValidSceneNode(g)) candidateNodes.add(g);
    }
    for (const tn of this.app.service.scene.transformNodes) {
      if (isValidSceneNode(tn)) candidateNodes.add(tn);
    }
    for (const m of this.app.service.scene.meshes) {
      if (isValidSceneNode(m)) candidateNodes.add(m);
    }

    if (candidateNodes.size === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.style.padding = '18px 12px';
      emptyMsg.style.textAlign = 'center';
      emptyMsg.style.color = 'var(--text-secondary)';
      emptyMsg.style.fontSize = '12px';
      emptyMsg.innerHTML =
        'No objects in the scene.<br><span style="font-size:11px; opacity:0.8;">Click "File > Open" or "Tools > Create".</span>';
      this.app.outlinerTreeContainer.appendChild(emptyMsg);
      return;
    }

    // Determine root nodes (nodes whose logical parent is not another valid candidate node)
    const rootNodes: Node[] = [];
    for (const n of candidateNodes) {
      const p = getLogicalParent(n);
      if (!p || !candidateNodes.has(p)) {
        if (!rootNodes.includes(n)) rootNodes.push(n);
      }
    }

    const nodeMatchesFilter = (n: Node): boolean => {
      if (!filter) return true;
      if ((n.name || '').toLowerCase().includes(filter)) return true;
      const children = getLogicalChildren(n);
      return children.some((c) => nodeMatchesFilter(c));
    };

    const renderedNodes = new Set<Node>();

    const renderNode = (node: Node, depth: number, parentElement: HTMLElement) => {
      if (renderedNodes.has(node)) return;
      renderedNodes.add(node);

      if (filter && !nodeMatchesFilter(node)) {
        return;
      }

      const children = getLogicalChildren(node);
      const hasChildren = children.length > 0;
      const isGroup = this.app.service.isGroupNode(node);
      const isSelected = this.app.service.selectedNodes.includes(node as any) || this.app.service.selectedMesh === node;

      const isForcedOpen = filter.length > 0;
      const isCollapsed = !isForcedOpen && this.collapsedNodeIds.has(node.uniqueId.toString());
      const isExpanded = !isCollapsed;

      const row = document.createElement('div');
      row.className = `outliner-item ${isSelected ? 'selected' : ''} ${isGroup ? 'outliner-item-group' : ''}`;
      row.style.paddingLeft = `${6 + depth * 14}px`;

      const left = document.createElement('div');
      left.className = 'outliner-item-left';

      // Chevron or spacer
      if (hasChildren) {
        const chevron = document.createElement('span');
        chevron.className = 'outliner-chevron';
        chevron.title = isExpanded ? 'Collapse' : 'Expand';
        chevron.innerHTML = `<i class="app-icon" data-lucide="${isExpanded ? 'chevron-down' : 'chevron-right'}"></i>`;
        chevron.addEventListener('click', (e) => {
          e.stopPropagation();
          const idStr = node.uniqueId.toString();
          if (this.collapsedNodeIds.has(idStr)) {
            this.collapsedNodeIds.delete(idStr);
          } else {
            this.collapsedNodeIds.add(idStr);
          }
          this.updateOutliner();
        });
        left.appendChild(chevron);
      } else {
        const spacer = document.createElement('span');
        spacer.className = 'outliner-chevron-spacer';
        left.appendChild(spacer);
      }

      // Icon
      const icon = document.createElement('span');
      icon.className = 'outliner-item-icon';
      let iconName = 'box';
      if (isGroup) {
        iconName = 'folder';
      } else if (node instanceof Mesh) {
        iconName = node.getTotalVertices() > 0 ? 'box' : 'box-select';
      } else {
        iconName = 'network';
      }
      icon.innerHTML = `<i class="app-icon" data-lucide="${iconName}"></i>`;
      left.appendChild(icon);

      // Name
      const name = document.createElement('span');
      name.className = 'outliner-item-name';
      name.textContent = node.name || 'Unnamed';
      name.title = node.name || '';
      left.appendChild(name);

      // Badges
      if (node instanceof Mesh && node.getTotalVertices() > 0) {
        const polyCount = Math.floor(node.getTotalIndices() / 3);
        const badge = document.createElement('span');
        badge.className = 'outliner-badge';
        badge.textContent = `${polyCount} Tris`;
        left.appendChild(badge);
      }
      if (hasChildren) {
        const childBadge = document.createElement('span');
        childBadge.className = 'outliner-badge';
        childBadge.textContent = `${children.length} ${children.length === 1 ? 'item' : 'items'}`;
        left.appendChild(childBadge);
      }

      row.appendChild(left);

      // Actions
      const actions = document.createElement('div');
      actions.className = 'outliner-item-actions';

      const descMeshes = this.app.service.collectNodeAndDescendants(node as any).meshes;

      // 1. Visibility toggle
      const btnVis = document.createElement('button');
      btnVis.className = 'outliner-btn outliner-btn-mutate';
      const isCurrentlyVisible = (): boolean =>
        node instanceof Mesh ? node.isVisible : descMeshes.some((m) => m.isVisible);
      const isVis = isCurrentlyVisible();
      btnVis.innerHTML = `<i class="app-icon" data-lucide="${isVis ? 'eye' : 'eye-off'}"></i>`;
      btnVis.title = 'Toggle visibility';
      btnVis.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.app.isAIGenerating) return;
        const nextVis = !isCurrentlyVisible();
        const targets: Mesh[] = [];
        if (node instanceof Mesh) targets.push(node);
        for (const m of descMeshes) {
          if (!targets.includes(m)) targets.push(m);
        }
        const beforeStates = targets.map((m) => ({ mesh: m, visible: m.isVisible }));
        for (const m of targets) {
          m.isVisible = nextVis;
        }
        if (targets.length > 0) {
          this.app.service.recordAction({
            name: `${nextVis ? 'Show' : 'Hide'} "${node.name}"`,
            undo: () => {
              for (const s of beforeStates) {
                if (!s.mesh.isDisposed()) s.mesh.isVisible = s.visible;
              }
            },
            redo: () => {
              for (const s of beforeStates) {
                if (!s.mesh.isDisposed()) s.mesh.isVisible = nextVis;
              }
            },
          });
        }
        this.app.service.events.onSceneModified?.();
      });
      actions.appendChild(btnVis);

      // 2. Focus / Center
      const btnCenter = document.createElement('button');
      btnCenter.className = 'outliner-btn';
      btnCenter.innerHTML = '<i class="app-icon" data-lucide="target"></i>';
      btnCenter.title = 'Center camera on selection';
      btnCenter.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!this.app.isAIGenerating) {
          this.app.service.selectNodes([node as any]);
        }
        this.app.service.focusOnTarget(node as any);
        this.app.showToast(`Centered on "${node.name}"`, 'success');
      });
      actions.appendChild(btnCenter);

      // 3. Wireframe
      const checkIsWire = (): boolean =>
        node instanceof Mesh
          ? this.app.service.isMeshWireframe(node)
          : descMeshes.length > 0 && descMeshes.every((m) => this.app.service.isMeshWireframe(m));
      const isWire = checkIsWire();
      const btnWire = document.createElement('button');
      btnWire.className = `outliner-btn outliner-btn-mutate ${isWire ? 'active' : ''}`;
      btnWire.innerHTML = '<i class="app-icon" data-lucide="scan"></i>';
      btnWire.title = 'Toggle wireframe';
      btnWire.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.app.isAIGenerating) return;
        if (node instanceof Mesh) {
          const state = this.app.service.toggleMeshWireframe(node);
          this.app.showToast(`Wireframe ${state ? 'enabled' : 'disabled'} for "${node.name}"`, 'info');
        } else {
          const nextState = !checkIsWire();
          const entries = descMeshes.map((m) => ({
            mesh: m,
            prevMat: m.material,
            prevWire: this.app.service.isMeshWireframe(m),
            nextMat: m.material as Material | null,
          }));
          this.app.service.runWithoutRecording(() => {
            for (const entry of entries) {
              this.app.service.setMeshWireframe(entry.mesh, nextState);
              entry.nextMat = entry.mesh.material;
            }
          });
          if (entries.length > 0) {
            this.app.service.recordAction({
              name: `${nextState ? 'Enable' : 'Disable'} Wireframe "${node.name}"`,
              undo: () => {
                for (const entry of entries) {
                  if (entry.mesh.isDisposed()) continue;
                  entry.mesh.material = entry.prevMat;
                  if (entry.prevMat) (entry.prevMat as any).wireframe = entry.prevWire;
                }
              },
              redo: () => {
                for (const entry of entries) {
                  if (entry.mesh.isDisposed()) continue;
                  entry.mesh.material = entry.nextMat;
                  if (entry.nextMat) (entry.nextMat as any).wireframe = nextState;
                }
              },
            });
          }
          this.app.showToast(`Wireframe ${nextState ? 'enabled' : 'disabled'} for "${node.name}"`, 'info');
        }
        this.updateOutliner();
      });
      actions.appendChild(btnWire);

      // 4. Ungroup (if isGroup)
      if (isGroup) {
        const btnUngroup = document.createElement('button');
        btnUngroup.className = 'outliner-btn outliner-btn-mutate';
        btnUngroup.innerHTML = '<i class="app-icon" data-lucide="folder-minus"></i>';
        btnUngroup.title = 'Ungroup meshes';
        btnUngroup.addEventListener('click', (e) => {
          e.stopPropagation();
          if (this.app.isAIGenerating) return;
          this.app.service.selectNodes([node as any]);
          this.app.service.ungroupSelected();
        });
        actions.appendChild(btnUngroup);
      }

      // 5. Delete (deletes node and all its children)
      const btnDel = document.createElement('button');
      btnDel.className = 'outliner-btn outliner-btn-mutate';
      btnDel.innerHTML = '<i class="app-icon" data-lucide="trash-2"></i>';
      btnDel.title = hasChildren ? 'Delete object and children' : 'Delete object';
      btnDel.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.app.isAIGenerating) return;
        this.app.service.selectNodes([node as any]);
        this.app.service.deleteSelected();
      });
      actions.appendChild(btnDel);

      row.appendChild(actions);

      row.addEventListener('click', (e: MouseEvent) => {
        if (this.app.isAIGenerating) return;
        if (e.metaKey || e.ctrlKey || this.app.service.touchMultiSelectActive) {
          this.app.service.toggleNodeSelection(node as any);
        } else if (e.shiftKey) {
          this.app.service.rangeSelectNodes(node as any);
        } else {
          this.app.service.selectNodes([node as any]);
        }
      });

      row.addEventListener('dblclick', () => {
        this.app.service.focusOnTarget(node as any);
      });

      parentElement.appendChild(row);

      // If expanded, render children recursively
      if (hasChildren && isExpanded) {
        for (const child of children) {
          renderNode(child, depth + 1, parentElement);
        }
      }
    };

    for (const root of rootNodes) {
      renderNode(root, 0, this.app.outlinerTreeContainer);
    }

    this.app.refreshIcons();
    this.app.outlinerTreeContainer.scrollTop = prevScrollTop;
  }
}
