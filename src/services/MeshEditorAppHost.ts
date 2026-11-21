import type { Mesh } from '@babylonjs/core';
import type { MeshEditorPlatformAdapter } from '../adapters';
import type { MeshEditorService } from '../MeshEditorService';
import type { MenuItemDefinition, PluginManager } from '../plugin';
import type { ToolInterface } from '../tools';
import type { ScreenshotMode } from '../types';

export type AppLayoutMode = 'floating' | 'stackpanel' | 'dock';

/**
 * Shared host contract exposed by `MeshEditorApp` to its modular UI services.
 * Keeps individual UI services decoupled from the monolithic app class while
 * preserving strict typing for core DOM, service, and cross-panel hooks.
 */
export interface MeshEditorAppHost {
  rootContainer: HTMLElement;
  canvas: HTMLCanvasElement;
  service: MeshEditorService;
  pluginManager: PluginManager;
  adapter: MeshEditorPlatformAdapter;
  layoutMode: AppLayoutMode;
  isStackpanelDrawerCollapsed: boolean;
  readonly editorTools: ToolInterface[];
  readonly dialogIds: string[];

  getElement<T extends HTMLElement = HTMLElement>(id: string): T | null;
  addGlobalListener<K extends keyof WindowEventMap>(
    target: Window,
    type: K,
    listener: (ev: WindowEventMap[K]) => any,
    options?: boolean | AddEventListenerOptions,
  ): void;
  addGlobalListener<K extends keyof DocumentEventMap>(
    target: Document,
    type: K,
    listener: (ev: DocumentEventMap[K]) => any,
    options?: boolean | AddEventListenerOptions,
  ): void;
  addGlobalListener(
    target: EventTarget,
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void;

  showToast(message: string, type?: 'info' | 'success' | 'warning' | 'error'): void;
  setStatus(message: string, isBusy?: boolean): void;
  refreshIcons(root?: HTMLElement): void;
  focusCanvasIfIdle(): void;
  toggleApiKeyVisibility(input: HTMLInputElement | null, button?: HTMLButtonElement | null): void;
  triggerDownloadBlob(blob: Blob, filename: string): void;

  // Loaders & AI generation state
  showSceneLoader(title: string, sub?: string, options?: { topHud?: boolean; showStop?: boolean } | boolean): void;
  hideSceneLoader(immediate?: boolean): void;
  setAIGeneratingState(isGenerating: boolean, statusTitle?: string, statusSub?: string): void;
  stopAIGeneration(): void;

  // Tools & Dialog / Layout coordination
  getToolByDialogId(dialogId: string): ToolInterface | undefined;
  getToolByName(name: string): ToolInterface | undefined;
  isDialogOpen(dialogId: string): boolean;
  isSidebarLayoutMode(): boolean;
  toggleDialog(id: string, forceOpen?: boolean): void;
  toggleDialogMinimize(dialog: HTMLElement, forceMinimize?: boolean): void;
  bringDialogToFront(activeDialog: HTMLElement): void;
  closeAllDropdowns(options?: { restoreFocusTarget?: HTMLElement | null; fromPointer?: boolean }): void;
  updatePanelButtonStates(): void;
  activateExclusive3DTool(toolName: string): void;
  deactivateOtherExclusiveTools(exceptToolName?: string): void;
  setLayoutMode(mode: AppLayoutMode, save?: boolean): void;
  renderDockToolbar(): void;
  saveDialogLayout(): void;
  restoreDialogLayout(): void;
  toggleStackpanelDrawer(forceCollapse?: boolean): void;
  toggleFullscreen(): Promise<void>;
  updateFullscreenButtonState(): void;
  isFullscreenActive(): boolean;

  // Cross-panel UI refresh hooks
  updateOutliner(): void;
  updateSceneGUI(): void;
  updateMeshGUI(): void;
  updateMaterialGUI(): void;
  updateCSGGUI(): void;
  updateUVGUI(): void;
  updateFacetPickUI(): void;
  updateFacetSurfaceUI(): void;
  updateTouchViewportControls(): void;
  renderEmbeddedTextures(): void;
  renderActiveMaterialTextures(): void;
  renderAtlasTilePicker(atlasId: string): void;
  renderVoxelPalette(): void;
  renderVoxelTextureGallery(): void;
  renderPathExtrusionUI(): void;
  updateCompressModelUI(): void;
  updateSculptUI(): void;
  updateUVUnwrapUI(): void;
  updateBakingUI(): void;
  updateRiggingUI(): void;
  updateAITextureUI(): void;
  updateTextMeshUI(): void;
  updateDecalUI(): void;
  updateTexturePaintUI(): void;
  updateTexturePaintStencilOverlay(): void;
  updateHeightmapUI(): void;
  openHeightmapPaintModal(initialTab?: 'height' | 'mix'): void;
  renderToolsMenu(): void;
  refreshAIEndpointBadge(): void;
  renderAISkills(): void;
  renderAIToolSet(): void;
  setupAnimations(names: string[], currentGroup: any | null): void;

  // Modal & File triggers
  openSettingsModal(initialTab?: 'editing' | 'ai', options?: any): void;
  closeSettingsModal(): void;
  switchSettingsTab(tab: 'editing' | 'ai'): void;
  openExportDialog(): void;
  closeExportDialog(): void;
  saveBabylonScene(): void;
  openScreenshotDialog(): void;
  closeScreenshotDialog(): void;
  setScreenshotMode(mode: ScreenshotMode): void;
  openHelpModal(): void;
  closeHelpModal(): void;
  openAboutModal(): void;
  closeAboutModal(): void;
  showToolHelp(toolOrId: string | ToolInterface): void;
  showPromptHelp(initialTab?: 'guide' | 'tools' | 'examples'): void;
  hidePromptHelp(): void;
  triggerOpenModel(): void;
  triggerImportModel(): void;
  triggerReplaceTexture(): void;
  triggerReplaceBumpTexture(): void;
  registerToolMenuItem(item: MenuItemDefinition): void;

  // Dynamic access for internal coordination when migrating incrementally
  [key: string]: any;
}
