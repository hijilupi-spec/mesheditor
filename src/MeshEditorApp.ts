import { Engine } from '@babylonjs/core';
import { createDefaultPlatformAdapter, MeshEditorPlatformAdapter } from './adapters';
import { MeshEditorService } from './MeshEditorService';
import { MenuItemDefinition, MeshEditorPlugin, PluginManager, ToolbarButtonDefinition } from './plugin';
import { ensureMeshEditorStyles } from './styles';
import { getMeshEditorTemplate } from './template';
import {
  MeshEditorServiceEvents,
  PrimitiveShape,
  ScreenshotMode,
} from './types';
import {
  getBuiltinEditorTools,
  ToolInterface,
} from './tools';
import { AIQuickPrompt } from './tools/editor/aiQuickPrompts';
import {
  initTexturePaintDialogUI,
  updateTexturePaintDialogUI,
  updateTexturePaintStencilOverlayUI,
} from './painting/TexturePaintUI';
import { TooltipManager } from './utils/TooltipManager';
import { renderEditorIcons } from './utils/editorIcons';
import {
  AIAgentUIService,
  DEFAULT_MESH_EDITOR_SETTINGS,
  EmbeddedTextureUIService,
  ExportAndScreenshotService,
  FacetEditorUIService,
  HelpModalService,
  InputAndFileService,
  InspectorGuiService,
  MeshEditorAppHost,
  MeshEditorSettings,
  ModelingPanelUIService,
  SceneOutlinerService,
  SETTINGS_STORAGE_KEY,
  SettingsUIService,
  ToolsMenuService,
  WindowLayoutService,
} from './services';
import { SculptUIService } from './sculpting/SculptUIService';
import { UVUnwrapUIService } from './uv/UVUnwrapUIService';
import { BakingUIService } from './baking/BakingUIService';
import { RiggingUIService } from './rigging/RiggingUIService';
import { AITextureUIService } from './textures/AITextureUIService';
import { TextMeshUIService } from './textMesh/TextMeshUIService';
import { DecalUIService } from './decals/DecalUIService';
import { HeightmapUIService } from './heightmap/HeightmapUIService';
import { GaussianSplatUIService } from './splatting/GaussianSplatUIService';
import { VoxelPainterUIService } from './voxel/VoxelPainterUIService';
import { PathExtrusionUIService } from './pathExtrusion/PathExtrusionUIService';
import { CompressModelUIService } from './compression/CompressModelUIService';

export { DEFAULT_MESH_EDITOR_SETTINGS, MeshEditorSettings, SETTINGS_STORAGE_KEY };

export type LayoutMode = 'floating' | 'stackpanel' | 'dock';

export interface MeshEditorAppOptions {
  /**
   * Optional DOM container element (or selector) to mount the Mesh Editor into.
   * If omitted, uses the existing `#app-container` / `#renderCanvas` in the document,
   * or creates a container in `document.body`.
   */
  container?: HTMLElement | string;

  /**
   * Optional Platform Adapter (e.g. `BrowserPlatformAdapter`, `ElectronPlatformAdapter`, `HostAppAdapter`).
   * If omitted, automatically detects Electron vs. Browser.
   */
  adapter?: MeshEditorPlatformAdapter;

  /**
   * Optional initial layout mode ('floating' | 'stackpanel' | 'dock').
   */
  layoutMode?: LayoutMode;

  /**
   * Optional initial 3D model URL to load upon startup.
   */
  autoLoadUrl?: string;

  /**
   * Optional additional service event callbacks (e.g. used by `<mesh-editor>` Web Component).
   */
  events?: MeshEditorServiceEvents;

  /**
   * Optional custom Babylon Engine instance (e.g. `NullEngine` for headless integration testing).
   */
  engine?: Engine;

  /**
   * Whether the Help Assistant should open automatically when the user has never seen it before.
   * Defaults to true.
   */
  autoShowHelpOnFirstVisit?: boolean;
}

export class MeshEditorApp {
  public rootContainer: HTMLElement;
  public canvas: HTMLCanvasElement;
  public service: MeshEditorService;
  public pluginManager: PluginManager;
  public adapter: MeshEditorPlatformAdapter;

  // UI DOM Elements
  private toastElement: HTMLElement;
  private toastIcon: HTMLElement;
  private toastText: HTMLElement;
  private statusText: HTMLElement;
  private statusIndicator: HTMLElement;
  private statsMeshes: HTMLElement;
  private statsPolys: HTMLElement;

  public outlinerTreeContainer: HTMLElement;
  public outlinerSearchInput: HTMLInputElement;

  // File Inputs
  public modelFileInput: HTMLInputElement;
  public importFileInput: HTMLInputElement;
  public textureFileInput: HTMLInputElement;
  public bumpFileInput: HTMLInputElement;

  // Layout Mode & Tooltips
  public layoutMode: LayoutMode = 'dock';
  public isStackpanelDrawerCollapsed: boolean = false;
  private tooltipManager: TooltipManager | null = null;

  // Core App UI Services
  public readonly settingsUI: SettingsUIService = new SettingsUIService(this as unknown as MeshEditorAppHost);
  public readonly inspectorGui: InspectorGuiService = new InspectorGuiService(this as unknown as MeshEditorAppHost);
  public readonly toolsMenu: ToolsMenuService = new ToolsMenuService(this as unknown as MeshEditorAppHost);
  public readonly aiAgentUI: AIAgentUIService = new AIAgentUIService(this as unknown as MeshEditorAppHost);
  public readonly windowLayout: WindowLayoutService = new WindowLayoutService(this as unknown as MeshEditorAppHost);
  public readonly helpModals: HelpModalService = new HelpModalService(this as unknown as MeshEditorAppHost);
  public readonly embeddedTexturesUI: EmbeddedTextureUIService = new EmbeddedTextureUIService(this as unknown as MeshEditorAppHost);
  public readonly facetEditorUI: FacetEditorUIService = new FacetEditorUIService(this as unknown as MeshEditorAppHost);
  public readonly exportAndScreenshot: ExportAndScreenshotService = new ExportAndScreenshotService(this as unknown as MeshEditorAppHost);
  public readonly sceneOutliner: SceneOutlinerService = new SceneOutlinerService(this as unknown as MeshEditorAppHost);
  public readonly inputAndFiles: InputAndFileService = new InputAndFileService(this as unknown as MeshEditorAppHost);
  public readonly modelingPanelsUI: ModelingPanelUIService = new ModelingPanelUIService(this as unknown as MeshEditorAppHost);

  // Feature UI Services
  public readonly sculptUI: SculptUIService = new SculptUIService(this as unknown as MeshEditorAppHost);
  public readonly uvUnwrapUI: UVUnwrapUIService = new UVUnwrapUIService(this as unknown as MeshEditorAppHost);
  public readonly bakingUI: BakingUIService = new BakingUIService(this as unknown as MeshEditorAppHost);
  public readonly riggingUI: RiggingUIService = new RiggingUIService(this as unknown as MeshEditorAppHost);
  public readonly aiTextureUI: AITextureUIService = new AITextureUIService(this as unknown as MeshEditorAppHost);
  public readonly textMeshUI: TextMeshUIService = new TextMeshUIService(this as unknown as MeshEditorAppHost);
  public readonly decalUI: DecalUIService = new DecalUIService(this as unknown as MeshEditorAppHost);
  public readonly heightmapUI: HeightmapUIService = new HeightmapUIService(this as unknown as MeshEditorAppHost);
  public readonly gaussianSplatUI: GaussianSplatUIService = new GaussianSplatUIService(this as unknown as MeshEditorAppHost);
  public readonly voxelPainterUI: VoxelPainterUIService = new VoxelPainterUIService(this as unknown as MeshEditorAppHost);
  public readonly pathExtrusionUI: PathExtrusionUIService = new PathExtrusionUIService(this as unknown as MeshEditorAppHost);
  public readonly compressModelUI: CompressModelUIService = new CompressModelUIService(this as unknown as MeshEditorAppHost);

  // Backwards-compatible accessors to service-owned state
  public get compressLoadedFile(): File | null {
    return this.compressModelUI.compressLoadedFile;
  }
  public set compressLoadedFile(file: File | null) {
    this.compressModelUI.compressLoadedFile = file;
  }
  public get compressLoadedFiles(): File[] {
    return this.compressModelUI.compressLoadedFiles;
  }
  public set compressLoadedFiles(files: File[]) {
    this.compressModelUI.compressLoadedFiles = files;
  }
  public get uvControllers() {
    return this.inspectorGui.uvControllers;
  }
  public get uvParams() {
    return this.inspectorGui.uvParams;
  }
  public get csgControllers() {
    return this.inspectorGui.csgControllers;
  }
  public get csgParams() {
    return this.inspectorGui.csgParams;
  }
  public get createControllers() {
    return this.inspectorGui.createControllers;
  }
  public get createParams() {
    return this.inspectorGui.createParams;
  }
  public get animControllers() {
    return this.inspectorGui.animControllers;
  }
  public get animParams() {
    return this.inspectorGui.animParams;
  }
  public get facetParams() {
    return this.inspectorGui.facetParams;
  }
  public get textureControllers() {
    return this.inspectorGui.textureControllers;
  }
  public get textureParams() {
    return this.inspectorGui.textureParams;
  }
  public get isDraggingGuiSlider(): boolean {
    return this.inspectorGui.isDraggingGuiSlider;
  }
  public get isAIGenerating(): boolean {
    return this.aiAgentUI.isAIGenerating;
  }
  public get syncAIAgentImageGenUI(): (() => void) | null {
    return this.aiAgentUI.syncAIAgentImageGenUI;
  }
  public set syncAIAgentImageGenUI(fn: (() => void) | null) {
    this.aiAgentUI.syncAIAgentImageGenUI = fn;
  }
  public get syncAISettingsControlsUI(): (() => void) | null {
    return this.settingsUI.syncAISettingsControlsUI;
  }
  public set syncAISettingsControlsUI(fn: (() => void) | null) {
    this.settingsUI.syncAISettingsControlsUI = fn;
  }

  // Loading Animation Elements & Timers
  private startupLoaderElement: HTMLElement | null = null;
  private startupLoaderText: HTMLElement | null = null;
  private startupLoaderBar: HTMLElement | null = null;
  private sceneLoaderElement: HTMLElement | null = null;
  private sceneLoaderTitle: HTMLElement | null = null;
  private sceneLoaderSub: HTMLElement | null = null;
  private sceneLoaderStopBtn: HTMLButtonElement | null = null;
  private startupTimerIds: Array<ReturnType<typeof setTimeout>> = [];
  private sceneLoaderTimerId: ReturnType<typeof setTimeout> | null = null;
  private refreshIconTimerIds: Array<ReturnType<typeof setTimeout>> = [];
  private toastTimerId: ReturnType<typeof setTimeout> | null = null;
  private initialFocusRafId: number | null = null;
  private isDisposed: boolean = false;
  private autoShowHelpOnFirstVisit: boolean = true;
  private globalListenerCleanups: Array<() => void> = [];
  public lastEscapeClosedOverlayEvent: KeyboardEvent | null = null;
  public isTogglingToolFromMenu: boolean = false;

  // Built-in Editor Tools & Abstracted Dialog IDs
  public readonly editorTools: ToolInterface[] = getBuiltinEditorTools();

  public get dialogIds(): string[] {
    return this.editorTools.filter((t) => !!t.dialogId).map((t) => t.dialogId!);
  }

  public getToolByDialogId(dialogId: string): ToolInterface | undefined {
    return this.editorTools.find((t) => t.dialogId === dialogId);
  }

  public getToolByName(name: string): ToolInterface | undefined {
    return this.editorTools.find((t) => t.name === name);
  }

  public isDialogOpen(dialogId: string): boolean {
    return this.windowLayout.isDialogOpen(dialogId);
  }

  constructor(options: MeshEditorAppOptions = {}) {
    // Resolve or create the root container
    let targetContainer: HTMLElement | null = null;
    if (typeof options.container === 'string') {
      targetContainer = document.querySelector(options.container) as HTMLElement;
    } else if (options.container instanceof HTMLElement) {
      targetContainer = options.container;
    }

    if (targetContainer) {
      ensureMeshEditorStyles(targetContainer.getRootNode() as Document | ShadowRoot);
      const existingCanvas = targetContainer.querySelector('#renderCanvas') as HTMLCanvasElement | null;
      if (!existingCanvas) {
        if (targetContainer.id === 'app-container') {
          targetContainer.innerHTML = getMeshEditorTemplate();
          this.rootContainer = targetContainer;
        } else {
          const appContainer = document.createElement('div');
          appContainer.id = 'app-container';
          appContainer.innerHTML = getMeshEditorTemplate();
          targetContainer.appendChild(appContainer);
          this.rootContainer = appContainer;
        }
      } else {
        this.rootContainer = (targetContainer.querySelector('#app-container') as HTMLElement) || targetContainer;
      }
    } else {
      const existingCanvas = document.getElementById('renderCanvas') as HTMLCanvasElement | null;
      if (!existingCanvas && typeof document !== 'undefined' && document.body) {
        ensureMeshEditorStyles(document);
        const appContainer = document.createElement('div');
        appContainer.id = 'app-container';
        appContainer.innerHTML = getMeshEditorTemplate();
        document.body.appendChild(appContainer);
        this.rootContainer = appContainer;
      } else {
        this.rootContainer = document.getElementById('app-container') || document.body;
      }
    }

    this.canvas = this.getElement<HTMLCanvasElement>('renderCanvas')!;
    if (!this.canvas) {
      throw new Error('Canvas element #renderCanvas not found in DOM.');
    }

    this.toastElement = this.getElement<HTMLElement>('toast')!;
    this.toastIcon = this.getElement<HTMLElement>('toastIcon')!;
    this.toastText = this.getElement<HTMLElement>('toastText')!;
    this.statusText = this.getElement<HTMLElement>('statusText')!;
    this.statusIndicator = this.getElement<HTMLElement>('statusIndicator')!;
    this.statsMeshes = this.getElement<HTMLElement>('statsMeshes')!;
    this.statsPolys = this.getElement<HTMLElement>('statsPolys')!;

    this.outlinerTreeContainer = this.getElement<HTMLElement>('outlinerTreeContainer')!;
    this.outlinerSearchInput = (this.getElement<HTMLInputElement>('outlinerSearch') ||
      this.getElement<HTMLInputElement>('outlinerSearchInput'))!;

    this.modelFileInput = this.getElement<HTMLInputElement>('modelFileInput')!;
    this.importFileInput = this.getElement<HTMLInputElement>('importFileInput')!;
    this.textureFileInput = this.getElement<HTMLInputElement>('textureFileInput')!;
    this.bumpFileInput = this.getElement<HTMLInputElement>('bumpFileInput')!;

    this.startupLoaderElement = this.getElement<HTMLElement>('appStartupLoader');
    this.startupLoaderText = this.getElement<HTMLElement>('startupLoaderText');
    this.startupLoaderBar = this.getElement<HTMLElement>('startupLoaderBar');
    this.sceneLoaderElement = this.getElement<HTMLElement>('sceneInitLoader');
    this.sceneLoaderTitle = this.getElement<HTMLElement>('sceneLoaderTitle');
    this.sceneLoaderSub = this.getElement<HTMLElement>('sceneLoaderSub');
    this.sceneLoaderStopBtn = this.getElement<HTMLButtonElement>('btnSceneLoaderStop');
    this.sceneLoaderStopBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.stopAIGeneration();
    });

    this.autoShowHelpOnFirstVisit = options.autoShowHelpOnFirstVisit ?? true;

    this.setStartupProgress(35, 'Initializing Babylon 3D Engine...');
    this.showSceneLoader('Initializing Babylon 3D Scene...', 'WEBGL2 ENGINE • SHADER PIPELINE • MESH GEOMETRY');

    // Initialize Platform Adapter
    this.adapter = options.adapter || createDefaultPlatformAdapter();

    // Initialize 3D Core Service
    this.service = new MeshEditorService(this.canvas, {
      onSelectionChanged: (nodes, activeMesh, subMeshId) => {
        this.updateMeshGUI();
        this.updateMaterialGUI();
        this.updateFacetSurfaceUI();
        this.updateOutliner();
        this.updateCSGGUI();
        this.updateSculptUI();
        this.updateUVUnwrapUI();
        this.updateBakingUI();
        this.updateRiggingUI();
        this.updateAITextureUI();
        this.updateTextMeshUI();
        this.updateDecalUI();
        this.updateTexturePaintUI();
        this.updateHeightmapUI();
        this.updateGaussianSplatUI();
        const statsSelection = this.getElement<HTMLElement>('statsSelection');
        if (statsSelection) {
          statsSelection.textContent = activeMesh
            ? activeMesh.name
            : nodes.length > 0
              ? `${nodes.length} objects`
              : 'None';
        }
        options.events?.onSelectionChanged?.(nodes, activeMesh, subMeshId);
      },
      onSceneModified: () => {
        this.updateOutliner();
        if (!this.isDraggingGuiSlider) {
          this.updateSceneGUI();
          this.updateMeshGUI();
          this.updateMaterialGUI();
        }
        this.updateFacetSurfaceUI();
        this.updateCSGGUI();
        this.updateSculptUI();
        this.updateUVUnwrapUI();
        this.updateBakingUI();
        this.updateRiggingUI();
        this.updateAITextureUI();
        this.updateTextMeshUI();
        this.updateDecalUI();
        this.updateTexturePaintUI();
        this.updateHeightmapUI();
        this.updateGaussianSplatUI();
        this.renderPathExtrusionUI();
        const statsSelection = this.getElement<HTMLElement>('statsSelection');
        if (statsSelection) {
          const activeMesh = this.service.selectedMesh;
          const nodes = this.service.selectedNodes;
          statsSelection.textContent = activeMesh
            ? activeMesh.name
            : nodes.length > 0
              ? `${nodes.length} objects`
              : 'None';
        }
        options.events?.onSceneModified?.();
      },
      onHistoryChanged: (canUndo, canRedo) => {
        const btnUndo = this.getElement<HTMLButtonElement>('btnUndo');
        const btnRedo = this.getElement<HTMLButtonElement>('btnRedo');
        if (btnUndo) btnUndo.disabled = !canUndo;
        if (btnRedo) btnRedo.disabled = !canRedo;
        options.events?.onHistoryChanged?.(canUndo, canRedo);
      },
      onStatusChanged: (text, isBusy) => {
        this.setStatus(text, isBusy);
        options.events?.onStatusChanged?.(text, isBusy);
      },
      onToast: (msg, type) => {
        this.showToast(msg, type);
        options.events?.onToast?.(msg, type);
      },
      onModelLoaded: (filename) => {
        this.updateOutliner();
        this.updateCSGGUI();
        this.renderEmbeddedTextures();
        this.updateDecalUI();
        this.updateTexturePaintUI();
        this.updateHeightmapUI();
        this.updateGaussianSplatUI();
        this.adapter.onModelLoaded?.(filename, this);
        options.events?.onModelLoaded?.(filename);
      },
      onTexturesChanged: () => {
        this.updateMaterialGUI();
        this.updateDecalUI();
        this.updateTexturePaintUI();
        this.updateHeightmapUI();
      },
      onStatsUpdated: (meshCount, polyCount) => {
        if (this.statsMeshes) this.statsMeshes.textContent = meshCount.toString();
        if (this.statsPolys) this.statsPolys.textContent = polyCount.toLocaleString();
        options.events?.onStatsUpdated?.(meshCount, polyCount);
      },
      onAnimationsLoaded: (names, currentGroup) => {
        this.setupAnimations(names, currentGroup);
        options.events?.onAnimationsLoaded?.(names, currentGroup);
      },
      onAnimProgress: (frame) => {
        this.animParams.frame = frame;
        this.animControllers['frame']?.updateDisplay();
        options.events?.onAnimProgress?.(frame);
      },
      onExportModel: async (blob, filename, format) => {
        let handled = false;
        if (this.adapter.saveExportedModel) {
          handled = await this.adapter.saveExportedModel(blob, filename, format, this);
        }
        if (options.events?.onExportModel) {
          const eventHandled = await options.events.onExportModel(blob, filename, format);
          handled = handled || eventHandled;
        }
        return handled;
      },
    }, options.engine);

    // Initialize Plugin Manager
    this.pluginManager = new PluginManager(this, this.service);

    // Load persisted user settings (grid, gridSize, cameraSpeed, move/rotate snap) before initializing UI
    this.loadSettingsFromStorage();

    this.initGUI();
    this.initToolbarAndDialogs();
    this.initFileHandling();
    this.initKeyboardShortcuts();
    this.updateOutliner();

    // Initialize Platform Adapter hooks
    try {
      this.adapter.initialize?.(this);
    } catch (err) {
      console.warn('[MeshEditor] Failed to initialize platform adapter:', err);
    }

    // Set initial layout mode (defaults to Dock)
    const rawSavedLayout = localStorage.getItem('mesheditor_layout_mode');
    const savedLayoutMode: LayoutMode =
      options.layoutMode ||
      (rawSavedLayout === 'floating' || rawSavedLayout === 'stackpanel' || rawSavedLayout === 'dock'
        ? rawSavedLayout
        : 'dock');
    this.setLayoutMode(savedLayoutMode, false);
    this.refreshIcons();

    // Initialize global Tippy.js tooltips across the editor root container
    const tooltipRoot = this.rootContainer || document.body;
    if (tooltipRoot) {
      this.tooltipManager = new TooltipManager(tooltipRoot);
    }

    this.runInitialLoadingSequence(options.autoLoadUrl);

    if (options.autoLoadUrl) {
      this.service.loadFromUrl(options.autoLoadUrl);
    }

    // Set initial focus on canvas so WASD & camera navigation works immediately
    this.initialFocusRafId = requestAnimationFrame(() => {
      this.initialFocusRafId = null;
      if (!this.isDisposed) {
        this.focusCanvasIfIdle();
      }
    });
  }

  private addGlobalListener<K extends keyof WindowEventMap>(
    target: Window,
    type: K,
    listener: (this: Window, ev: WindowEventMap[K]) => any,
    options?: boolean | AddEventListenerOptions
  ): void;
  private addGlobalListener<K extends keyof DocumentEventMap>(
    target: Document,
    type: K,
    listener: (this: Document, ev: DocumentEventMap[K]) => any,
    options?: boolean | AddEventListenerOptions
  ): void;
  private addGlobalListener(
    target: EventTarget,
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ): void {
    target.addEventListener(type, listener, options);
    this.globalListenerCleanups.push(() => {
      target.removeEventListener(type, listener, options);
    });
  }

  public getElement<T extends HTMLElement = HTMLElement>(id: string): T | null {
    if (this.rootContainer) {
      const rootNode = this.rootContainer.getRootNode?.();
      if (typeof document !== 'undefined' && rootNode === document) {
        const docEl = document.getElementById(id);
        if (!docEl) return null;
        if (this.rootContainer.contains(docEl)) return docEl as T;
        const scoped = this.rootContainer.querySelector(`#${id}`) as T | null;
        return (scoped || docEl) as T;
      }
      if (rootNode && 'getElementById' in rootNode && typeof (rootNode as ShadowRoot).getElementById === 'function') {
        const shadowEl = (rootNode as ShadowRoot).getElementById(id);
        if (shadowEl) {
          if (this.rootContainer.contains(shadowEl)) return shadowEl as T;
          const scoped = this.rootContainer.querySelector(`#${id}`) as T | null;
          if (scoped) return scoped;
        }
      } else {
        const scoped = this.rootContainer.querySelector(`#${id}`) as T | null;
        if (scoped) return scoped;
      }
    }
    if (typeof document !== 'undefined') {
      return document.getElementById(id) as T | null;
    }
    return null;
  }

  public setAdapter(adapter: MeshEditorPlatformAdapter): void {
    this.stopSpeechRecognition();
    this.adapter.dispose?.();
    this.adapter = adapter;
    this.adapter.initialize?.(this);
  }

  public async triggerOpenModel(): Promise<void> {
    if (this.adapter.openModelDialog) {
      const handled = await this.adapter.openModelDialog(this);
      if (handled) return;
    }
    this.modelFileInput?.click();
  }

  public async triggerImportModel(): Promise<void> {
    if (this.adapter.importModelDialog) {
      const handled = await this.adapter.importModelDialog(this);
      if (handled) return;
    }
    this.importFileInput?.click();
  }

  public async triggerReplaceTexture(): Promise<void> {
    if (this.adapter.openTextureDialog) {
      const handled = await this.adapter.openTextureDialog(this);
      if (handled) return;
    }
    this.textureFileInput?.click();
  }

  public async triggerReplaceBumpTexture(): Promise<void> {
    if (this.adapter.openBumpTextureDialog) {
      const handled = await this.adapter.openBumpTextureDialog(this);
      if (handled) return;
    }
    this.bumpFileInput?.click();
  }

  public dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;

    if (this.initialFocusRafId !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.initialFocusRafId);
      this.initialFocusRafId = null;
    }
    for (const timer of this.startupTimerIds) {
      clearTimeout(timer);
    }
    this.startupTimerIds = [];
    if (this.sceneLoaderTimerId) {
      clearTimeout(this.sceneLoaderTimerId);
      this.sceneLoaderTimerId = null;
    }
    for (const timer of this.refreshIconTimerIds) {
      clearTimeout(timer);
    }
    this.refreshIconTimerIds = [];
    if (this.toastTimerId) {
      clearTimeout(this.toastTimerId);
      this.toastTimerId = null;
    }
    this.toolsMenu.dispose();
    this.helpModals.dispose();
    this.tooltipManager?.dispose();
    this.tooltipManager = null;
    this.aiAgentUI.dispose();
    for (const cleanup of this.globalListenerCleanups) {
      cleanup();
    }
    this.globalListenerCleanups = [];
    this.windowLayout.dispose();
    this.inspectorGui.dispose();

    this.adapter.dispose?.();
    for (const plugin of this.pluginManager.getAllPlugins()) {
      this.pluginManager.unregister(plugin.id);
    }
    this.service.dispose();
  }

  public async use(plugin: MeshEditorPlugin): Promise<void> {
    await this.pluginManager.register(plugin);
    this.refreshIcons();
  }

  /* =========================================================================
     MENU & TOOLBAR EXTENSIONS FOR PLUGINS
     ========================================================================= */
  public registerFileMenuItem(item: MenuItemDefinition): void {
    this.toolsMenu.registerFileMenuItem(item);
  }

  public registerActionMenuItem(item: MenuItemDefinition): void {
    this.toolsMenu.registerActionMenuItem(item);
  }

  public registerToolMenuItem(item: MenuItemDefinition): void {
    this.toolsMenu.registerToolMenuItem(item);
  }

  public registerViewMenuItem(item: MenuItemDefinition): void {
    this.toolsMenu.registerViewMenuItem(item);
  }

  public registerToolbarButton(button: ToolbarButtonDefinition): void {
    this.toolsMenu.registerToolbarButton(button);
  }

  /* =========================================================================
     TOOLBAR & DIALOG WINDOWS SETUP
     ========================================================================= */
  private initToolbarAndDialogs(): void {
    // Gizmo Mode Switches
    const btnTranslate = document.getElementById('btnGizmoTranslate');
    const btnRotate = document.getElementById('btnGizmoRotate');
    const btnScale = document.getElementById('btnGizmoScale');
    const btnBounds = document.getElementById('btnGizmoBounds');

    const updateGizmoButtons = (mode: 'translate' | 'rotate' | 'scale' | 'bounds') => {
      if (this.isAIGenerating) return;
      btnTranslate?.classList.toggle('active', mode === 'translate');
      btnRotate?.classList.toggle('active', mode === 'rotate');
      btnScale?.classList.toggle('active', mode === 'scale');
      btnBounds?.classList.toggle('active', mode === 'bounds');

      // Switching to standard transform gizmos deactivates exclusive 3D tools without closing their dialogs
      this.deactivateOtherExclusiveTools(null);

      this.service.setGizmoMode(mode);
      this.updatePanelButtonStates();
    };

    btnTranslate?.addEventListener('click', () => updateGizmoButtons('translate'));
    btnRotate?.addEventListener('click', () => updateGizmoButtons('rotate'));
    btnScale?.addEventListener('click', () => updateGizmoButtons('scale'));
    btnBounds?.addEventListener('click', () => updateGizmoButtons('bounds'));

    // Undo / Redo
    document.getElementById('btnUndo')?.addEventListener('click', () => {
      if (this.isAIGenerating) return;
      this.service.undo();
    });
    document.getElementById('btnRedo')?.addEventListener('click', () => {
      if (this.isAIGenerating) return;
      this.service.redo();
    });

    // File Menu Generic Operations
    this.getElement('btnOpenModel')?.addEventListener('click', () => {
      this.closeAllDropdowns();
      if (this.isAIGenerating) return;
      this.triggerOpenModel();
    });
    this.getElement('btnImportModel')?.addEventListener('click', () => {
      this.closeAllDropdowns();
      if (this.isAIGenerating) return;
      this.triggerImportModel();
    });
    this.getElement('btnSaveBabylonScene')?.addEventListener('click', () => {
      this.closeAllDropdowns();
      void this.saveBabylonScene();
    });
    this.getElement('btnExportMenu')?.addEventListener('click', () => {
      this.closeAllDropdowns();
      this.openExportDialog();
    });

    // Actions Menu
    document.getElementById('btnFocus')?.addEventListener('click', () => {
      this.closeAllDropdowns();
      this.service.focusOnSelected();
    });
    document.getElementById('btnCenterPivot')?.addEventListener('click', () => {
      this.closeAllDropdowns();
      if (this.isAIGenerating) return;
      this.service.centerSelectedPivot();
    });
    document.getElementById('btnExtractSubmesh')?.addEventListener('click', () => {
      this.closeAllDropdowns();
      if (this.isAIGenerating) return;
      this.service.separateSelectedLooseParts();
    });
    document.getElementById('btnMergeMeshes')?.addEventListener('click', () => {
      this.closeAllDropdowns();
      if (this.isAIGenerating) return;
      this.service.mergeSelectedMeshes();
    });
    document.getElementById('btnGroup')?.addEventListener('click', () => {
      this.closeAllDropdowns();
      if (this.isAIGenerating) return;
      this.service.groupSelected();
    });
    document.getElementById('btnUngroup')?.addEventListener('click', () => {
      this.closeAllDropdowns();
      if (this.isAIGenerating) return;
      this.service.ungroupSelected();
    });
    this.getElement('btnCopy')?.addEventListener('click', () => {
      this.closeAllDropdowns();
      this.service.copySelected();
    });
    this.getElement('btnPaste')?.addEventListener('click', () => {
      this.closeAllDropdowns();
      if (this.isAIGenerating) return;
      if (this.service.lastPointerX === 0 && this.service.lastPointerY === 0 && this.canvas) {
        this.service.pasteAtCursor(
          (this.canvas.clientWidth || this.canvas.width || 800) / 2,
          (this.canvas.clientHeight || this.canvas.height || 600) / 2
        );
      } else {
        this.service.pasteAtCursor();
      }
    });
    this.getElement('btnDuplicateSelected')?.addEventListener('click', () => {
      this.closeAllDropdowns();
      if (this.isAIGenerating) return;
      this.service.duplicateSelectedMesh();
    });
    document.getElementById('btnDeleteSelected')?.addEventListener('click', () => {
      this.closeAllDropdowns();
      if (this.isAIGenerating) return;
      this.service.deleteSelected();
    });

    // Build and wire Tools dropdown menu dynamically from registered ToolInterface instances
    this.renderToolsMenu();

    // Support legacy alias btnToggleMatPanel if present
    document.getElementById('btnToggleMatPanel')?.addEventListener('click', () => {
      this.closeAllDropdowns();
      this.toggleDialog('dialog-material');
    });
    document.getElementById('btnToggleGrid')?.addEventListener('click', () => {
      this.closeAllDropdowns();
      const newGridState = !this.service.sceneParams.grid;
      this.service.setGridVisible(newGridState);
      this.saveSettingsToStorage();
      this.syncSettingsUI();
      this.updatePanelButtonStates();
      this.showToast(`Ground grid ${newGridState ? 'enabled' : 'disabled'}`, 'info');
    });
    this.getElement('btnCaptureScreenshot')?.addEventListener('click', () => {
      this.closeAllDropdowns();
      this.openScreenshotDialog();
    });

    // Layout Mode (Float vs Stack vs Dock)
    this.getElement('btnLayoutFloating')?.addEventListener('click', () => {
      this.closeAllDropdowns();
      this.setLayoutMode('floating');
    });
    this.getElement('btnLayoutStack')?.addEventListener('click', () => {
      this.closeAllDropdowns();
      this.setLayoutMode('stackpanel');
    });
    this.getElement('btnLayoutDock')?.addEventListener('click', () => {
      this.closeAllDropdowns();
      this.setLayoutMode('dock');
    });

    // Stackpanel Drawer Toggle
    try {
      this.isStackpanelDrawerCollapsed = localStorage.getItem('mesheditor_stackpanel_drawer_collapsed') === 'true';
    } catch {
      this.isStackpanelDrawerCollapsed = false;
    }
    this.getElement('btnStackpanelDrawerToggle')?.addEventListener('click', () => {
      this.toggleStackpanelDrawer();
    });

    // Fullscreen toggle
    this.getElement('btnToggleFullscreen')?.addEventListener('click', () => {
      this.closeAllDropdowns();
      void this.toggleFullscreen();
    });
    if (typeof document !== 'undefined') {
      this.windowLayout.onFullscreenChangeHandler = () => {
        this.updateFullscreenButtonState();
        this.service.engine?.resize();
      };
      document.addEventListener('fullscreenchange', this.windowLayout.onFullscreenChangeHandler);
      document.addEventListener('webkitfullscreenchange', this.windowLayout.onFullscreenChangeHandler);
    }

    // Dropdown Toggles Setup
    const setupDropdown = (wrapperId: string, buttonId: string, menuId: string) => {
      const btn = this.getElement(buttonId) || document.getElementById(buttonId);
      const wrapper = this.getElement(wrapperId) || document.getElementById(wrapperId);
      const menu = this.getElement(menuId) || document.getElementById(menuId);
      if (!btn || !wrapper) return;

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const wasOpen = wrapper.classList.contains('open') || wrapper.classList.contains('active');
        this.closeAllDropdowns();
        if (!wasOpen) {
          wrapper.classList.add('open');
          wrapper.classList.add('active');
        }
      });

      menu?.addEventListener('click', (e) => {
        // Prevent click inside menu (on headers/dividers) from closing unless an action item was clicked
        const target = e.target as HTMLElement;
        if (!target.closest('.dropdown-item')) {
          e.stopPropagation();
        }
      });
    };

    setupDropdown('dropdownFile', 'btnDropdownFile', 'menuFile');
    setupDropdown('dropdownActions', 'btnDropdownActions', 'menuActions');
    this.setupToolsMenu();
    setupDropdown('dropdownView', 'btnDropdownView', 'menuView');

    // Close on outside click
    this.addGlobalListener(document, 'click', (e) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.dropdown-wrapper') && !target.closest('.dropdown-menu[popover]')) {
        this.closeAllDropdowns();
      }
    });

    // Close on Escape key
    this.addGlobalListener(document, 'keydown', (e) => {
      if (e.key === 'Escape') {
        const aiImagePreviewModal = this.getElement<HTMLDialogElement>('aiImagePreviewModal');
        const hadAIImagePreviewModal = Boolean(
          aiImagePreviewModal && (aiImagePreviewModal.open || aiImagePreviewModal.hasAttribute('open'))
        );
        if (hadAIImagePreviewModal) {
          this.lastEscapeClosedOverlayEvent = e;
          return;
        }

        const hadOpenDropdown =
          this.isMenuPopoverOpen(this.getElement('menuTools')) ||
          Boolean(this.rootContainer?.querySelector('.dropdown-wrapper.open')) ||
          Boolean(document.querySelector('.dropdown-wrapper.open'));
        const exportModal = this.getElement('exportModal');
        const hadExportModal = Boolean(exportModal?.classList.contains('active'));
        const screenshotModal = this.getElement<HTMLDialogElement>('screenshotModal');
        const hadScreenshotModal = Boolean(
          screenshotModal && (screenshotModal.open || screenshotModal.hasAttribute('open'))
        );
        const promptHelpModal = this.getElement('promptHelpModal') || document.getElementById('promptHelpModal');
        const hadPromptHelp = Boolean(promptHelpModal?.classList.contains('active'));
        const hadHelpModal = this.isHelpModalOpen() || this.helpModals.wasRecentlyClosedByEscape();
        const hadGuidedTour = this.isGuidedTourOpen();
        const toolHelpModal = this.getElement('toolHelpModal');
        const hadToolHelpModal = Boolean(toolHelpModal?.classList.contains('active'));
        const aboutModal = this.getElement('aboutModal') || document.getElementById('aboutModal');
        const hadAboutModal = Boolean(aboutModal?.classList.contains('active'));
        const heightmapPaintModal = this.getElement('heightmapPaintModal');
        const hadHeightmapPaintModal = Boolean(heightmapPaintModal?.classList.contains('active'));

        this.closeAllDropdowns();
        this.closeExportDialog();
        this.closeScreenshotDialog();
        this.hidePromptHelp();
        if (hadHelpModal) {
          this.closeHelpModal();
        }
        if (hadGuidedTour) {
          this.closeGuidedTour(true);
        }
        if (hadToolHelpModal && toolHelpModal) {
          toolHelpModal.classList.remove('active');
          toolHelpModal.style.display = 'none';
          this.canvas?.focus();
        }
        if (hadAboutModal) {
          this.closeAboutModal();
        }

        if (
          hadOpenDropdown ||
          hadExportModal ||
          hadScreenshotModal ||
          hadPromptHelp ||
          hadHelpModal ||
          hadGuidedTour ||
          hadToolHelpModal ||
          hadAboutModal ||
          hadHeightmapPaintModal
        ) {
          this.lastEscapeClosedOverlayEvent = e;
        }
      }
    });

    // Setup Floating Dialogs & Dragging
    for (const id of this.dialogIds) {
      const dialog = this.getElement(id);
      if (dialog) this.setupFloatingDialog(dialog);
    }

    // Initialize stackpanel & dock tool drag & drop and restore tool order
    this.initStackpanelDragAndDrop();
    this.initDockDragAndDrop();
    this.restoreStackpanelOrder();

    // Initialize AI Agent Panel UI
    this.initAIAgentUI();
    this.initVoxelPainterUI();
    this.initEmbeddedTexturesUI();
    this.initPathExtrusionUI();
    this.initCompressModelUI();
    this.initSculptUI();
    this.initCSGBevelUI();
    this.initUVUnwrapUI();
    this.initBakingUI();
    this.initRiggingUI();
    this.initAITextureUI();
    this.initTextMeshUI();
    this.initDecalUI();
    this.initTexturePaintUI();
    this.initHeightmapUI();
    this.initGaussianSplatUI();

    // Restore saved window layout and active tools from localStorage
    this.restoreDialogLayout();
    this.updatePanelButtonStates();

    // Help Assistant Modal & Guided Tour
    this.helpModals.initHelpAssistant();

    // About Modal
    const aboutModal = this.getElement('aboutModal') || document.getElementById('aboutModal');
    const btnToolbarAbout = this.getElement('btnToolbarAbout') || document.getElementById('btnToolbarAbout');
    btnToolbarAbout?.addEventListener('click', () => this.openAboutModal());
    (this.getElement('btnCloseAbout') || document.getElementById('btnCloseAbout'))?.addEventListener('click', () =>
      this.closeAboutModal()
    );
    (this.getElement('btnAboutDone') || document.getElementById('btnAboutDone'))?.addEventListener('click', () =>
      this.closeAboutModal()
    );
    aboutModal?.addEventListener('click', (e) => {
      if (e.target === aboutModal) {
        this.closeAboutModal();
      }
    });

    // Settings Modal
    this.initSettingsUI();

    // Tool-specific Help Modal Popup
    const toolHelpModal = this.getElement('toolHelpModal');
    this.getElement('btnCloseToolHelp')?.addEventListener('click', () => {
      toolHelpModal?.classList.remove('active');
      if (toolHelpModal) toolHelpModal.style.display = 'none';
      this.canvas?.focus();
    });
    this.getElement('btnDoneToolHelp')?.addEventListener('click', () => {
      toolHelpModal?.classList.remove('active');
      if (toolHelpModal) toolHelpModal.style.display = 'none';
      this.canvas?.focus();
    });
    toolHelpModal?.addEventListener('click', (e) => {
      if (e.target === toolHelpModal) {
        toolHelpModal.classList.remove('active');
        toolHelpModal.style.display = 'none';
        this.canvas?.focus();
      }
    });

    // AI Prompting Guide & Tools Directory Modal
    const promptHelpModal = this.getElement('promptHelpModal') || document.getElementById('promptHelpModal');
    this.getElement('btnClosePromptHelp')?.addEventListener('click', () => {
      this.hidePromptHelp();
    });
    this.getElement('btnDonePromptHelp')?.addEventListener('click', () => {
      this.hidePromptHelp();
    });
    promptHelpModal?.addEventListener('click', (e) => {
      if (e.target === promptHelpModal) {
        this.hidePromptHelp();
      }
    });

    // Export Modal Dialog
    this.initExportDialog();

    // Capture Screenshot Modal Dialog
    this.initScreenshotDialog();

    // Outliner wireframe toggle button
    const btnOutlinerWireframe = this.getElement<HTMLButtonElement>('btnOutlinerWireframe');
    btnOutlinerWireframe?.addEventListener('click', () => {
      this.service.toggleSelectedWireframe();
      this.updateOutliner();
    });

    // Initialize Facet Modeling UI
    this.initFacetToolUI();

    // Initialize Touch Viewport Modifier Controls
    this.initTouchViewportControls();

    // Search filter in Outliner
    this.outlinerSearchInput?.addEventListener('input', (e) => {
      this.sceneOutliner.setSearchFilter((e.target as HTMLInputElement).value);
    });
  }

  public closeAllDropdowns(options: { restoreFocusTarget?: HTMLElement | null; fromPointer?: boolean } = {}): void {
    this.clearToolsHoverPreviewTimer();
    this.closeAllToolSubmenus();
    const rootToolsMenu = this.getElement('menuTools') || document.getElementById('menuTools');
    const btnTools = this.getElement('btnDropdownTools') || document.getElementById('btnDropdownTools');
    if (rootToolsMenu) {
      this.hideMenuPopover(rootToolsMenu);
      this.toolsMenu.onMenuPopoverClosed(rootToolsMenu, btnTools, false);
    }

    const wrappers = this.rootContainer
      ? Array.from(this.rootContainer.querySelectorAll('.dropdown-wrapper'))
      : Array.from(document.querySelectorAll('.dropdown-wrapper'));
    for (const el of wrappers) {
      el.classList.remove('open');
      el.classList.remove('active');
    }
    document.querySelectorAll('.dropdown-wrapper').forEach((el) => {
      el.classList.remove('open');
      el.classList.remove('active');
    });

    if (options.restoreFocusTarget) {
      this.toolsMenu.focusElementWithOptions(options.restoreFocusTarget, !!options.fromPointer);
    }
  }

  private isFullscreenActive(): boolean {
    return this.windowLayout.isFullscreenActive();
  }

  public async toggleFullscreen(): Promise<void> {
    await this.windowLayout.toggleFullscreen();
  }

  public updateFullscreenButtonState(): void {
    this.windowLayout.updateFullscreenButtonState();
  }

  private isSidebarLayoutMode(): boolean {
    return this.windowLayout.isSidebarLayoutMode();
  }

  public setLayoutMode(mode: LayoutMode, save: boolean = true): void {
    this.windowLayout.setLayoutMode(mode, save);
  }

  /**
   * Renders or updates the round icon Dock bar above the right sidebar for all currently open sidebar tools.
   */
  public renderDockToolbar(): void {
    this.windowLayout.renderDockToolbar();
  }

  /**
   * Clears drag position indicators from all round icon buttons in the Dock bar.
   */
  public clearDockDragIndicators(): void {
    this.windowLayout.clearDockDragIndicators();
  }

  /**
   * Initializes drag & drop reordering handlers on the Dock icon bar, keeping
   * tool order synchronized with the stackpanel sidebar, Tools menu, and localStorage.
   */
  public initDockDragAndDrop(): void {
    this.windowLayout.initDockDragAndDrop();
  }

  /**
   * Activates a single tool panel in Dock mode, collapsing all other open sidebar panels.
   */
  public activateDockTool(dialogId: string): void {
    this.windowLayout.activateDockTool(dialogId);
  }

  /**
   * Toggles whether the stackpanel sidebar is minimized into its right-edge drawer.
   */
  public toggleStackpanelDrawer(forceCollapsed?: boolean): void {
    this.windowLayout.toggleStackpanelDrawer(forceCollapsed);
  }

  /**
   * Minimizes or restores the stackpanel sidebar drawer and optionally persists the state.
   */
  public setStackpanelDrawerCollapsed(collapsed: boolean, save: boolean = true): void {
    this.windowLayout.setStackpanelDrawerCollapsed(collapsed, save);
  }

  private updateStackpanelDrawerUI(): void {
    this.windowLayout.updateStackpanelDrawerUI();
  }

  private setupFloatingDialog(dialog: HTMLElement): void {
    this.windowLayout.setupFloatingDialog(dialog);
  }

  /**
   * Clears drag position indicators from all dialogs in the stackpanel sidebar.
   */
  public clearStackpanelDragIndicators(): void {
    this.windowLayout.clearStackpanelDragIndicators();
  }

  /**
   * Initializes drag & drop reordering handlers on the stackpanel container.
   */
  public initStackpanelDragAndDrop(): void {
    this.windowLayout.initStackpanelDragAndDrop();
  }

  /**
   * Updates CSS flex order and ToolInterface.order for each tool in the stackpanel sidebar,
   * synchronizes the Tools dropdown menu, and persists the new order to localStorage.
   */
  public updateStackpanelOrderFromDOM(): void {
    this.windowLayout.updateStackpanelOrderFromDOM();
  }

  /**
   * Persists the current stackpanel tool order to localStorage.
   */
  public saveStackpanelOrder(): void {
    this.windowLayout.saveStackpanelOrder();
  }

  /**
   * Restores the persisted tool order in the stackpanel sidebar from localStorage,
   * or sorts sidebar dialog elements by default tool.order if no order is saved.
   */
  public restoreStackpanelOrder(): void {
    this.windowLayout.restoreStackpanelOrder();
  }

  /**
   * Opens the main in-app Help Assistant modal, optionally jumping to a specific topic.
   */
  public openHelpModal(initialTopicId?: string): void {
    this.helpModals.openHelpModal(initialTopicId);
  }

  /**
   * Closes the main in-app Help Assistant modal and refocuses the canvas.
   */
  public closeHelpModal(): void {
    this.helpModals.closeHelpModal();
  }

  public isHelpModalOpen(): boolean {
    return this.helpModals.isHelpModalOpen();
  }

  public startGuidedTour(startIndex = 0): void {
    this.helpModals.startGuidedTour(startIndex);
  }

  public closeGuidedTour(restoreFocus = true): void {
    this.helpModals.stopGuidedTour(restoreFocus);
  }

  public isGuidedTourOpen(): boolean {
    return this.helpModals.isGuidedTourOpen();
  }

  /**
   * Opens the About Mesh Editor modal dialog.
   */
  public openAboutModal(): void {
    this.helpModals.openAboutModal();
  }

  /**
   * Closes the About Mesh Editor modal dialog and refocuses the canvas.
   */
  public closeAboutModal(): void {
    this.helpModals.closeAboutModal();
  }

  /**
   * Loads persisted editor settings from localStorage and applies them to the active service.
   */
  public loadSettingsFromStorage(): void {
    this.settingsUI.loadSettingsFromStorage();
  }

  /**
   * Persists current editor settings to localStorage.
   */
  public saveSettingsToStorage(): void {
    this.settingsUI.saveSettingsToStorage();
  }

  /**
   * Synchronizes all Settings dialog form controls with the current service parameters.
   */
  public syncSettingsUI(): void {
    this.settingsUI.syncSettingsUI();
  }

  /**
   * Displays an inline feedback banner inside the Settings modal so status messages
   * remain visible above the modal backdrop.
   */
  private setSettingsInlineFeedback(elementId: string, message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info'): void {
    this.settingsUI.setSettingsInlineFeedback(elementId, message, type);
  }

  /**
   * Resets all Settings dialog options in the active tab back to their default values and persists them.
   */
  public resetSettingsToDefaults(): void {
    this.settingsUI.resetSettingsToDefaults();
  }

  /**
   * Resets AI Agent settings in the Settings dialog back to defaults and persists them to localStorage.
   */
  public resetAISettingsToDefaults(): void {
    this.settingsUI.resetAISettingsToDefaults();
  }

  /**
   * Switches the active tab inside the Settings modal dialog.
   */
  public switchSettingsTab(tab: 'editing' | 'ai'): void {
    this.settingsUI.switchSettingsTab(tab);
  }

  /**
   * Opens the Settings modal dialog, optionally selecting a specific tab
   * and showing inline endpoint feedback (e.g. when auto-opened after a request error).
   */
  public openSettingsModal(tab?: 'editing' | 'ai', options?: {
      endpointFeedback?: {
        message: string;
        type?: 'info' | 'success' | 'warning' | 'error';
      };
    }): void {
    this.settingsUI.openSettingsModal(tab, options);
  }

  /**
   * Closes the Settings modal dialog.
   */
  public closeSettingsModal(): void {
    this.settingsUI.closeSettingsModal();
  }

  private initSettingsUI(): void {
    this.settingsUI.initSettingsUI();
  }

  /**
   * Initializes all AI settings controls inside the central Settings modal's "AI" tab
   * and persists every change directly to localStorage.
   */
  private initAISettingsUI(): void {
    this.settingsUI.initAISettingsUI();
  }

  /**
   * Opens the rich guide and help popup for any tool or floating dialog.
   */
  public showToolHelp(toolOrId: string | ToolInterface): void {
    this.helpModals.showToolHelp(toolOrId);
  }

  /**
   * Opens the AI Prompting Guide & 3D Modeling Tools Directory modal.
   * Displays prompt engineering principles, ready-to-use prompt templates,
   * and a complete searchable directory of all available Babylon.js AI tools
   * with names and descriptions pulled dynamically from ToolRegistry.
   */
  public showPromptHelp(initialTab: 'guide' | 'tools' | 'examples' = 'guide'): void {
    this.helpModals.showPromptHelp(initialTab);
  }

  /**
   * Closes the AI Prompting Guide & Modeling Tools Directory modal.
   */
  public hidePromptHelp(): void {
    this.helpModals.hidePromptHelp();
  }

  /**
   * Inserts a tool identifier or prompt snippet into the AI Agent prompt input,
   * activating and displaying the AI Agent panel if it is closed or minimized.
   */

  private isCompactViewport(): boolean {
    return this.windowLayout.isCompactViewport();
  }

  private applyDialogMinimizedState(dialog: HTMLElement, minimized: boolean): void {
    this.windowLayout.applyDialogMinimizedState(dialog, minimized);
  }

  private deactivateOtherExclusiveTools(exceptTool?: ToolInterface | null): void {
    this.windowLayout.deactivateOtherExclusiveTools(exceptTool);
  }

  public activateExclusive3DTool(toolName: string): void {
    this.windowLayout.activateExclusive3DTool(toolName);
  }

  public toggleDialogMinimize(dialog: HTMLElement, forceState?: boolean): void {
    this.windowLayout.toggleDialogMinimize(dialog, forceState);
  }

  private accordionMinimizeOthers(activeDialog: HTMLElement): void {
    this.windowLayout.accordionMinimizeOthers(activeDialog);
  }

  public toggleDialog(id: string, forceOpen?: boolean): void {
    this.windowLayout.toggleDialog(id, forceOpen);
  }

  /* =========================================================================
     EXPORT MODAL DIALOG
     ========================================================================= */
  private initExportDialog(): void {
    this.exportAndScreenshot.initExportDialog();
  }

  public openExportDialog(): void {
    this.exportAndScreenshot.openExportDialog();
  }

  public closeExportDialog(): void {
    this.exportAndScreenshot.closeExportDialog();
  }

  /**
   * Saves the full Babylon.js scene and embedded MeshEditor project state as a .babylon file.
   */
  public async saveBabylonScene(): Promise<void> {
    await this.exportAndScreenshot.saveBabylonScene();
  }

  /* =========================================================================
     CAPTURE SCREENSHOT MODAL DIALOG
     ========================================================================= */
  private initScreenshotDialog(): void {
    this.exportAndScreenshot.initScreenshotDialog();
  }

  private setScreenshotMode(mode: ScreenshotMode): void {
    this.exportAndScreenshot.setScreenshotMode(mode);
  }

  public openScreenshotDialog(): void {
    this.exportAndScreenshot.openScreenshotDialog();
  }

  public closeScreenshotDialog(): void {
    this.exportAndScreenshot.closeScreenshotDialog();
  }

  private initTouchViewportControls(): void {
    this.inputAndFiles.initTouchViewportControls();
  }

  public updateTouchViewportControls(): void {
    this.inputAndFiles.updateTouchViewportControls();
  }

  public updateFacetPickUI(): void {
    this.facetEditorUI.updateFacetPickUI();
  }

  private initFacetToolUI(): void {
    this.facetEditorUI.initFacetToolUI();
  }

  private renderFacetAtlasTileGrid(selectedAtlasId?: string): void {
    this.facetEditorUI.renderFacetAtlasTileGrid(selectedAtlasId);
  }

  private updateFacetSurfaceUI(): void {
    this.facetEditorUI.updateFacetSurfaceUI();
  }

  private saveDialogLayout(): void {
    this.windowLayout.saveDialogLayout();
  }

  private restoreDialogLayout(): void {
    this.windowLayout.restoreDialogLayout();
  }

  private clearToolsHoverPreviewTimer(): void {
    this.toolsMenu.clearToolsHoverPreviewTimer();
  }

  private isMenuPopoverOpen(menu: HTMLElement | null): boolean {
    return this.toolsMenu.isMenuPopoverOpen(menu);
  }

  private hideMenuPopover(menu: HTMLElement | null): void {
    this.toolsMenu.hideMenuPopover(menu);
  }

  private closeAllToolSubmenus(exceptSubmenu?: HTMLElement | null): void {
    this.toolsMenu.closeAllToolSubmenus(exceptSubmenu);
  }

  private openMenuPopover(menu: HTMLElement, trigger: HTMLElement, options: { isSubmenu?: boolean; enter?: boolean } = {}): void {
    this.toolsMenu.openMenuPopover(menu, trigger, options);
  }

  private closeMenuPopover(menu: HTMLElement, trigger: HTMLElement | null, options: { isSubmenu?: boolean; restoreFocus?: boolean; fromPointer?: boolean } = {}): void {
    this.toolsMenu.closeMenuPopover(menu, trigger, options);
  }

  private setupToolsMenu(): void {
    this.toolsMenu.setupToolsMenu();
  }

  /**
   * Dynamically renders the Tools dropdown menu (#menuTools) organized by tool categories into submenus.
   */
  public renderToolsMenu(): void {
    this.toolsMenu.renderToolsMenu();
  }

  /**
   * Registers a new editor tool dynamically and updates the Tools menu.
   */
  public registerEditorTool(tool: ToolInterface): void {
    this.toolsMenu.registerEditorTool(tool);
  }

  public updatePanelButtonStates(): void {
    this.toolsMenu.updatePanelButtonStates();
  }

  /* =========================================================================
     DAT.GUI PANELS INITIALIZATION
     ========================================================================= */
  private initGUI(): void {
    this.inspectorGui.initGUI();
  }

  public bringDialogToFront(activeDialog: HTMLElement): void {
    this.windowLayout.bringDialogToFront(activeDialog);
  }

  private updateSceneGUI(): void {
    this.inspectorGui.updateSceneGUI();
  }

  private updateMeshGUI(): void {
    this.inspectorGui.updateMeshGUI();
  }

  private updateMaterialGUI(): void {
    this.inspectorGui.updateMaterialGUI();
  }

  /* =========================================================================
     OUTLINER SCENE HIERARCHY TREE
     ========================================================================= */
  public updateOutliner(): void {
    this.sceneOutliner.updateOutliner();
  }

  /* =========================================================================
     FILE DRAG & DROP & INPUTS
     ========================================================================= */
  private initFileHandling(): void {
    this.inputAndFiles.initFileHandling();
  }

  /* =========================================================================
     KEYBOARD SHORTCUTS
     ========================================================================= */
  private initKeyboardShortcuts(): void {
    this.inputAndFiles.initKeyboardShortcuts();
  }

  /* =========================================================================
     NOTIFICATIONS & HELPERS
     ========================================================================= */
  public refreshIcons(root?: HTMLElement): void {
    if (this.isDisposed) return;
    if (root) {
      renderEditorIcons(root);
      return;
    }
    for (const timer of this.refreshIconTimerIds) {
      clearTimeout(timer);
    }
    this.refreshIconTimerIds = [];
    const render = () => {
      if (this.isDisposed) return;
      renderEditorIcons();
    };
    render();
    this.refreshIconTimerIds.push(setTimeout(render, 60));
    this.refreshIconTimerIds.push(setTimeout(render, 300));
  }

  /**
   * Toggles visual masking of an API key text input without using type="password",
   * avoiding browser form warnings and password manager autofill prompts.
   */
  private toggleApiKeyVisibility(input: HTMLInputElement | null, toggleBtn?: HTMLElement | null): void {
    if (!input) return;
    const isRevealed = !input.classList.toggle('api-key-masked');
    if (toggleBtn) {
      toggleBtn.setAttribute('aria-pressed', String(isRevealed));
      toggleBtn.setAttribute('aria-label', isRevealed ? 'Hide API Key' : 'Show API Key');
      toggleBtn.innerHTML = `<i class="app-icon" data-lucide="${isRevealed ? 'eye-off' : 'eye'}"></i>`;
      renderEditorIcons(toggleBtn);
    }
  }

  public showToast(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info'): void {
    if (!this.toastText || !this.toastElement || this.isDisposed) return;
    const cleanMsg = message.replace(/^[\s\p{Emoji}\p{Extended_Pictographic}]+/u, '').trim();
    this.toastText.textContent = cleanMsg;
    this.toastElement.className = `show ${type}`;

    const iconMap: { [key: string]: string } = {
      info: 'info',
      success: 'check-circle-2',
      warning: 'alert-triangle',
      error: 'alert-circle',
    };
    if (this.toastIcon) {
      this.toastIcon.innerHTML = `<i class="app-icon" data-lucide="${iconMap[type] || 'info'}"></i>`;
      renderEditorIcons(this.toastIcon);
    }

    if (this.toastTimerId) {
      clearTimeout(this.toastTimerId);
    }
    this.toastTimerId = setTimeout(() => {
      this.toastTimerId = null;
      this.toastElement.classList.remove('show');
    }, 3200);
  }

  public setStatus(text: string, isBusy: boolean = false): void {
    if (this.statusText) this.statusText.textContent = text;
    if (this.statusIndicator) this.statusIndicator.classList.toggle('busy', isBusy || this.isAIGenerating);
    if (this.isAIGenerating) {
      this.showSceneLoader(text, 'AI MESH AGENT • LIVE SCENE GENERATION', { topHud: true, showStop: true });
      return;
    }
    if (isBusy) {
      this.showSceneLoader(text, 'BABYLON.JS 3D SCENE • PROCESSING MESH PIPELINE');
    } else {
      this.hideSceneLoader();
      if (!document.activeElement || document.activeElement === document.body) {
        try {
          this.canvas?.focus();
        } catch {
          // Ignore
        }
      }
    }
  }

  private focusCanvasIfIdle(): void {
    try {
      const active = typeof document !== 'undefined' ? document.activeElement : null;
      const hasOpenDropdown =
        (typeof document !== 'undefined' && Boolean(document.querySelector('.dropdown-wrapper.open'))) ||
        this.isMenuPopoverOpen(this.getElement('menuTools'));
      if (hasOpenDropdown) return;
      if (!active || active === document.body || active === this.canvas) {
        this.canvas?.focus();
      }
    } catch {
      // Ignore
    }
  }

  private runInitialLoadingSequence(autoLoadUrl?: string): void {
    this.setStartupProgress(78, 'Activating 3D Tools & Panels...');

    const t1 = setTimeout(() => {
      this.setStartupProgress(100, 'Launching Mesh Editor...');
    }, 260);

    const t2 = setTimeout(() => {
      this.hideStartupLoader();
      this.focusCanvasIfIdle();
    }, 560);

    this.startupTimerIds.push(t1, t2);

    const scheduleFirstVisitHelp = () => {
      if (!this.autoShowHelpOnFirstVisit || this.isDisposed) return;
      this.helpModals.maybeAutoStartHelpAssistant();
    };

    const scene = this.service.getScene();
    const finalizeSceneInit = () => {
      if (autoLoadUrl) return;
      if (this.sceneLoaderTimerId) clearTimeout(this.sceneLoaderTimerId);
      this.sceneLoaderTimerId = setTimeout(() => {
        this.hideSceneLoader();
        this.focusCanvasIfIdle();
        scheduleFirstVisitHelp();
      }, 1050);
    };

    if (this.autoShowHelpOnFirstVisit) {
      const tHelp = setTimeout(() => scheduleFirstVisitHelp(), 1200);
      this.startupTimerIds.push(tHelp);
    }

    if (scene) {
      scene.executeWhenReady(() => {
        finalizeSceneInit();
      });
    } else {
      finalizeSceneInit();
    }
  }

  public setStartupProgress(percent: number, statusText?: string): void {
    if (this.startupLoaderBar) {
      this.startupLoaderBar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
    }
    if (statusText && this.startupLoaderText) {
      this.startupLoaderText.textContent = statusText;
    }
  }

  public showStartupLoader(statusText?: string): void {
    if (statusText && this.startupLoaderText) {
      this.startupLoaderText.textContent = statusText;
    }
    this.startupLoaderElement?.classList.remove('is-hidden');
  }

  public hideStartupLoader(): void {
    this.startupLoaderElement?.classList.add('is-hidden');
  }

  public showSceneLoader(
    title?: string,
    subtitle?: string,
    options?: { topHud?: boolean; showStop?: boolean }
  ): void {
    if (this.sceneLoaderTimerId) {
      clearTimeout(this.sceneLoaderTimerId);
      this.sceneLoaderTimerId = null;
    }
    const useTopHud = options?.topHud ?? this.isAIGenerating;
    const showStop = options?.showStop ?? this.isAIGenerating;
    this.sceneLoaderElement?.classList.toggle('is-top-hud', useTopHud);
    if (this.sceneLoaderStopBtn) {
      this.sceneLoaderStopBtn.style.display = showStop ? 'inline-flex' : 'none';
    }
    if (title && this.sceneLoaderTitle) {
      this.sceneLoaderTitle.textContent = title;
    }
    if (subtitle && this.sceneLoaderSub) {
      this.sceneLoaderSub.textContent = subtitle;
    }
    this.sceneLoaderElement?.classList.remove('is-hidden');
  }

  public hideSceneLoader(force: boolean = false): void {
    if (this.isAIGenerating && !force) return;
    this.sceneLoaderElement?.classList.add('is-hidden');
    if (this.sceneLoaderStopBtn) {
      this.sceneLoaderStopBtn.style.display = 'none';
    }
  }

  public stopAIGeneration(): void {
    this.aiAgentUI.stopAIGeneration();
  }

  private setAIGeneratingState(active: boolean): void {
    this.aiAgentUI.setAIGeneratingState(active);
  }

  /* =========================================================================
     CSG BOOLEAN SCULPTING HELPER METHODS
     ========================================================================= */
  public setCSGTargetFromSelected(): void {
    this.modelingPanelsUI.setCSGTargetFromSelected();
  }

  public setCSGToolFromSelected(): void {
    this.modelingPanelsUI.setCSGToolFromSelected();
  }

  public swapCSGMeshes(): void {
    this.modelingPanelsUI.swapCSGMeshes();
  }

  public addQuickCutter(shape: 'Box' | 'Cylinder' | 'Sphere'): void {
    this.modelingPanelsUI.addQuickCutter(shape);
  }

  public async performCSGOperation(op: 'subtract' | 'union' | 'intersect'): Promise<void> {
    await this.modelingPanelsUI.performCSGOperation(op);
  }

  public updateCSGGUI(): void {
    this.modelingPanelsUI.updateCSGGUI();
  }

  public initCSGBevelUI(): void {
    this.modelingPanelsUI.initCSGBevelUI();
  }

  public playAnimation(): void {
    this.modelingPanelsUI.playAnimation();
  }

  public pauseAnimation(): void {
    this.modelingPanelsUI.pauseAnimation();
  }

  public stopAnimation(): void {
    this.modelingPanelsUI.stopAnimation();
  }

  public selectAnimationGroup(name: string): void {
    this.modelingPanelsUI.selectAnimationGroup(name);
  }

  public setupAnimations(names: string[], currentGroup: any | null): void {
    this.modelingPanelsUI.setupAnimations(names, currentGroup);
  }

  private updateUVGUI(): void {
    this.inspectorGui.updateUVGUI();
  }

  private applyLiveUVTransform(): void {
    this.inspectorGui.applyLiveUVTransform();
  }

  private updateCreateShapeVisibility(shape: string): void {
    this.modelingPanelsUI.updateCreateShapeVisibility(shape);
  }

  public createPrimitiveMesh(): void {
    this.modelingPanelsUI.createPrimitiveMesh();
  }

  public startPrimitivePlacement(): void {
    this.modelingPanelsUI.startPrimitivePlacement();
  }

  private updateDropdownOptions(controller: dat.GUIController, options: string[], currentVal: string): void {
    this.modelingPanelsUI.updateDropdownOptions(controller, options, currentVal);
  }

  /* =========================================================================
     AI MESH AGENT UI (TEXT/IMAGE TO MESH & MESH UPDATE)
     ========================================================================= */
  public renderAISkills(): void {
    this.aiAgentUI.renderAISkills();
  }

  public renderAIToolSet(): void {
    this.aiAgentUI.renderAIToolSet();
  }

  /**
   * Refreshes the AI endpoint summary bar inside the AI Mesh Agent dialog.
   */
  public refreshAIEndpointBadge(): void {
    this.aiAgentUI.refreshAIEndpointBadge();
  }

  public copyToClipboard(text: string, button?: HTMLElement): void {
    this.aiAgentUI.copyToClipboard(text, button);
  }

  private initAIAgentUI(): void {
    this.aiAgentUI.initAIAgentUI();
  }

  private renderAIAttachments(): void {
    this.aiAgentUI.renderAIAttachments();
  }

  /**
   * Returns all available AI quick prompt presets.
   */
  public getQuickPrompts(): AIQuickPrompt[] {
    return this.aiAgentUI.getQuickPrompts();
  }

  /**
   * Initializes the AI Quick Prompts select-like dropdown menu from the JS array.
   * Renders a compact single-row GUI with rich thumbnails, tags, and reference image support.
   */
  private initAIQuickPrompts(): void {
    this.aiAgentUI.initAIQuickPrompts();
  }

  private escapeHtml(str: string): string {
    return this.aiAgentUI.escapeHtml(str);
  }

  private toggleSpeechRecognition(): void {
    this.aiAgentUI.toggleSpeechRecognition();
  }

  private stopSpeechRecognition(): void {
    this.aiAgentUI.stopSpeechRecognition();
  }

  public async runAIAgentPrompt(promptOverride?: string): Promise<void> {
    await this.aiAgentUI.runAIAgentPrompt(promptOverride);
  }

  /* =========================================================================
     VOXEL PAINTER UI & CONTROLS
     ========================================================================= */
  private initVoxelPainterUI(): void {
    this.voxelPainterUI.initVoxelPainterUI();
  }

  public renderVoxelAtlasOptions(): void {
    this.voxelPainterUI.renderVoxelAtlasOptions();
  }

  public renderVoxelPalette(): void {
    this.voxelPainterUI.renderVoxelPalette();
  }

  public renderVoxelTextureGallery(): void {
    this.voxelPainterUI.renderVoxelTextureGallery();
  }

  /* =========================================================================
     EMBEDDED TEXTURES & ATLAS OVERVIEW UI
     ========================================================================= */
  private initEmbeddedTexturesUI(): void {
    this.embeddedTexturesUI.initEmbeddedTexturesUI();
  }

  public renderActiveMaterialTextures(): void {
    this.embeddedTexturesUI.renderActiveMaterialTextures();
  }

  public renderEmbeddedTextures(): void {
    this.embeddedTexturesUI.renderEmbeddedTextures();
  }

  public renderAtlasTilePicker(atlasId: string): void {
    this.embeddedTexturesUI.renderAtlasTilePicker(atlasId);
  }

  /* =========================================================================
     PATH EXTRUSION & SPLINE STUDIO UI
     ========================================================================= */
  private initPathExtrusionUI(): void {
    this.pathExtrusionUI.initPathExtrusionUI();
  }

  private renderPathExtrusionUI(): void {
    this.pathExtrusionUI.renderPathExtrusionUI();
  }

  // Backward compatibility aliases
  private initPathWaysUI(): void {
    this.pathExtrusionUI.initPathWaysUI();
  }

  private renderPathWaysUI(): void {
    this.pathExtrusionUI.renderPathWaysUI();
  }

  /* =========================================================================
     COMPRESS MODEL EDITOR TOOL UI
     ========================================================================= */
  private initCompressModelUI(): void {
    this.compressModelUI.initCompressModelUI();
  }

  public updateCompressModelUI(): void {
    this.compressModelUI.updateCompressModelUI();
  }

  public triggerDownloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  /* =========================================================================
     SPECIALIZED TOOL PANEL UI DELEGATES
     ========================================================================= */
  public openSculptTool(): void {
    this.sculptUI.openSculptTool();
  }

  public closeSculptTool(): void {
    this.sculptUI.closeSculptTool();
  }

  public initSculptUI(): void {
    this.sculptUI.initSculptUI();
  }

  public updateSculptUI(): void {
    this.sculptUI.updateSculptUI();
  }

  public initUVUnwrapUI(): void {
    this.uvUnwrapUI.initUVUnwrapUI();
  }

  public updateUVUnwrapUI(): void {
    this.uvUnwrapUI.updateUVUnwrapUI();
  }

  public initBakingUI(): void {
    this.bakingUI.initBakingUI();
  }

  public updateBakingUI(): void {
    this.bakingUI.updateBakingUI();
  }

  public initRiggingUI(): void {
    this.riggingUI.initRiggingUI();
  }

  public updateRiggingUI(): void {
    this.riggingUI.updateRiggingUI();
  }

  public initAITextureUI(): void {
    this.aiTextureUI.initAITextureUI();
  }

  public updateAITextureUI(): void {
    this.aiTextureUI.updateAITextureUI();
  }

  public initTextMeshUI(): void {
    this.textMeshUI.initTextMeshUI();
  }

  public updateTextMeshUI(): void {
    this.textMeshUI.updateTextMeshUI();
  }

  public initDecalUI(): void {
    this.decalUI.initDecalUI();
  }

  public updateDecalUI(): void {
    this.decalUI.updateDecalUI();
  }

  public initTexturePaintUI(): void {
    initTexturePaintDialogUI(this);
  }

  public updateTexturePaintUI(): void {
    updateTexturePaintDialogUI(this);
  }

  public updateTexturePaintStencilOverlay(): void {
    updateTexturePaintStencilOverlayUI(this);
  }

  public openHeightmapPaintModal(initialTab: 'height' | 'mix' = 'height'): void {
    this.heightmapUI.openHeightmapPaintModal(initialTab);
  }

  public initHeightmapUI(): void {
    this.heightmapUI.initHeightmapUI();
  }

  public updateHeightmapUI(): void {
    this.heightmapUI.updateHeightmapUI();
  }

  public initGaussianSplatUI(): void {
    this.gaussianSplatUI.initGaussianSplatUI();
  }

  public updateGaussianSplatUI(): void {
    this.gaussianSplatUI.updateGaussianSplatUI();
  }
}
