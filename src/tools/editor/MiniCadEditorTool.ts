import { AbstractEditorTool } from './AbstractEditorTool';

/**
 * MiniCAD Studio Tool.
 * Beginner-friendly direct CAD modeling with Click-on-Face placement, Push/Pull resizing,
 * Figma-style live smart guides, hardware hole presets, non-destructive shell/bevel recipes,
 * printability inspection, woodwork cut lists, and true-millimeter STL export.
 */
export class MiniCadEditorTool extends AbstractEditorTool {
  public readonly name = 'minicad';
  public readonly dialogId = 'dialog-minicad';
  public readonly triggerButtonId = 'btnToggleMiniCad';
  public readonly menuId = 'menuTools';
  public readonly menuLabel = 'MiniCAD Studio';
  public readonly category = 'Creation';
  public readonly icon = 'ruler';
  public readonly order = 3;
  public readonly isExclusive3DTool = true;
  public readonly defaultOpen = false;
  public readonly description =
    'Beginner-friendly direct CAD modeling with Click-on-Face construction, live Push/Pull dimensions, Figma-style alignment guides, hardware hole presets, and true-mm STL export.';

  public readonly helpText = `
<h4><i class="app-icon" data-lucide="info"></i> Overview</h4>
<p><strong>MiniCAD Studio</strong> transforms the 3D viewport into a beginner-friendly, precision CAD workspace without complex 2D sketch constraint trees. Choose a workflow profile (<strong>3D Print</strong>, <strong>Woodwork</strong>, or <strong>Mechanics</strong>) and model directly on surfaces with real millimeter dimensions.</p>

<h4><i class="app-icon" data-lucide="mouse-pointer"></i> Viewport Modes (Exclusive 3D Interaction)</h4>
<ul>
  <li><strong>Select &amp; Align:</strong> Drag parts smoothly on their horizontal plane with grid &amp; magnetic center/edge snapping and live Figma-style distance badges. Edit <code>W / H / D</code> inline in the top viewport HUD.</li>
  <li><strong>Push / Pull Face:</strong> Hover any face and drag along its normal to resize the part non-destructively while keeping the opposite face anchored.</li>
  <li><strong>Place Box / Cylinder:</strong> Click on the floor or directly on any existing mesh face to attach a new part flush onto that surface.</li>
  <li><strong>Punch Hole:</strong> Click any face to punch a non-destructive hardware hole (M2&ndash;M6, Countersunk M3/M4, 8&nbsp;mm Dowel, Cable Pass, Slot) or enable <em>2&times;2 Symmetric Corners</em> for instant mounting plates.</li>
</ul>

<h4><i class="app-icon" data-lucide="sparkles"></i> Non-Destructive Recipe &amp; Checks</h4>
<ul>
  <li><strong>Parametric Stack:</strong> Dimensions, Shell wall thickness, Holes, and Bevels stay editable and removable in the Feature Stack.</li>
  <li><strong>Printability &amp; Cut List:</strong> Inspect watertight manifold status, wall thickness, volume (cm&sup3;), or generate a sorted Woodwork Cut List (<code>L &times; W &times; T</code>).</li>
  <li><strong>Export STL (True mm):</strong> Exports your model scaled 1:1 to true millimeters for 3D slicers.</li>
</ul>
`.trim();

  public isActive(app: any): boolean {
    return !!app?.service?.miniCadController?.isActive;
  }

  public onActivate(app: any): void {
    app.service?.miniCadController?.setActive(true);
    app.updateMiniCadUI?.();
    app.updatePanelButtonStates?.();
  }

  public onDeactivate(app: any): void {
    app.service?.miniCadController?.setActive(false);
    app.updateMiniCadUI?.();
    app.updatePanelButtonStates?.();
  }

  public onOpen(app: any): void {
    this.onActivate(app);
    app.showToast?.('MiniCAD Studio active. Hover any face to align, push/pull, or punch holes.', 'info');
  }

  public onClose(app: any): void {
    this.onDeactivate(app);
  }

  public onMinimize(app: any): void {
    this.onDeactivate(app);
  }

  public onMaximize(app: any): void {
    this.onActivate(app);
  }

  public onUpdateUI(app: any): void {
    app.updateMiniCadUI?.();
  }
}
