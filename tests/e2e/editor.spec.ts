import { expect, test } from '@playwright/test';

test.describe('Mesh Editor E2E Tests', () => {
  test('1. boots the application, initializes WebGL scene, and registers <mesh-editor> Web Component', async ({
    page,
  }) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', (err) => pageErrors.push(err));

    await page.goto('/');

    // Verify core layout elements are visible
    await expect(page.locator('#top-toolbar')).toBeVisible();
    await expect(page.locator('#renderCanvas')).toBeVisible();
    await expect(page.locator('#dialog-outliner')).toBeVisible();
    await expect(page.locator('#bottom-bar')).toBeVisible();

    // Verify WebGL engine & custom element registration
    const isInitialized = await page.evaluate(() => {
      const app = (window as any).meshEditorApp;
      const customEl = customElements.get('mesh-editor');
      return Boolean(app && app.service && app.service.getScene() && customEl);
    });
    expect(isInitialized).toBe(true);
    expect(pageErrors).toHaveLength(0);
  });

  test('2. activates all tools by default on first run and creates a 3D primitive via Create Mesh dialog', async ({
    page,
  }) => {
    await page.goto('/');

    await expect(page.locator('#statsMeshes')).toHaveText('0');

    // On first execution, all tool dialogs are activated by default
    const createDialog = page.locator('#dialog-create-primitive');
    await expect(createDialog).toBeVisible();
    await expect(page.locator('#dialog-csg')).toBeVisible();
    await expect(page.locator('#dialog-facet')).toBeVisible();
    await expect(page.locator('#dialog-scene')).toBeVisible();
    await expect(page.locator('#dialog-mesh')).toBeVisible();
    await expect(page.locator('#dialog-material')).toBeVisible();
    await expect(page.locator('#dialog-anim')).toBeVisible();
    await expect(page.locator('#dialog-textures')).toBeVisible();

    // Verify startup and Babylon scene 3D mesh loaders are present in DOM
    await expect(page.locator('#appStartupLoader')).toBeAttached();
    await expect(page.locator('#sceneInitLoader')).toBeAttached();

    // Click the dat.GUI "Spawn at Origin" button inside #gui-create-container
    await createDialog.locator('.cr.function', { hasText: 'Spawn at Origin' }).click();

    // Verify mesh count increases to 1 and appears in Outliner
    await expect(page.locator('#statsMeshes')).toHaveText('1');
    await expect(page.locator('#outlinerTreeContainer')).toContainText('New_Mesh');
  });

  test('3. deletes a selected mesh and restores it using Undo / Redo', async ({ page }) => {
    await page.goto('/');

    // Spawn a mesh via the editor API
    await page.evaluate(() => {
      (window as any).meshEditorApp.service.createPrimitive({
        shape: 'Box',
        name: 'E2E_Box',
        size: 1,
        width: 1,
        height: 1,
        depth: 1,
        subdivisions: 1,
        tessellation: 16,
        color: '#4f8cf6',
      });
    });

    await expect(page.locator('#statsMeshes')).toHaveText('1');
    await expect(page.locator('#outlinerTreeContainer')).toContainText('E2E_Box');

    // Delete via Actions -> Delete Selected
    await page.locator('#btnDropdownActions').click();
    await page.locator('#btnDeleteSelected').click();

    await expect(page.locator('#statsMeshes')).toHaveText('0');

    // Undo deletion via toolbar Undo button
    const btnUndo = page.locator('#btnUndo');
    await expect(btnUndo).toBeEnabled();
    await btnUndo.click();

    await expect(page.locator('#statsMeshes')).toHaveText('1');
    await expect(page.locator('#outlinerTreeContainer')).toContainText('E2E_Box');

    // Redo deletion via toolbar Redo button
    const btnRedo = page.locator('#btnRedo');
    await expect(btnRedo).toBeEnabled();
    await btnRedo.click();

    await expect(page.locator('#statsMeshes')).toHaveText('0');
  });

  test('4. switches layout modes (Floating vs Stackpanel) and Gizmo modes', async ({ page }) => {
    await page.goto('/');

    // Switch to Stackpanel mode via View menu
    await page.locator('#btnDropdownView').click();
    await page.locator('#btnLayoutStack').click();
    await expect(page.locator('#btnLayoutStack')).toHaveClass(/active/);

    // Switch back to Floating mode via View menu
    await page.locator('#btnDropdownView').click();
    await page.locator('#btnLayoutFloating').click();
    await expect(page.locator('#btnLayoutFloating')).toHaveClass(/active/);

    // Switch Gizmo buttons
    await page.locator('#btnGizmoRotate').click();
    await expect(page.locator('#btnGizmoRotate')).toHaveClass(/active/);

    await page.locator('#btnGizmoScale').click();
    await expect(page.locator('#btnGizmoScale')).toHaveClass(/active/);

    await page.locator('#btnGizmoTranslate').click();
    await expect(page.locator('#btnGizmoTranslate')).toHaveClass(/active/);
  });

  test('5. opens and closes the Help & Keyboard Shortcuts modal', async ({ page }) => {
    await page.goto('/');

    const helpModal = page.locator('#helpModal');
    await expect(helpModal).not.toBeVisible();

    await page.locator('#btnHelp').click();
    await expect(helpModal).toBeVisible();

    await page.locator('#btnHelpDone').click();
    await expect(helpModal).not.toBeVisible();
  });

  test('6. Heightmap terrain supports post-creation AI textures and preserves textures on GLB export & reload', async ({
    page,
  }) => {
    await page.goto('/');

    const result = await page.evaluate(async () => {
      const app = (window as any).meshEditorApp;
      app.toggleDialog('dialog-heightmap', true);

      // 1. Create a heightmap terrain first
      await app.service.heightmapController.buildOrUpdateTerrainMesh({
        name: 'E2E_Island',
        preset: 'island',
        width: 80,
        height: 80,
        subdivisions: 24,
        maxHeight: 10,
      });

      // 2. Generate an AI texture AFTER creating the heightmap
      const aiItem = await app.service.aiTextureGenerator.generateTexture({
        prompt: 'Lush volcanic emerald moss',
        name: 'VolcanicEmeraldMoss',
        style: 'moss',
        size: 128,
        useAI: false,
      });

      const select1 = document.getElementById('heightmapTex1Select') as HTMLSelectElement;
      const aiOptionId = `ai_${aiItem.id}`;
      const hasAiOptionImmediately = Array.from(select1.options).some((o) => o.value === aiOptionId);

      // Assign AI texture to Slot 1
      await app.service.heightmapController.setTerrainTexture(1, aiOptionId, undefined, true);

      // 3. Export GLB and verify embedded texture & reload in WebGL
      const glbBlob = await app.service.exportToGLBBlob('e2e_island');
      const glbBuf = await glbBlob.arrayBuffer();
      const view = new DataView(glbBuf);
      const jsonLen = view.getUint32(12, true);
      const gltfJson = JSON.parse(new TextDecoder().decode(new Uint8Array(glbBuf, 20, jsonLen)));

      const file = new File([glbBuf], 'e2e_island.glb', { type: 'model/gltf-binary' });
      await app.service.loadFiles([file]);

      // Wait briefly for reloaded PBR texture image decode in WebGL
      await new Promise((r) => setTimeout(r, 150));
      const reloadedMesh = app.service.importedMeshes.find((m: any) => m.name !== '__root__' && m.getTotalVertices() > 0);
      const reloadedMat = reloadedMesh?.material;
      const albedoTex = reloadedMat?.albedoTexture;
      const texSize = albedoTex?.getSize?.() || { width: 0, height: 0 };

      // Check reloaded GLB texture is also selectable in Heightmap dropdowns
      const reloadedOptions = app.service.heightmapController.getAvailableTextures();

      return {
        hasAiOptionImmediately,
        glbImagesCount: gltfJson.images?.length ?? 0,
        glbHasBaseColorTexture: Boolean(gltfJson.materials?.[0]?.pbrMetallicRoughness?.baseColorTexture),
        reloadedHasAlbedoTexture: Boolean(albedoTex),
        reloadedTexWidth: texSize.width,
        reloadedTexHeight: texSize.height,
        reloadedHasSceneTextureInHeightmap: reloadedOptions.some((o: any) => o.category === 'scene'),
      };
    });

    expect(result.hasAiOptionImmediately).toBe(true);
    expect(result.glbImagesCount).toBeGreaterThanOrEqual(1);
    expect(result.glbHasBaseColorTexture).toBe(true);
    expect(result.reloadedHasAlbedoTexture).toBe(true);
    expect(result.reloadedTexWidth).toBe(512);
    expect(result.reloadedTexHeight).toBe(512);
    expect(result.reloadedHasSceneTextureInHeightmap).toBe(true);
  });

  test('7. organizes Tools menu into category submenus with keyboard navigation, hover safe-triangle, and narrow-screen fallback', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    const btnTools = page.locator('#btnDropdownTools');
    const menuTools = page.locator('#menuTools');

    // Open Tools menu and verify all 5 categories are present
    await btnTools.click();
    await expect(menuTools).toBeVisible();

    const expectedCategories = ['Generic', 'Materials', 'Creation', 'Optimization', 'Characters'];
    for (const cat of expectedCategories) {
      await expect(page.locator(`#btnToolCategory-${cat}`)).toBeVisible();
    }

    // Hover Generic to trigger submenu preview, then move diagonally toward Animation Player
    const genericTrigger = page.locator('#btnToolCategory-Generic');
    const genericSubmenu = page.locator('#menuToolsSubmenu-Generic');
    await genericTrigger.hover();
    await expect(genericSubmenu).toBeVisible({ timeout: 2000 });

    const triggerBox = (await genericTrigger.boundingBox())!;
    const animBtn = page.locator('#btnToggleAnimPanel');
    const animBox = (await animBtn.boundingBox())!;

    // Diagonal sweep across Materials / Creation triggers toward Animation Player inside Generic submenu
    await page.mouse.move(triggerBox.x + triggerBox.width * 0.5, triggerBox.y + triggerBox.height * 0.5);
    await page.mouse.move(
      (triggerBox.x + triggerBox.width + animBox.x) * 0.5,
      (triggerBox.y + animBox.y) * 0.5,
      { steps: 8 }
    );
    await page.mouse.move(animBox.x + animBox.width * 0.5, animBox.y + animBox.height * 0.5, { steps: 5 });
    await expect(genericSubmenu).toBeVisible();

    // Pressing Escape inside the hovered submenu closes only the submenu first, then a second Escape closes the Tools menu
    await page.keyboard.press('Escape');
    await expect(genericSubmenu).not.toBeVisible();
    await expect(menuTools).toBeVisible();
    await expect(genericTrigger).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(menuTools).not.toBeVisible();

    // Keyboard navigation: focus Tools button -> ArrowDown opens and enters -> ArrowRight opens submenu -> Escape closes one level
    await btnTools.focus();
    await page.keyboard.press('ArrowDown');
    await expect(menuTools).toBeVisible();
    await expect(genericTrigger).toBeFocused();

    await page.keyboard.press('ArrowDown'); // Materials
    const materialsTrigger = page.locator('#btnToolCategory-Materials');
    const materialsSubmenu = page.locator('#menuToolsSubmenu-Materials');
    await expect(materialsTrigger).toBeFocused();
    await expect(materialsSubmenu).toBeVisible();

    await page.keyboard.press('ArrowRight');
    await expect(materialsSubmenu.locator('.dropdown-item').first()).toBeFocused();

    await page.keyboard.press('Escape'); // Closes only Materials submenu, keeps Tools menu open
    await expect(materialsSubmenu).not.toBeVisible();
    await expect(menuTools).toBeVisible();
    await expect(materialsTrigger).toBeFocused();

    // Clicking a tool inside Creation submenu toggles its dialog and closes menus
    await page.locator('#btnToolCategory-Creation').click();
    const creationSubmenu = page.locator('#menuToolsSubmenu-Creation');
    await expect(creationSubmenu).toBeVisible();
    await page.locator('#btnToggleHeightmapTool').click();
    await expect(menuTools).not.toBeVisible();
    await expect(page.locator('#dialog-heightmap')).toBeVisible();

    // Narrow 375px viewport: submenu must never cover its trigger button
    await page.setViewportSize({ width: 375, height: 700 });
    await btnTools.click();
    await expect(menuTools).toBeVisible();
    const optTrigger = page.locator('#btnToolCategory-Optimization');
    const optSubmenu = page.locator('#menuToolsSubmenu-Optimization');
    await optTrigger.click();
    await expect(optSubmenu).toBeVisible();

    const narrowTriggerBox = (await optTrigger.boundingBox())!;
    const narrowSubmenuBox = (await optSubmenu.boundingBox())!;
    const overlapsTrigger =
      narrowSubmenuBox.x < narrowTriggerBox.x + narrowTriggerBox.width &&
      narrowSubmenuBox.x + narrowSubmenuBox.width > narrowTriggerBox.x &&
      narrowSubmenuBox.y < narrowTriggerBox.y + narrowTriggerBox.height &&
      narrowSubmenuBox.y + narrowSubmenuBox.height > narrowTriggerBox.y;
    expect(overlapsTrigger).toBe(false);
    expect(narrowSubmenuBox.x + narrowSubmenuBox.width).toBeLessThanOrEqual(375);
  });
});

