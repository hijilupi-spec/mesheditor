import { MeshBuilder, NullEngine, Vector3 } from '@babylonjs/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MeshEditorApp } from '../../src/MeshEditorApp';
import { computeCrc32, createZipArchive } from '../../src/utils/zipBuilder';

/**
 * Minimal PKZIP central directory parser for verifying generated ZIP archives in tests.
 */
function parseZipEntries(zipBytes: Uint8Array): Array<{ name: string; data: Uint8Array; crc32: number }> {
  const view = new DataView(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength);
  const decoder = new TextDecoder();

  // Locate End of Central Directory (0x06054b50)
  let eocdOffset = -1;
  for (let i = zipBytes.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  expect(eocdOffset).toBeGreaterThanOrEqual(0);

  const entryCount = view.getUint16(eocdOffset + 10, true);
  const centralDirOffset = view.getUint32(eocdOffset + 16, true);

  const result: Array<{ name: string; data: Uint8Array; crc32: number }> = [];
  let ptr = centralDirOffset;
  for (let i = 0; i < entryCount; i++) {
    expect(view.getUint32(ptr, true)).toBe(0x02014b50);
    const crc32 = view.getUint32(ptr + 16, true);
    const compSize = view.getUint32(ptr + 20, true);
    const uncompSize = view.getUint32(ptr + 24, true);
    const nameLen = view.getUint16(ptr + 28, true);
    const extraLen = view.getUint16(ptr + 30, true);
    const commentLen = view.getUint16(ptr + 32, true);
    const localHeaderOffset = view.getUint32(ptr + 42, true);

    expect(compSize).toBe(uncompSize);
    const name = decoder.decode(zipBytes.slice(ptr + 46, ptr + 46 + nameLen));

    expect(view.getUint32(localHeaderOffset, true)).toBe(0x04034b50);
    const localNameLen = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const data = zipBytes.slice(dataStart, dataStart + uncompSize);

    expect(computeCrc32(data)).toBe(crc32);
    result.push({ name, data, crc32 });

    ptr += 46 + nameLen + extraLen + commentLen;
  }

  return result;
}

describe('Capture Screenshot Action & Multi-Direction ZIP Export', () => {
  let container: HTMLDivElement;
  let engine: NullEngine;
  let app: MeshEditorApp;

  const mockJpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9]);
  const mockJpegDataUrl = 'data:image/jpeg;base64,' + btoa(String.fromCharCode(...mockJpegBytes));

  beforeEach(() => {
    localStorage.clear();
    container = document.createElement('div');
    container.id = 'test-host';
    document.body.appendChild(container);
    engine = new NullEngine();
    app = new MeshEditorApp({
      container,
      engine,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    app.dispose();
    container.remove();
  });

  it('builds a valid uncompressed PKZIP archive with accurate CRC-32 checksums', () => {
    const fileA = new Uint8Array([1, 2, 3, 4, 5]);
    const fileB = new TextEncoder().encode('hello-mesh-editor');
    const archive = createZipArchive([
      { name: 'view_01.jpg', data: fileA },
      { name: 'view_02.jpg', data: fileB },
    ]);

    const parsed = parseZipEntries(archive);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].name).toBe('view_01.jpg');
    expect(Array.from(parsed[0].data)).toEqual(Array.from(fileA));
    expect(parsed[1].name).toBe('view_02.jpg');
    expect(Array.from(parsed[1].data)).toEqual(Array.from(fileB));
  });

  it('opens the screenshot dialog from Actions menu and via Cmd+P / Ctrl+P', () => {
    const modal = container.querySelector('#screenshotModal') as HTMLDialogElement;
    const menuBtn = container.querySelector('#btnCaptureScreenshot') as HTMLButtonElement;
    expect(modal).not.toBeNull();
    expect(menuBtn).not.toBeNull();
    expect(modal.hasAttribute('open')).toBe(false);

    // Open via Actions menu button
    menuBtn.click();
    expect(modal.open || modal.hasAttribute('open')).toBe(true);

    // Close via Escape
    app.closeScreenshotDialog();
    expect(modal.open || modal.hasAttribute('open')).toBe(false);

    // Open via Cmd+P
    const cmdPEvent = new KeyboardEvent('keydown', { key: 'p', metaKey: true, cancelable: true, bubbles: true });
    window.dispatchEvent(cmdPEvent);
    expect(cmdPEvent.defaultPrevented).toBe(true);
    expect(modal.open || modal.hasAttribute('open')).toBe(true);

    // Close and open via Ctrl+P
    app.closeScreenshotDialog();
    const ctrlPEvent = new KeyboardEvent('keydown', { key: 'p', ctrlKey: true, cancelable: true, bubbles: true });
    window.dispatchEvent(ctrlPEvent);
    expect(ctrlPEvent.defaultPrevented).toBe(true);
    expect(modal.open || modal.hasAttribute('open')).toBe(true);
  });

  it('pre-fills filename when available and leaves empty for custom entry otherwise', () => {
    const input = container.querySelector('#screenshotFilenameInput') as HTMLInputElement;

    // 1. Empty scene: no name pre-filled
    app.openScreenshotDialog();
    expect(input.value).toBe('');
    app.closeScreenshotDialog();

    // 2. Mesh selected without loaded file: uses selected mesh name
    const box = MeshBuilder.CreateBox('treasure_chest', { size: 1 }, app.service.scene);
    app.service.importedMeshes.push(box);
    app.service.selectMesh(box);
    app.openScreenshotDialog();
    expect(input.value).toBe('treasure_chest');
    app.closeScreenshotDialog();

    // 3. Loaded file name takes precedence
    app.service.currentFilename = 'ancient_temple.glb';
    app.openScreenshotDialog();
    expect(input.value).toBe('ancient_temple');
    app.closeScreenshotDialog();
  });

  it('captures a single JPG in Current Perspective mode with the grid hidden and closes dialog on OK', async () => {
    const box = MeshBuilder.CreateBox('hero_cube', { size: 2 }, app.service.scene);
    box.position.set(0, 1, 0);
    app.service.importedMeshes.push(box);
    app.service.setGridVisible(true);

    const gridStatesDuringCapture: boolean[] = [];
    const canvas = app.service.canvas;
    vi.spyOn(canvas, 'toDataURL').mockImplementation(() => {
      gridStatesDuringCapture.push(app.service.gridMesh.isEnabled());
      return mockJpegDataUrl;
    });

    const downloads: Array<{ blob: Blob; filename: string }> = [];
    vi.spyOn(app as any, 'triggerDownloadBlob').mockImplementation((blob: Blob, filename: string) => {
      downloads.push({ blob, filename });
    });

    app.openScreenshotDialog();
    const input = container.querySelector('#screenshotFilenameInput') as HTMLInputElement;
    input.value = 'my_render';

    const modal = container.querySelector('#screenshotModal') as HTMLDialogElement;
    const okBtn = container.querySelector('#btnConfirmScreenshot') as HTMLButtonElement;
    okBtn.click();

    expect(modal.open || modal.hasAttribute('open')).toBe(false);
    expect(gridStatesDuringCapture).toEqual([false]);
    expect(app.service.gridMesh.isEnabled()).toBe(true);
    expect(downloads).toHaveLength(1);
    expect(downloads[0].filename).toBe('my_render.jpg');
    expect(downloads[0].blob.type).toBe('image/jpeg');
    const downloadedBytes = new Uint8Array(await downloads[0].blob.arrayBuffer());
    expect(Array.from(downloadedBytes)).toEqual(Array.from(mockJpegBytes));
  });

  it('captures 4 Directions (current + 3 x 90 deg) in a ZIP at equal distance & elevation with grid hidden', async () => {
    const box = MeshBuilder.CreateBox('statue', { size: 2 }, app.service.scene);
    box.position.set(0, 1, 0);
    app.service.importedMeshes.push(box);
    app.service.setGridVisible(true);

    const cam = app.service.camera;
    cam.position.set(0, 3, -5);
    cam.setTarget(new Vector3(0, 1, 0));
    const origPos = cam.position.clone();
    const origRot = cam.rotation.clone();

    const capturedCameraPos: Vector3[] = [];
    const capturedGridStates: boolean[] = [];

    vi.spyOn(app.service.canvas, 'toDataURL').mockImplementation(() => {
      capturedCameraPos.push(cam.position.clone());
      capturedGridStates.push(app.service.gridMesh.isEnabled());
      return mockJpegDataUrl;
    });

    const downloads: Array<{ blob: Blob; filename: string }> = [];
    vi.spyOn(app as any, 'triggerDownloadBlob').mockImplementation((blob: Blob, filename: string) => {
      downloads.push({ blob, filename });
    });

    app.openScreenshotDialog();
    const option4 = container.querySelector('.screenshot-mode-option[data-mode="4-directions"]') as HTMLElement;
    option4.click();
    expect(container.querySelector('#screenshotExtensionBadge')?.textContent).toBe('.zip');

    const input = container.querySelector('#screenshotFilenameInput') as HTMLInputElement;
    input.value = 'statue_turn';

    (container.querySelector('#btnConfirmScreenshot') as HTMLButtonElement).click();

    expect(capturedCameraPos).toHaveLength(4);
    expect(capturedGridStates).toEqual([false, false, false, false]);
    expect(app.service.gridMesh.isEnabled()).toBe(true);

    // Camera restored to exact starting pose
    expect(cam.position.x).toBeCloseTo(origPos.x, 4);
    expect(cam.position.y).toBeCloseTo(origPos.y, 4);
    expect(cam.position.z).toBeCloseTo(origPos.z, 4);
    expect(cam.rotation.x).toBeCloseTo(origRot.x, 4);
    expect(cam.rotation.y).toBeCloseTo(origRot.y, 4);

    // Verify positions around pivot (0, 1, 0): distance = 5 in XZ, Y = 3
    const pivot = new Vector3(0, 1, 0);
    for (const pos of capturedCameraPos) {
      expect(pos.y).toBeCloseTo(3, 4);
      expect(Vector3.Distance(pos, pivot)).toBeCloseTo(Math.hypot(5, 2), 4);
    }
    expect(capturedCameraPos[0].x).toBeCloseTo(0, 4);
    expect(capturedCameraPos[0].z).toBeCloseTo(-5, 4);
    expect(capturedCameraPos[1].x).toBeCloseTo(-5, 4);
    expect(capturedCameraPos[1].z).toBeCloseTo(0, 4);
    expect(capturedCameraPos[2].x).toBeCloseTo(0, 4);
    expect(capturedCameraPos[2].z).toBeCloseTo(5, 4);
    expect(capturedCameraPos[3].x).toBeCloseTo(5, 4);
    expect(capturedCameraPos[3].z).toBeCloseTo(0, 4);

    expect(downloads).toHaveLength(1);
    expect(downloads[0].filename).toBe('statue_turn.zip');
    expect(downloads[0].blob.type).toBe('application/zip');

    const zipBytes = new Uint8Array(await downloads[0].blob.arrayBuffer());
    const entries = parseZipEntries(zipBytes);
    expect(entries.map((e) => e.name)).toEqual([
      'statue_turn_01_000deg.jpg',
      'statue_turn_02_090deg.jpg',
      'statue_turn_03_180deg.jpg',
      'statue_turn_04_270deg.jpg',
    ]);
  });

  it('captures 8 Directions (current + 7 x 45 deg) in a ZIP with grid hidden even when grid started disabled', async () => {
    const box = MeshBuilder.CreateBox('crate', { size: 2 }, app.service.scene);
    box.position.set(0, 1, 0);
    app.service.importedMeshes.push(box);
    app.service.setGridVisible(false);

    const cam = app.service.camera;
    cam.position.set(0, 2.5, -6);
    cam.setTarget(new Vector3(0, 1, 0));

    const capturedCameraPos: Vector3[] = [];
    const capturedGridStates: boolean[] = [];

    vi.spyOn(app.service.canvas, 'toDataURL').mockImplementation(() => {
      capturedCameraPos.push(cam.position.clone());
      capturedGridStates.push(app.service.gridMesh.isEnabled());
      return mockJpegDataUrl;
    });

    const downloads: Array<{ blob: Blob; filename: string }> = [];
    vi.spyOn(app as any, 'triggerDownloadBlob').mockImplementation((blob: Blob, filename: string) => {
      downloads.push({ blob, filename });
    });

    app.openScreenshotDialog();
    const option8 = container.querySelector('.screenshot-mode-option[data-mode="8-directions"]') as HTMLElement;
    option8.click();
    expect(container.querySelector('#screenshotExtensionBadge')?.textContent).toBe('.zip');

    // Leave filename empty -> falls back to "screenshot.zip"
    const input = container.querySelector('#screenshotFilenameInput') as HTMLInputElement;
    input.value = '';
    (container.querySelector('#btnConfirmScreenshot') as HTMLButtonElement).click();

    expect(capturedCameraPos).toHaveLength(8);
    expect(capturedGridStates.every((v) => v === false)).toBe(true);
    expect(app.service.gridMesh.isEnabled()).toBe(false);

    const pivot = new Vector3(0, 1, 0);
    const expectedDist = Vector3.Distance(new Vector3(0, 2.5, -6), pivot);
    for (const pos of capturedCameraPos) {
      expect(pos.y).toBeCloseTo(2.5, 4);
      expect(Vector3.Distance(pos, pivot)).toBeCloseTo(expectedDist, 4);
    }

    expect(downloads).toHaveLength(1);
    expect(downloads[0].filename).toBe('screenshot.zip');

    const zipBytes = new Uint8Array(await downloads[0].blob.arrayBuffer());
    const entries = parseZipEntries(zipBytes);
    expect(entries.map((e) => e.name)).toEqual([
      'screenshot_01_000deg.jpg',
      'screenshot_02_045deg.jpg',
      'screenshot_03_090deg.jpg',
      'screenshot_04_135deg.jpg',
      'screenshot_05_180deg.jpg',
      'screenshot_06_225deg.jpg',
      'screenshot_07_270deg.jpg',
      'screenshot_08_315deg.jpg',
    ]);
  });
});
