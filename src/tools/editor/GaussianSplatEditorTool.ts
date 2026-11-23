import { AbstractEditorTool } from './AbstractEditorTool';

/**
 * Gaussian Splatting Tool.
 * Import, inspect, generate, clean up, convert from meshes, merge, and export 3D Gaussian Splatting clouds.
 */
export class GaussianSplatEditorTool extends AbstractEditorTool {
  public readonly name = 'gaussian_splatting';
  public readonly dialogId = 'dialog-gaussian-splat';
  public readonly triggerButtonId = 'btnToggleGaussianSplatTool';
  public readonly menuId = 'menuTools';
  public readonly menuLabel = 'Gaussian Splatting';
  public readonly category = 'Creation';
  public readonly icon = 'chart-bell-curve';
  public readonly order = 20;
  public readonly isExclusive3DTool = false;

  public readonly description =
    'Import (.splat, .ply, .spz, .sog), generate volumetric splat presets, convert triangle meshes to splats, clean floaters, tune SH/pixel rendering, merge clouds, and export .splat or .ply files.';

  public readonly helpText = `
    <h4><i class="app-icon" data-lucide="chart-bell-curve"></i> Gaussian Splatting Studio</h4>
    <p>Work with 3D Gaussian Splatting clouds (<code>GaussianSplattingMesh</code>) alongside standard polygon meshes in the same Babylon.js scene.</p>
    <ul>
      <li><strong>Import (.splat / .ply / .spz / .sog):</strong> Loads Gaussian Splat files with <code>keepInRam</code> enabled so you can clean, crop, transform, and re-export them.</li>
      <li><strong>Volumetric Presets &amp; Mesh &rarr; Splats:</strong> Generate procedural splat clouds (<em>Cloud</em>, <em>Foliage</em>, <em>Campfire</em>, <em>Galaxy</em>, <em>Nebula</em>, <em>Bush</em>) or sample any triangle mesh into an organic Gaussian Splat cloud.</li>
      <li><strong>Render Tuning:</strong> Adjust Spherical Harmonics (<code>shDegree</code>), cull tiny sub-pixel splats via <strong>Min Pixel Size</strong>, or toggle depth sorting and IBL shadow rotation textures.</li>
      <li><strong>Cleanup &amp; Crop:</strong> Remove noisy floaters using <strong>Min Opacity</strong>, <strong>Max Splat Scale</strong>, spherical <strong>Crop Radius</strong>, or uniform decimation.</li>
      <li><strong>Transform &amp; Export:</strong> Bake world transforms directly into splat coordinates, align the base to <code>Y = 0</code>, merge multiple splat clouds, and export to binary <code>.splat</code> or <code>.ply</code>.</li>
    </ul>
  `.trim();

  public onOpen(app: any): void {
    app.updateGaussianSplatUI?.();
  }

  public onUpdateUI(app: any): void {
    app.updateGaussianSplatUI?.();
  }
}
