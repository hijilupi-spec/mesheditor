import { AbstractEditorTool } from './AbstractEditorTool';

export class TexturePaintEditorTool extends AbstractEditorTool {
  public readonly name = 'texture_painter';
  public readonly dialogId = 'dialog-texture-paint';
  public readonly triggerButtonId = 'btnToggleTexturePaintTool';
  public readonly menuId = 'menuTools';
  public readonly menuLabel = '3D Texture Painter';
  public readonly category = 'Materials';
  public readonly icon = 'paintbrush';
  public readonly order = 11;
  public readonly isExclusive3DTool = true;

  public readonly description =
    'Hand-paint 3D UV textures directly onto meshes across UV seams with multi-layer blending, PBR channels (Albedo, Roughness, Metallic, Emissive), stylized AO/gradient base shading, 2D UV editing, and camera stencil projection.';

  public readonly helpText = `
    <h4>3D Texture Painter</h4>
    <p>Paint stylized or PBR textures directly on 3D meshes in the viewport or on the 2D UV canvas.</p>
    <ul>
      <li><strong>Left-Drag on Mesh:</strong> Paints seamlessly across UV seams using 3D sphere projection with automatic UV edge padding (bleed).</li>
      <li><strong>Alt + Click (or Eyedropper):</strong> Samples the painted color from the surface under your cursor.</li>
      <li><strong>X-Symmetry:</strong> Mirrors brush strokes across the mesh center X-axis for faces, characters, and props.</li>
      <li><strong>Stylized Base:</strong> One-click hand-painted vertical gradient + soft hemisphere AO + convex edge highlights (ideal for Nintendo-style low-poly assets).</li>
      <li><strong>Layers &amp; PBR Channels:</strong> Stack layers with blend modes (Normal, Multiply, Overlay, Screen, Soft Light, Add) and switch between Albedo, Roughness, Metallic, and Emissive channels.</li>
      <li><strong>Stencil Projection:</strong> Load any image or scene texture as a viewport overlay, align it over the mesh, and brush through it (or click Project Whole Stencil) to transfer crisp artwork directly into the UV map.</li>
    </ul>
  `;

  public isActive(app: any): boolean {
    return Boolean(app.service?.texturePaintController?.isActive);
  }

  public onActivate(app: any): void {
    app.service?.texturePaintController?.setActive(true);
    app.updatePanelButtonStates?.();
    app.updateTexturePaintUI?.();
  }

  public onDeactivate(app: any): void {
    app.service?.texturePaintController?.setActive(false);
    app.updatePanelButtonStates?.();
    app.updateTexturePaintUI?.();
  }

  public onOpen(app: any): void {
    this.onActivate(app);
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
    app.updateTexturePaintUI?.();
  }
}
