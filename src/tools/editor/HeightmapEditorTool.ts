import { AbstractEditorTool } from './AbstractEditorTool';

/**
 * Heightmap & 3-Texture Splat Terrain Tool.
 * Create and sculpt 3D terrain GroundMeshes from grayscale heightmaps with RGB mixmap splatting.
 */
export class HeightmapEditorTool extends AbstractEditorTool {
  public readonly name = 'heightmap_terrain';
  public readonly dialogId = 'dialog-heightmap';
  public readonly triggerButtonId = 'btnToggleHeightmapTool';
  public readonly menuId = 'menuTools';
  public readonly menuLabel = 'Heightmap Terrain';
  public readonly category = 'Creation';
  public readonly icon = 'mountain';
  public readonly order = 19;
  public readonly isExclusive3DTool = false;

  public readonly description =
    'Create and edit 3D terrain GroundMeshes from grayscale heightmaps with interactive brush painting (size & smoothness), RGB mix texture path splatting, and 3 individually assignable terrain textures.';

  public readonly helpText = `
    <h4><i class="app-icon" data-lucide="mountain"></i> Heightmap Terrain Tool</h4>
    <p>Generate mountains, islands, valleys, and textured terrain <code>GroundMesh</code> surfaces with 3-channel RGB splat mapping (<code>TerrainMaterial</code>).</p>
    <ul>
      <li><strong>Heightmap (Grayscale) Tab:</strong> Upload a grayscale heightmap image, apply a procedural terrain preset (<em>Island</em>, <em>Mountain Range</em>, <em>Volcano</em>, <em>Canyon</em>, <em>Dunes</em>), or click <strong>Paint / Edit Heightmap...</strong> to paint elevation in grayscale on a black ground using adjustable brush <strong>Size</strong> and <strong>Smoothness</strong>.</li>
      <li><strong>Mix Texture (RGB) Tab:</strong> Upload an RGB splat mix texture or paint directly onto the RGB channels (Red = Texture 1, Green = Texture 2 / Path, Blue = Texture 3) to carve roads, trails, or custom material zones.</li>
      <li><strong>3 Terrain Splat Textures:</strong> Assign each of the 3 diffuse textures individually from built-in terrain presets, AI/scene textures, or uploaded images. Selecting any texture immediately re-renders the terrain mesh.</li>
      <li><strong>Paint Editor OK:</strong> Clicking <strong>OK</strong> in the 2-tab Paint Editor commits your grayscale heightmap and RGB mixmap changes and immediately redraws the 3D terrain mesh in the viewport.</li>
    </ul>
  `.trim();

  public onOpen(app: any): void {
    app.updateHeightmapUI?.();
  }

  public onUpdateUI(app: any): void {
    app.updateHeightmapUI?.();
  }
}

