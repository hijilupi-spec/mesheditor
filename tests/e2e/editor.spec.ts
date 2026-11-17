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

  test('8. opens Settings dialog from toolbar right of Shortcuts and persists settings in localStorage', async ({
    page,
  }) => {
    test.setTimeout(60000);
    await page.goto('/');

    const btnHelp = page.locator('#btnHelp');
    const btnSettings = page.locator('#btnSettings');
    await expect(btnHelp).toBeVisible();
    await expect(btnSettings).toBeVisible();

    const helpBox = (await btnHelp.boundingBox())!;
    const settingsBox = (await btnSettings.boundingBox())!;
    expect(settingsBox.x).toBeGreaterThan(helpBox.x);

    // Scene & Environment should no longer render the 5 moved settings
    const sceneText = await page.locator('#gui-scene-container').textContent();
    expect(sceneText).toContain('Background');
    expect(sceneText).toContain('Ambient Light');
    expect(sceneText).toContain('Sun Light');
    expect(sceneText).not.toContain('Grid visible');
    expect(sceneText).not.toContain('Camera Speed');
    expect(sceneText).not.toContain('Move Snap');

    // Open Settings modal and verify 70vw width + Editing / AI tabs
    const settingsModal = page.locator('#settingsModal');
    await expect(settingsModal).not.toBeVisible();
    await expect(page.locator('#btnAISettingsToggle')).toHaveCount(0);
    await btnSettings.click();
    await expect(settingsModal).toBeVisible();

    const viewport = page.viewportSize()!;
    await expect(async () => {
      const modalBox = (await settingsModal.boundingBox())!;
      expect(modalBox.width).toBeGreaterThan(viewport.width * 0.68);
      expect(modalBox.width).toBeLessThanOrEqual(viewport.width * 0.72);
    }).toPass();

    await expect(page.locator('#settingsTabBtnEditing')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#settingsTabBtnAI')).toHaveAttribute('aria-selected', 'false');

    // Update Editing settings
    await page.locator('#settingGridVisible').uncheck();
    await page.locator('#settingGridSizeNum').fill('60');
    await page.locator('#settingGridSizeNum').dispatchEvent('change');
    await page.locator('#settingCameraSpeedNum').fill('1.1');
    await page.locator('#settingCameraSpeedNum').dispatchEvent('change');
    await page.locator('#settingMoveSnapNum').fill('0.25');
    await page.locator('#settingMoveSnapNum').dispatchEvent('change');
    await page.locator('#settingRotateSnapNum').fill('15');
    await page.locator('#settingRotateSnapNum').dispatchEvent('change');

    // Switch to AI tab, verify scrollable body, and update AI settings
    await page.locator('#settingsTabBtnAI').click();
    await expect(page.locator('#settingsTabBtnAI')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#aiEndpointUrlInput')).toBeVisible();

    const scrollMetrics = await page.locator('#settingsModalBody').evaluate((el) => ({
      overflowY: getComputedStyle(el).overflowY,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }));
    expect(scrollMetrics.overflowY).toBe('auto');
    expect(scrollMetrics.scrollHeight).toBeGreaterThanOrEqual(scrollMetrics.clientHeight);

    await page.locator('#aiEndpointUrlInput').fill('https://e2e-llm.example.com/v1');
    await page.locator('#aiEndpointUrlInput').dispatchEvent('change');
    await page.locator('#aiApiKeyInput').fill('sk-e2e-key');
    await page.locator('#aiApiKeyInput').dispatchEvent('change');

    await page.locator('#btnSettingsDone').click();
    await expect(settingsModal).not.toBeVisible();

    // Reload page and confirm persistence from localStorage for both Editing and AI tabs
    await page.reload();
    await page.locator('#btnSettings').click();
    await expect(settingsModal).toBeVisible();

    await expect(page.locator('#settingGridVisible')).not.toBeChecked();
    await expect(page.locator('#settingGridSizeNum')).toHaveValue('60');
    await expect(page.locator('#settingCameraSpeedNum')).toHaveValue('1.1');
    await expect(page.locator('#settingMoveSnapNum')).toHaveValue('0.25');
    await expect(page.locator('#settingRotateSnapNum')).toHaveValue('15');

    await page.locator('#settingsTabBtnAI').click();
    await expect(page.locator('#aiEndpointUrlInput')).toHaveValue('https://e2e-llm.example.com/v1');
    await expect(page.locator('#aiApiKeyInput')).toHaveValue('sk-e2e-key');
  });

  test('10. imports a textured Collada (.dae) model together with companion textures in one batch', async ({
    page,
  }) => {
    await page.goto('/');

    const result = await page.evaluate(async () => {
      const app = (window as any).meshEditorApp;

      // Create a 64x64 real PNG texture file in the browser
      const texCanvas = document.createElement('canvas');
      texCanvas.width = 64;
      texCanvas.height = 64;
      const ctx = texCanvas.getContext('2d')!;
      ctx.fillStyle = '#cc5522';
      ctx.fillRect(0, 0, 64, 64);
      ctx.fillStyle = '#33aa66';
      ctx.fillRect(0, 0, 32, 32);

      const pngBlob: Blob = await new Promise((resolve) =>
        texCanvas.toBlob((b) => resolve(b!), 'image/png')
      );
      const texFile = new File([pngBlob], 'crate_diffuse.png', { type: 'image/png' });

      const daeXml = `<?xml version="1.0" encoding="utf-8"?>
<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">
  <asset>
    <unit name="meter" meter="1.0"/>
    <up_axis>Y_UP</up_axis>
  </asset>
  <library_images>
    <image id="crate_img" name="crate_img">
      <init_from>textures/crate_diffuse.png</init_from>
    </image>
  </library_images>
  <library_effects>
    <effect id="Mat-effect">
      <profile_COMMON>
        <newparam sid="crate_surface">
          <surface type="2D"><init_from>crate_img</init_from></surface>
        </newparam>
        <newparam sid="crate_sampler">
          <sampler2D><source>crate_surface</source></sampler2D>
        </newparam>
        <technique sid="common">
          <phong>
            <diffuse><texture texture="crate_sampler" texcoord="UVMap"/></diffuse>
          </phong>
        </technique>
      </profile_COMMON>
    </effect>
  </library_effects>
  <library_materials>
    <material id="Mat-material" name="DaeCrateMat">
      <instance_effect url="#Mat-effect"/>
    </material>
  </library_materials>
  <library_geometries>
    <geometry id="Quad-mesh" name="QuadMesh">
      <mesh>
        <source id="Quad-pos">
          <float_array id="Quad-pos-array" count="12">0 0 0 1 0 0 1 1 0 0 1 0</float_array>
          <technique_common>
            <accessor source="#Quad-pos-array" count="4" stride="3">
              <param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/>
            </accessor>
          </technique_common>
        </source>
        <source id="Quad-norm">
          <float_array id="Quad-norm-array" count="3">0 0 1</float_array>
          <technique_common>
            <accessor source="#Quad-norm-array" count="1" stride="3">
              <param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/>
            </accessor>
          </technique_common>
        </source>
        <source id="Quad-uv">
          <float_array id="Quad-uv-array" count="8">0 0 1 0 1 1 0 1</float_array>
          <technique_common>
            <accessor source="#Quad-uv-array" count="4" stride="2">
              <param name="S" type="float"/><param name="T" type="float"/>
            </accessor>
          </technique_common>
        </source>
        <vertices id="Quad-vert">
          <input semantic="POSITION" source="#Quad-pos"/>
        </vertices>
        <triangles material="Mat-material" count="2">
          <input semantic="VERTEX" source="#Quad-vert" offset="0"/>
          <input semantic="NORMAL" source="#Quad-norm" offset="1"/>
          <input semantic="TEXCOORD" source="#Quad-uv" offset="2" set="0"/>
          <p>0 0 0 1 0 1 2 0 2 0 0 0 2 0 2 3 0 3</p>
        </triangles>
      </mesh>
    </geometry>
  </library_geometries>
  <library_visual_scenes>
    <visual_scene id="Scene" name="Scene">
      <node id="QuadNode" name="QuadNode" type="NODE">
        <instance_geometry url="#Quad-mesh">
          <bind_material>
            <technique_common>
              <instance_material symbol="Mat-material" target="#Mat-material">
                <bind_vertex_input semantic="UVMap" input_semantic="TEXCOORD" input_set="0"/>
              </instance_material>
            </technique_common>
          </bind_material>
        </instance_geometry>
      </node>
    </visual_scene>
  </library_visual_scenes>
  <scene><instance_visual_scene url="#Scene"/></scene>
</COLLADA>`;

      const daeFile = new File([daeXml], 'textured_crate.dae', { type: 'model/vnd.collada+xml' });

      // 1. Open (.dae + .png together in one batch)
      await app.service.loadFiles([daeFile, texFile]);
      await new Promise((r) => setTimeout(r, 150));

      const openMesh = app.service.importedMeshes.find((m: any) => m.name !== '__root__' && m.getTotalVertices() > 0);
      const openAlbedo = openMesh?.material?.albedoTexture;
      const openTexSize = openAlbedo?.getSize?.() || { width: 0, height: 0 };

      // 2. Import / Append a second .dae + .png batch into the existing scene
      const daeFile2 = new File([daeXml], 'second_crate.dae', { type: 'model/vnd.collada+xml' });
      await app.service.importFiles([daeFile2, texFile]);
      await new Promise((r) => setTimeout(r, 150));

      const geoMeshesAfterImport = app.service.importedMeshes.filter(
        (m: any) => m.name !== '__root__' && m.getTotalVertices() > 0
      );

      return {
        currentFilename: app.service.currentFilename,
        openMeshVertices: openMesh?.getTotalVertices() ?? 0,
        openHasAlbedo: Boolean(openAlbedo),
        openTexWidth: openTexSize.width,
        openTexHeight: openTexSize.height,
        geoMeshCountAfterImport: geoMeshesAfterImport.length,
        hasSecondGroup: app.service.groups.some((g: any) => g.name.startsWith('second_crate_group_')),
        modelAcceptAttr: document.getElementById('modelFileInput')?.getAttribute('accept') || '',
        importAcceptAttr: document.getElementById('importFileInput')?.getAttribute('accept') || '',
      };
    });

    expect(result.openMeshVertices).toBeGreaterThanOrEqual(4);
    expect(result.openHasAlbedo).toBe(true);
    expect(result.openTexWidth).toBe(64);
    expect(result.openTexHeight).toBe(64);
    expect(result.geoMeshCountAfterImport).toBeGreaterThanOrEqual(2);
    expect(result.hasSecondGroup).toBe(true);
    expect(result.modelAcceptAttr).toContain('.dae');
    expect(result.importAcceptAttr).toContain('.dae');
  });

  test('13. keeps stackpanel panel widths stable when scrollbar activates and toggles drawer collapse', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');

    // Ensure stackpanel mode is active
    await page.locator('#btnDropdownView').click();
    await page.locator('#btnLayoutStack').click();

    // Measure panel width when sidebar does NOT overflow (single minimized panel)
    const widthInfo = await page.evaluate(() => {
      const app = (window as any).meshEditorApp;
      const sidebar = document.getElementById('stackpanelRightSidebar')!;
      const dialogs = Array.from(sidebar.querySelectorAll(':scope > .floating-dialog')) as HTMLElement[];

      // Minimize all open dialogs first so sidebar does NOT overflow
      for (const d of dialogs) {
        if (d.style.display !== 'none') {
          app.toggleDialogMinimize(d, true);
        }
      }
      const firstVisible = dialogs.find((d) => d.style.display !== 'none')!;
      const noScrollOverflow = sidebar.scrollHeight > sidebar.clientHeight;
      const widthWithoutScroll = firstVisible.getBoundingClientRect().width;

      // Expand a tall panel (and open more if needed) so sidebar DOES overflow and scrollbar activates
      app.toggleDialog('dialog-ai-agent', true);
      app.toggleDialog('dialog-material', true);
      app.toggleDialogMinimize(firstVisible, false);
      // Force enough height if viewport is tall
      sidebar.style.maxHeight = '220px';
      const hasScrollOverflow = sidebar.scrollHeight > sidebar.clientHeight;
      const widthWithScroll = firstVisible.getBoundingClientRect().width;
      sidebar.style.maxHeight = '';

      return {
        noScrollOverflow,
        hasScrollOverflow,
        widthWithoutScroll,
        widthWithScroll,
      };
    });

    expect(widthInfo.noScrollOverflow).toBe(false);
    expect(widthInfo.hasScrollOverflow).toBe(true);
    expect(widthInfo.widthWithScroll).toBe(widthInfo.widthWithoutScroll);

    // Test unobtrusive stackpanel drawer toggle
    const drawerToggle = page.locator('#btnStackpanelDrawerToggle');
    const sidebar = page.locator('#stackpanelRightSidebar');
    await expect(drawerToggle).toBeVisible();
    await expect(drawerToggle).toHaveAttribute('aria-expanded', 'true');

    await drawerToggle.click();
    await expect(drawerToggle).toHaveAttribute('aria-expanded', 'false');
    await expect(sidebar).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('body')).toHaveClass(/stackpanel-drawer-collapsed/);

    // Expand drawer again
    await drawerToggle.click();
    await expect(drawerToggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('body')).not.toHaveClass(/stackpanel-drawer-collapsed/);
  });
});

