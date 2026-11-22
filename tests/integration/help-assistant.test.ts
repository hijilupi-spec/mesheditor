import { NullEngine } from '@babylonjs/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MeshEditorApp } from '../../src/MeshEditorApp';
import { HELP_ASSISTANT_STORAGE_KEY } from '../../src/services/HelpModalService';
import { HELP_ASSISTANT_TOPICS, HELP_TOUR_STEPS } from '../../src/services/helpAssistantContent';

describe('Help Assistant & Guided Tour Integration Tests', () => {
  let container: HTMLDivElement;
  let engine: NullEngine;
  let app: MeshEditorApp;

  beforeEach(() => {
    localStorage.clear();
    container = document.createElement('div');
    container.id = 'test-host';
    document.body.appendChild(container);
    engine = new NullEngine();
  });

  afterEach(() => {
    vi.useRealTimers();
    if (app) {
      app.dispose();
    }
    container.remove();
  });

  it('auto-starts the Help Assistant on first visit and persists seen state in localStorage', () => {
    vi.useFakeTimers();
    app = new MeshEditorApp({
      container,
      engine,
      layoutMode: 'dock',
    });

    expect(app.isHelpModalOpen()).toBe(false);
    expect(localStorage.getItem(HELP_ASSISTANT_STORAGE_KEY)).toBeNull();

    // Advance past startup and scene loader initialization
    vi.advanceTimersByTime(1300);

    expect(app.isHelpModalOpen()).toBe(true);
    expect(localStorage.getItem(HELP_ASSISTANT_STORAGE_KEY)).toBe('1');

    app.closeHelpModal();
    expect(app.isHelpModalOpen()).toBe(false);
    app.dispose();

    // Re-mounting when already seen must NOT auto-open
    const container2 = document.createElement('div');
    document.body.appendChild(container2);
    const engine2 = new NullEngine();
    const app2 = new MeshEditorApp({
      container: container2,
      engine: engine2,
      layoutMode: 'dock',
    });

    vi.advanceTimersByTime(1300);
    expect(app2.isHelpModalOpen()).toBe(false);

    app2.dispose();
    container2.remove();
  });

  it('renders all 9 goal-oriented task topics and switches tabs cleanly', () => {
    app = new MeshEditorApp({
      container,
      engine,
      autoShowHelpOnFirstVisit: false,
    });

    app.openHelpModal();
    const helpModal = container.querySelector('#helpModal') as HTMLElement;
    expect(helpModal).not.toBeNull();
    expect(app.isHelpModalOpen()).toBe(true);

    const navBtns = Array.from(helpModal.querySelectorAll<HTMLButtonElement>('[data-help-topic]'));
    expect(navBtns.map((b) => b.getAttribute('data-help-topic'))).toEqual(
      HELP_ASSISTANT_TOPICS.map((t) => t.id)
    );

    // Switch to Setup AI via nav button
    const setupAiTab = helpModal.querySelector('#helpTab-setup-ai') as HTMLButtonElement;
    setupAiTab.click();
    expect(setupAiTab.getAttribute('aria-selected')).toBe('true');

    const setupAiPane = helpModal.querySelector('#helpPane-setup-ai') as HTMLElement;
    const welcomePane = helpModal.querySelector('#helpPane-welcome') as HTMLElement;
    expect(setupAiPane.hasAttribute('hidden')).toBe(false);
    expect(welcomePane.hasAttribute('hidden')).toBe(true);

    // Switch via Welcome goal card
    (helpModal.querySelector('#helpTab-welcome') as HTMLButtonElement).click();
    const compressGoalCard = helpModal.querySelector('[data-jump-topic="compress"]') as HTMLButtonElement;
    compressGoalCard.click();
    expect((helpModal.querySelector('#helpTab-compress') as HTMLElement).getAttribute('aria-selected')).toBe('true');
  });

  it('filters help topics with live plain-English search and jumps to matching guide', () => {
    app = new MeshEditorApp({
      container,
      engine,
      autoShowHelpOnFirstVisit: false,
    });

    app.openHelpModal();
    const helpModal = container.querySelector('#helpModal') as HTMLElement;
    const searchInput = helpModal.querySelector('#helpAssistantSearchInput') as HTMLInputElement;
    const resultsPane = helpModal.querySelector('#helpSearchResultsPane') as HTMLElement;

    searchInput.value = 'draco';
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));

    expect(resultsPane.style.display).toBe('block');
    expect(resultsPane.textContent).toContain('Compress Models');

    const jumpBtn = resultsPane.querySelector('[data-jump-topic="compress"]') as HTMLButtonElement;
    expect(jumpBtn).not.toBeNull();
    jumpBtn.click();

    expect(resultsPane.style.display).toBe('none');
    expect((helpModal.querySelector('#helpTab-compress') as HTMLElement).getAttribute('aria-selected')).toBe('true');

    // Empty-match search shows helpful suggestion
    searchInput.value = 'zzznonexistenttopic';
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    expect(resultsPane.textContent).toContain('No matching guides');
  });

  it('launches target tools and settings directly from interactive help action buttons', () => {
    app = new MeshEditorApp({
      container,
      engine,
      autoShowHelpOnFirstVisit: false,
    });

    app.openHelpModal('setup-ai');
    const helpModal = container.querySelector('#helpModal') as HTMLElement;
    const openAiSettingsBtn = helpModal.querySelector('[data-help-action="open-ai-settings"]') as HTMLButtonElement;
    openAiSettingsBtn.click();

    expect(app.isHelpModalOpen()).toBe(false);
    const settingsModal = container.querySelector('#settingsModal') as HTMLDialogElement;
    expect(settingsModal.open || settingsModal.hasAttribute('open')).toBe(true);
    expect(container.querySelector('#settingsTabBtnAI')?.getAttribute('aria-selected')).toBe('true');

    // Also test opening Create Mesh from Create New Models topic
    app.closeSettingsModal();
    app.openHelpModal('create');
    const openCreateBtn = helpModal.querySelector('[data-help-action="open-create-mesh"]') as HTMLButtonElement;
    openCreateBtn.click();

    expect(app.isHelpModalOpen()).toBe(false);
    expect(app.isDialogOpen('dialog-create-primitive')).toBe(true);
  });

  it('runs the non-modal Guided Tour across all steps and supports returning to Help Hub', () => {
    app = new MeshEditorApp({
      container,
      engine,
      autoShowHelpOnFirstVisit: false,
    });

    app.openHelpModal('welcome');
    const tourBtn = container.querySelector('#btnHelpStartTourHeader') as HTMLButtonElement;
    tourBtn.click();

    expect(app.isHelpModalOpen()).toBe(false);
    expect(app.isGuidedTourOpen()).toBe(true);

    const popover = container.querySelector('#helpTourPopover') as HTMLElement;
    const titleEl = popover.querySelector('#helpTourStepTitle') as HTMLElement;
    const prevBtn = popover.querySelector('#btnTourPrev') as HTMLButtonElement;
    const nextBtn = popover.querySelector('#btnTourNext') as HTMLButtonElement;

    expect(titleEl.textContent).toBe(HELP_TOUR_STEPS[0].title);
    expect(prevBtn.disabled).toBe(true);

    nextBtn.click();
    expect(titleEl.textContent).toBe(HELP_TOUR_STEPS[1].title);
    expect(prevBtn.disabled).toBe(false);

    // Jump to last step via dot
    const lastDot = popover.querySelector(`[data-tour-step="${HELP_TOUR_STEPS.length - 1}"]`) as HTMLButtonElement;
    lastDot.click();
    expect(titleEl.textContent).toBe(HELP_TOUR_STEPS[HELP_TOUR_STEPS.length - 1].title);
    expect(nextBtn.textContent).toContain('Finish');

    // Finish tour
    nextBtn.click();
    expect(app.isGuidedTourOpen()).toBe(false);

    // Start tour and return to Help Hub
    app.startGuidedTour(0);
    expect(app.isGuidedTourOpen()).toBe(true);
    (popover.querySelector('#btnTourOpenHub') as HTMLButtonElement).click();
    expect(app.isGuidedTourOpen()).toBe(false);
    expect(app.isHelpModalOpen()).toBe(true);
  });

  it('allows toggling first-visit auto-start back on via footer checkbox', () => {
    app = new MeshEditorApp({
      container,
      engine,
      autoShowHelpOnFirstVisit: false,
    });

    app.openHelpModal();
    expect(localStorage.getItem(HELP_ASSISTANT_STORAGE_KEY)).toBe('1');

    const chk = container.querySelector('#chkHelpShowOnNextVisit') as HTMLInputElement;
    expect(chk.checked).toBe(false);

    chk.checked = true;
    chk.dispatchEvent(new Event('change', { bubbles: true }));
    expect(localStorage.getItem(HELP_ASSISTANT_STORAGE_KEY)).toBeNull();

    chk.checked = false;
    chk.dispatchEvent(new Event('change', { bubbles: true }));
    expect(localStorage.getItem(HELP_ASSISTANT_STORAGE_KEY)).toBe('1');
  });
});
