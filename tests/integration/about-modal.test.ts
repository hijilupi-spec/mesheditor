import { NullEngine } from '@babylonjs/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import pkg from '../../package.json';
import { MeshEditorApp } from '../../src/MeshEditorApp';

describe('About Modal Integration Tests', () => {
  let container: HTMLElement;
  let engine: NullEngine;
  let app: MeshEditorApp;

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
    app.dispose();
    container.remove();
  });

  it('opens the About modal when clicking the toolbar brand icon (#btnToolbarAbout)', () => {
    const modal = container.querySelector('#aboutModal') as HTMLElement;
    const brandBtn = container.querySelector('#btnToolbarAbout') as HTMLButtonElement;

    expect(modal).not.toBeNull();
    expect(brandBtn).not.toBeNull();
    expect(modal.classList.contains('active')).toBe(false);

    brandBtn.click();
    expect(modal.classList.contains('active')).toBe(true);
  });

  it('displays icon, name, and package.json metadata fields', () => {
    const modal = container.querySelector('#aboutModal') as HTMLElement;
    expect(modal.querySelector('.about-app-icon svg')).not.toBeNull();
    expect(modal.querySelector('.about-app-name')?.textContent?.trim()).toBe('Mesh Editor');
    expect(modal.querySelector('.about-version-badge')?.textContent?.trim()).toBe(`v${pkg.version}`);
    expect(modal.querySelector('.about-description')?.textContent?.trim()).toBe(pkg.description);

    const textContent = modal.textContent || '';
    expect(textContent).toContain(pkg.author);
    expect(textContent).toContain(pkg.license);

    const links = Array.from(modal.querySelectorAll<HTMLAnchorElement>('.about-meta-link')).map((a) => a.getAttribute('href'));
    const expectedRepoUrl = pkg.repository.url.replace(/^git\+/, '').replace(/\.git$/, '');
    expect(links).toContain(pkg.homepage);
    expect(links).toContain(expectedRepoUrl);
    expect(links).toContain(pkg.bugs.url);
  });

  it('closes the About modal via close button, footer button, and backdrop click', () => {
    const modal = container.querySelector('#aboutModal') as HTMLElement;
    const btnClose = container.querySelector('#btnCloseAbout') as HTMLButtonElement;
    const btnDone = container.querySelector('#btnAboutDone') as HTMLButtonElement;

    app.openAboutModal();
    expect(modal.classList.contains('active')).toBe(true);
    btnClose.click();
    expect(modal.classList.contains('active')).toBe(false);

    app.openAboutModal();
    expect(modal.classList.contains('active')).toBe(true);
    btnDone.click();
    expect(modal.classList.contains('active')).toBe(false);

    app.openAboutModal();
    expect(modal.classList.contains('active')).toBe(true);
    modal.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(modal.classList.contains('active')).toBe(false);
  });
});
