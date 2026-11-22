export type HelpActionId =
  | 'start-tour'
  | 'open-create-mesh'
  | 'open-voxel-painter'
  | 'open-path-extrusion'
  | 'open-text-mesh'
  | 'open-heightmap'
  | 'open-sculpt'
  | 'open-csg'
  | 'open-facet'
  | 'open-material'
  | 'open-texture-paint'
  | 'open-decal'
  | 'open-ai-settings'
  | 'open-ai-agent'
  | 'open-ai-texture'
  | 'open-prompt-guide'
  | 'open-file'
  | 'import-file'
  | 'open-export'
  | 'open-compress'
  | 'open-texture-optimizer';

export type HelpTopicId =
  | 'welcome'
  | 'create'
  | 'modify'
  | 'setup-ai'
  | 'create-ai'
  | 'collaborate-ai'
  | 'convert'
  | 'compress'
  | 'controls';

export interface HelpActionButton {
  action: HelpActionId;
  label: string;
  icon: string;
  variant?: 'primary' | 'secondary';
  id?: string;
}

export interface HelpCardItem {
  title: string;
  badge?: string;
  icon?: string;
  descriptionHtml: string;
  tip?: string;
  actions?: HelpActionButton[];
}

export interface HelpSectionBlock {
  title: string;
  icon: string;
  layout?: 'grid' | 'stack' | 'steps';
  introHtml?: string;
  items?: HelpCardItem[];
  customHtml?: string;
}

export interface HelpTopicDefinition {
  id: HelpTopicId;
  navLabel: string;
  navSubtitle: string;
  icon: string;
  badge?: string;
  heroTitle: string;
  heroSummary: string;
  heroActions?: HelpActionButton[];
  keywords: string[];
  sections: HelpSectionBlock[];
}

export interface HelpTourStep {
  id: string;
  title: string;
  badge: string;
  icon: string;
  targetSelector: string;
  fallbackSelector?: string;
  placement: 'bottom' | 'left' | 'right' | 'top' | 'center';
  description: string;
  tip: string;
  action?: HelpActionButton;
}

export const HELP_ASSISTANT_STORAGE_KEY = 'mesheditor_help_assistant_seen';

export const HELP_TOUR_STEPS: HelpTourStep[] = [
  {
    id: 'canvas',
    title: 'Your 3D Workspace (The Stage)',
    badge: '1 of 6 • Viewport',
    icon: 'box',
    targetSelector: '#renderCanvas',
    placement: 'center',
    description:
      'This large area is your 3D stage. Hold Right-Click and drag to spin around your model, scroll the wheel to zoom in or out, and use W A S D keys to fly closer.',
    tip: 'On a phone or tablet, drag with 1 finger to look around and pinch with 2 fingers to zoom.',
  },
  {
    id: 'toolbar-menus',
    title: 'File, Actions, Tools & View',
    badge: '2 of 6 • Top Menu',
    icon: 'folder-open',
    targetSelector: '#dropdownFile',
    fallbackSelector: '#top-toolbar',
    placement: 'bottom',
    description:
      'Open or drag-and-drop 3D files from File, combine or split objects in Actions, pick specialized workshops under Tools, and switch panel layouts under View.',
    tip: 'You can also drag any .glb, .obj, .stl, or .dae file straight from your desktop onto the 3D window!',
  },
  {
    id: 'gizmos',
    title: 'Move, Rotate, Resize & Bounds',
    badge: '3 of 6 • Transform Arrows',
    icon: 'move',
    targetSelector: '.gizmo-group',
    placement: 'bottom',
    description:
      'Click any 3D object to show colored handles. Use these four buttons (or press M, E, R, B) to slide objects, turn them, stretch them, or resize by their outer box.',
    tip: 'Hold Cmd (Mac) or Ctrl (Windows/Linux) while dragging to snap neatly to grid steps or 5° angles.',
  },
  {
    id: 'tools-menu',
    title: 'All 3D Workshops Live Here',
    badge: '4 of 6 • Tools Menu',
    icon: 'wrench',
    targetSelector: '#btnDropdownTools',
    placement: 'bottom',
    description:
      'Instead of crowding your screen, specialized studios—like Create Mesh, Voxel Painter, Sculpting, AI Mesh Agent, and Compress Model—are neatly organized inside Tools.',
    tip: 'Every floating tool dialog also has its own "?" button in its title bar for quick tool-specific tips.',
  },
  {
    id: 'panels-outliner',
    title: 'Scene Layers & Active Tool Panels',
    badge: '5 of 6 • Sidebars',
    icon: 'list-tree',
    targetSelector: '#dialog-outliner',
    fallbackSelector: '#rightSidebarHost',
    placement: 'right',
    description:
      'Scene Objects on the left works just like layers in a photo editor—click any item to select, hide, or group it. Your open tool panels dock cleanly on the right side.',
    tip: 'Lost an object off-screen? Select it in Scene Objects and press F to zoom straight to it.',
  },
  {
    id: 'ai-and-help',
    title: 'Optional AI Assistant & Settings',
    badge: '6 of 6 • Help & AI',
    icon: 'bot',
    targetSelector: '#btnSettings',
    fallbackSelector: '#btnHelp',
    placement: 'bottom',
    description:
      'Click the gear icon anytime to adjust grid snapping or connect an AI provider (free local models or cloud APIs like Claude, Gemini, or OpenAI). Click "?" anytime to reopen this Help Assistant.',
    tip: 'You do not need AI to use Mesh Editor—every modeling, painting, converting, and compression tool works 100% locally in your browser.',
    action: {
      action: 'open-ai-settings',
      label: 'Open AI Settings',
      icon: 'settings',
      variant: 'secondary',
    },
  },
];

export const HELP_ASSISTANT_TOPICS: HelpTopicDefinition[] = [
  {
    id: 'welcome',
    navLabel: 'Welcome & Quick Tour',
    navSubtitle: 'Start here in 60 seconds',
    icon: 'rocket',
    badge: 'Start Here',
    heroTitle: 'Welcome to Mesh Editor',
    heroSummary:
      'New to 3D modeling or AI? No problem. Pick what you want to accomplish below, or take a 60-second visual tour of the workspace.',
    heroActions: [
      {
        action: 'start-tour',
        label: 'Start 60-Second Guided Tour',
        icon: 'play',
        variant: 'primary',
      },
      {
        action: 'open-create-mesh',
        label: 'Spawn Your First 3D Shape',
        icon: 'box',
        variant: 'secondary',
      },
    ],
    keywords: ['start', 'welcome', 'beginner', 'tour', 'overview', 'intro', 'first time', 'how it works'],
    sections: [
      {
        title: 'How Mesh Editor Works (3 Simple Ideas)',
        icon: 'lightbulb',
        layout: 'steps',
        items: [
          {
            title: '1. The 3D Stage',
            badge: 'Center',
            icon: 'box',
            descriptionHtml:
              'Everything happens in the center 3D view. <strong>Right-drag</strong> to orbit around your model, <strong>scroll</strong> to zoom, and <strong>Left-click</strong> an object to grab its move/rotate arrows.',
          },
          {
            title: '2. Scene Layers on the Left',
            badge: 'Outliner',
            icon: 'list-tree',
            descriptionHtml:
              'The <strong>Scene Objects</strong> window lists every part in your project—just like layers in a photo app. Click a name to select it even if it is tucked inside another part.',
          },
          {
            title: '3. Workshops on Demand',
            badge: 'Tools Menu',
            icon: 'wrench',
            descriptionHtml:
              'Open the top <strong>Tools</strong> menu whenever you want to sculpt, paint colors, shrink file sizes, or ask the optional <strong>AI Mesh Agent</strong> to build or edit parts with you.',
          },
        ],
      },
      {
        title: 'What Do You Want to Do Today?',
        icon: 'compass',
        customHtml: `
          <div class="help-goal-grid">
            <button type="button" class="help-goal-card" data-jump-topic="create">
              <span class="help-goal-icon"><i class="app-icon" data-lucide="shapes"></i></span>
              <span class="help-goal-body">
                <strong>Create new models</strong>
                <span>Start from shapes, blocks, 3D text, paths, terrain, or sculpting</span>
              </span>
              <i class="app-icon help-goal-arrow" data-lucide="arrow-right"></i>
            </button>
            <button type="button" class="help-goal-card" data-jump-topic="modify">
              <span class="help-goal-icon"><i class="app-icon" data-lucide="sliders"></i></span>
              <span class="help-goal-body">
                <strong>Modify existing models</strong>
                <span>Move, resize, split parts, paint colors, or cut holes</span>
              </span>
              <i class="app-icon help-goal-arrow" data-lucide="arrow-right"></i>
            </button>
            <button type="button" class="help-goal-card" data-jump-topic="setup-ai">
              <span class="help-goal-icon"><i class="app-icon" data-lucide="cpu"></i></span>
              <span class="help-goal-body">
                <strong>How to setup AI</strong>
                <span>Connect free local AI or your Claude / Gemini / OpenAI key</span>
              </span>
              <i class="app-icon help-goal-arrow" data-lucide="arrow-right"></i>
            </button>
            <button type="button" class="help-goal-card" data-jump-topic="create-ai">
              <span class="help-goal-icon"><i class="app-icon" data-lucide="sparkles"></i></span>
              <span class="help-goal-body">
                <strong>Create models with AI</strong>
                <span>Describe an object in plain words or upload a photo/sketch</span>
              </span>
              <i class="app-icon help-goal-arrow" data-lucide="arrow-right"></i>
            </button>
            <button type="button" class="help-goal-card" data-jump-topic="collaborate-ai">
              <span class="help-goal-icon"><i class="app-icon" data-lucide="bot"></i></span>
              <span class="help-goal-body">
                <strong>Collaborate on models with AI</strong>
                <span>Select any part and refine, recolor, or expand it together</span>
              </span>
              <i class="app-icon help-goal-arrow" data-lucide="arrow-right"></i>
            </button>
            <button type="button" class="help-goal-card" data-jump-topic="convert">
              <span class="help-goal-icon"><i class="app-icon" data-lucide="arrow-left-right"></i></span>
              <span class="help-goal-body">
                <strong>Convert models</strong>
                <span>Open GLB, OBJ, STL, DAE, PLY, FBX and export to any format</span>
              </span>
              <i class="app-icon help-goal-arrow" data-lucide="arrow-right"></i>
            </button>
            <button type="button" class="help-goal-card" data-jump-topic="compress">
              <span class="help-goal-icon"><i class="app-icon" data-lucide="file-archive"></i></span>
              <span class="help-goal-body">
                <strong>Compress models</strong>
                <span>Shrink huge 3D files by 70–85% in your browser</span>
              </span>
              <i class="app-icon help-goal-arrow" data-lucide="arrow-right"></i>
            </button>
            <button type="button" class="help-goal-card" data-jump-topic="controls">
              <span class="help-goal-icon"><i class="app-icon" data-lucide="keyboard"></i></span>
              <span class="help-goal-body">
                <strong>Controls &amp; shortcuts</strong>
                <span>Mouse, touch gestures, snapping, and keyboard cheat sheet</span>
              </span>
              <i class="app-icon help-goal-arrow" data-lucide="arrow-right"></i>
            </button>
          </div>
        `,
      },
    ],
  },
  {
    id: 'create',
    navLabel: 'Create New Models',
    navSubtitle: 'Shapes, voxels, terrain, sculpt',
    icon: 'shapes',
    heroTitle: 'Create New 3D Models from Scratch',
    heroSummary:
      'You do not need to be a 3D artist to build models here. Pick the building style that matches your idea—from simple blocks to organic clay.',
    heroActions: [
      {
        action: 'open-create-mesh',
        label: 'Open Create Mesh',
        icon: 'box',
        variant: 'primary',
      },
      {
        action: 'open-voxel-painter',
        label: 'Open Voxel Painter',
        icon: 'grid-3x3',
        variant: 'secondary',
      },
    ],
    keywords: ['create', 'new', 'primitive', 'box', 'sphere', 'voxel', 'text', 'terrain', 'sculpt', 'path', 'extrude', 'build'],
    sections: [
      {
        title: '5 Easy Ways to Build Anything',
        icon: 'layers',
        layout: 'grid',
        items: [
          {
            title: '1. Building Blocks (Create Mesh)',
            badge: 'Easiest',
            icon: 'box',
            descriptionHtml:
              'Start with cubes, spheres, cylinders, cones, rings, or tubes. Click <strong>Spawn at Origin</strong> to drop one in the center, or <strong>Pick &amp; Place in 3D</strong> to click anywhere on another object to attach it.',
            tip: 'Great for furniture, architecture, props, and quick mockups.',
            actions: [{ action: 'open-create-mesh', label: 'Try Create Mesh', icon: 'box' }],
          },
          {
            title: '2. Pixel Blocks (Voxel Painter)',
            badge: 'Block Art',
            icon: 'grid-3x3',
            descriptionHtml:
              'Build like digital LEGO or Minecraft! Pick a color or texture tile, then click in the 3D grid to stack blocks or erase them.',
            tip: 'Super intuitive if you prefer clicking blocks into place over moving vertices.',
            actions: [{ action: 'open-voxel-painter', label: 'Try Voxel Painter', icon: 'grid-3x3' }],
          },
          {
            title: '3. Draw a Path (Path Extrusion)',
            badge: 'Walls & Pipes',
            icon: 'route',
            descriptionHtml:
              'Click points on the floor to draw a curve or floor plan. Mesh Editor automatically turns that line into a 3D wall, road, railing, or pipe.',
            actions: [{ action: 'open-path-extrusion', label: 'Try Path Extrusion', icon: 'route' }],
          },
          {
            title: '4. 3D Letters & Logos (3D Text)',
            badge: 'Signage',
            icon: 'type',
            descriptionHtml:
              'Type any word or title, pick a font and thickness, and click to place solid 3D lettering right into your scene.',
            actions: [{ action: 'open-text-mesh', label: 'Try 3D Text', icon: 'type' }],
          },
          {
            title: '5. Mountains & Landscapes (Heightmap Terrain)',
            badge: 'Environments',
            icon: 'mountain',
            descriptionHtml:
              'Use an easy 2D brush (or pick a preset like Island, Volcano, or Canyon) to raise hills and paint grass, rock, snow, and sand paths.',
            actions: [{ action: 'open-heightmap', label: 'Try Heightmap Terrain', icon: 'mountain' }],
          },
          {
            title: '6. Digital Clay (Figure Sculpt & Retopo)',
            badge: 'Characters',
            icon: 'smile',
            descriptionHtml:
              'Spawn a ready-made human, animal, or head base mesh, then push, smooth, pinch, and inflate it like soft clay.',
            actions: [{ action: 'open-sculpt', label: 'Try Figure Sculpt', icon: 'smile' }],
          },
        ],
      },
    ],
  },
  {
    id: 'modify',
    navLabel: 'Modify Existing Models',
    navSubtitle: 'Move, split, color, cut holes',
    icon: 'sliders',
    heroTitle: 'Modify & Improve Existing Models',
    heroSummary:
      'Already have a 3D model (or just created one)? Here is how to move parts, fix messy imports, change colors, and combine or carve shapes.',
    heroActions: [
      {
        action: 'open-file',
        label: 'Open a 3D File',
        icon: 'folder-open',
        variant: 'primary',
      },
      {
        action: 'open-material',
        label: 'Open Material & Texture',
        icon: 'palette',
        variant: 'secondary',
      },
    ],
    keywords: ['modify', 'edit', 'move', 'rotate', 'scale', 'separate', 'merge', 'group', 'color', 'paint', 'material', 'csg', 'hole', 'cut', 'decal', 'facet'],
    sections: [
      {
        title: 'Essential Editing Steps',
        icon: 'wrench',
        layout: 'grid',
        items: [
          {
            title: 'Move, Rotate & Resize',
            badge: 'Keys: M E R B',
            icon: 'move',
            descriptionHtml:
              'Click an object to select it. Drag the <strong>Red, Green, or Blue handles</strong> to move (<kbd>M</kbd>), rotate (<kbd>E</kbd>), or scale (<kbd>R</kbd>). Use <strong>Bounds (<kbd>B</kbd>)</strong> to resize by dragging the outer box corners.',
            tip: 'Hold Cmd / Ctrl while dragging for clean grid snapping. Made a mistake? Press Cmd+Z / Ctrl+Z to Undo.',
          },
          {
            title: 'Split or Combine Objects',
            badge: 'Actions Menu',
            icon: 'scissors',
            descriptionHtml:
              'Downloaded models often arrive glued together as one piece. Open <strong>Actions → Separate Loose Parts</strong> to split them apart! To join pieces back together, multi-select with <strong>Shift+Click</strong> and choose <strong>Merge Meshes</strong> or <strong>Group Meshes</strong>.',
            tip: 'If the arrows appear far away from an object, click Actions → Center Pivot.',
          },
          {
            title: 'Change Colors, Shine & Surfaces',
            badge: 'Materials',
            icon: 'palette',
            descriptionHtml:
              'Open <strong>Material &amp; Texture</strong> to pick a color, adjust shininess (<em>Roughness</em>) or metal look (<em>Metallic</em>), or upload your own surface image.',
            actions: [{ action: 'open-material', label: 'Open Materials', icon: 'palette' }],
          },
          {
            title: 'Paint & Stamp Stickers Directly',
            badge: '3D Paint & Decals',
            icon: 'paintbrush',
            descriptionHtml:
              'Use <strong>3D Texture Painter</strong> to brush colors straight onto the 3D surface, or <strong>Decal Painter</strong> to project logos, cracks, or posters onto any angle.',
            actions: [
              { action: 'open-texture-paint', label: '3D Texture Painter', icon: 'paintbrush' },
              { action: 'open-decal', label: 'Decal Painter', icon: 'stamp' },
            ],
          },
          {
            title: 'Cut Holes & Fuse Shapes (CSG)',
            badge: 'Cookie Cutter',
            icon: 'combine',
            descriptionHtml:
              'Want to drill a hole or merge two overlapping objects cleanly? Open <strong>Constructive Solid Geometry</strong>, pick a Target mesh and a Cutter mesh, then click <strong>Subtract</strong> (cut out) or <strong>Union</strong> (fuse).',
            actions: [{ action: 'open-csg', label: 'Open CSG Tool', icon: 'combine' }],
          },
          {
            title: 'Push or Inset Flat Faces',
            badge: 'Facet Editor',
            icon: 'triangle',
            descriptionHtml:
              'In <strong>Facet &amp; Vertex Editor</strong>, click a single face on your model to extrude it outward, inset a recessed panel, or slice through.',
            actions: [{ action: 'open-facet', label: 'Open Facet Editor', icon: 'triangle' }],
          },
        ],
      },
    ],
  },
  {
    id: 'setup-ai',
    navLabel: 'How to Setup AI',
    navSubtitle: 'Free local or cloud API key',
    icon: 'cpu',
    heroTitle: 'How to Setup AI (2-Minute Guide)',
    heroSummary:
      'Mesh Editor lets you "Bring Your Own AI"—no extra subscription required. Connect a free local AI on your computer or plug in a cloud API key from Claude, Gemini, or OpenAI.',
    heroActions: [
      {
        action: 'open-ai-settings',
        label: 'Open AI Settings Now',
        icon: 'settings',
        variant: 'primary',
      },
      {
        action: 'open-ai-agent',
        label: 'Open AI Mesh Agent',
        icon: 'bot',
        variant: 'secondary',
      },
    ],
    keywords: ['setup', 'ai', 'api key', 'ollama', 'lm studio', 'claude', 'anthropic', 'gemini', 'openai', 'chatgpt', 'antigravity', 'bridge', 'local', 'free', 'settings', 'test connection'],
    sections: [
      {
        title: 'Step-by-Step: Connect Your AI in 4 Clicks',
        icon: 'check-circle-2',
        layout: 'steps',
        items: [
          {
            title: 'Step 1 — Open Settings → AI',
            badge: 'Top Right Gear',
            icon: 'settings',
            descriptionHtml:
              'Click the <strong>Gear icon</strong> in the top-right toolbar (or click <em>Open AI Settings Now</em> above) and switch to the <strong>AI</strong> tab.',
          },
          {
            title: 'Step 2 — Pick a Quick Preset',
            badge: '1-Click Fill',
            icon: 'zap',
            descriptionHtml:
              'Click one of the preset buttons at the top—like <strong>Antigravity</strong>, <strong>Claude</strong>, <strong>Gemini Native</strong>, <strong>OpenAI</strong>, or <strong>Ollama Native</strong>. This fills in the server address and recommended model for you.',
          },
          {
            title: 'Step 3 — Paste API Key (Cloud Only)',
            badge: 'Private in Browser',
            icon: 'shield-check',
            descriptionHtml:
              'If you picked a cloud AI (Claude, Gemini, OpenAI, OpenRouter), paste your personal API key. <em>Your key is stored only in your browser&apos;s local storage and sent directly to your chosen provider.</em> Local options need no key!',
          },
          {
            title: 'Step 4 — Click "Test Connection"',
            badge: 'Verify',
            icon: 'activity',
            descriptionHtml:
              'Hit <strong>Test Connection</strong> at the top of the AI section. As soon as you see a green success message, you are ready to build with AI!',
          },
        ],
      },
      {
        title: 'Which AI Option Should You Choose?',
        icon: 'compass',
        layout: 'grid',
        items: [
          {
            title: 'Cloud AI (Best Quality & Easiest)',
            badge: 'Claude / Gemini / OpenAI',
            icon: 'sparkles',
            descriptionHtml:
              'Best if you want complex multi-part 3D models and image-to-3D right away without installing anything. Pick <strong>Claude</strong> (Anthropic), <strong>Gemini Native</strong> (Google AI Studio), or <strong>OpenAI</strong>.',
            tip: 'Models with vision (like Claude Sonnet, Gemini Flash/Pro, or GPT-4o) let you attach photos and use "+ 3D View" visual checks!',
          },
          {
            title: 'Free Local AI on Your Computer',
            badge: 'No Cloud / No Cost',
            icon: 'terminal',
            descriptionHtml:
              'Run AI privately offline with <strong>Ollama</strong> or <strong>LM Studio</strong>. When using Ollama, select the <strong>Ollama Native</strong> preset—it automatically sets a <code>32,768</code> token context window so the model does not forget the 3D tools.',
            tip: 'Using Antigravity locally? Run <code>npm run ai:bridge</code> (already automatic with <code>npm run dev</code>) and pick the <strong>Antigravity</strong> preset—no API key needed.',
          },
          {
            title: 'Optional: AI Image & Neural 3D Backends',
            badge: 'Textures & Statues',
            icon: 'boxes',
            descriptionHtml:
              'Scroll down in <strong>Settings → AI</strong> to optionally enable <strong>External Image Generator</strong> (e.g. <em>Pollinations (Free)</em> works with zero key!) for custom AI textures, or connect <strong>TRELLIS 2 / Hunyuan3D / Hi3D</strong> for organic 3D sculptures.',
          },
        ],
      },
    ],
  },
  {
    id: 'create-ai',
    navLabel: 'Create Models with AI',
    navSubtitle: 'Text, photos, voice & quick prompts',
    icon: 'sparkles',
    heroTitle: 'Create 3D Models with AI',
    heroSummary:
      'Think of the AI Mesh Agent like a helpful 3D carpenter: describe what you want in everyday words, show it a photo, or speak into your microphone.',
    heroActions: [
      {
        action: 'open-ai-agent',
        label: 'Open AI Mesh Agent',
        icon: 'bot',
        variant: 'primary',
      },
      {
        action: 'open-prompt-guide',
        label: 'Open AI Prompting & Tools Directory',
        icon: 'book-open',
        variant: 'secondary',
        id: 'btnOpenPromptHelpFromGeneralHelp',
      },
    ],
    keywords: ['ai', 'generate', 'text to 3d', 'image to 3d', 'prompt', 'photo', 'voice', 'mic', 'examples', 'quick prompts', 'visual check'],
    sections: [
      {
        title: '3 Simple Ways to Ask the AI',
        icon: 'wand-2',
        layout: 'grid',
        items: [
          {
            title: 'Type in Plain Everyday English',
            badge: 'Text-to-3D',
            icon: 'bot',
            descriptionHtml:
              'Open <strong>Tools → Creation → AI Mesh Agent</strong> and type what you imagine, e.g. <em>"Build a wooden treasure chest with iron straps and a gold lock"</em>. Not sure what to write? Pick an example from <strong>Quick Prompts (Examples)...</strong>.',
          },
          {
            title: 'Drop a Photo or Sketch',
            badge: 'Image-to-3D',
            icon: 'image',
            descriptionHtml:
              'Often a picture works even better than text! Click the <strong>Image icon</strong>, paste with <kbd>Cmd+V</kbd>, or drag &amp; drop a reference photo straight into the chat box, then say <em>"Build this in 3D"</em>.',
          },
          {
            title: 'Speak Your Request',
            badge: 'Voice Input',
            icon: 'mic',
            descriptionHtml:
              'Click the <strong>Microphone icon</strong> in the AI panel and describe your model out loud—great when brainstorming on a tablet or laptop.',
          },
        ],
      },
      {
        title: '4 Easy Tips for Amazing Results',
        icon: 'lightbulb',
        layout: 'grid',
        items: [
          {
            title: 'Mention Materials & Colors',
            descriptionHtml:
              'Say things like <em>"warm oak wood"</em>, <em>"brushed steel"</em>, <em>"matte stone"</em>, or <em>"glossy ceramic"</em>. Keep <strong>Textures</strong> and <strong>Normal Maps</strong> checked for rich surface detail.',
          },
          {
            title: 'Describe the Main Parts',
            descriptionHtml:
              'Instead of just <em>"a lamp"</em>, try <em>"a desk lamp with a round brass base, an angled neck, and a green dome shade"</em>. Clear parts help the AI build clean geometry.',
          },
          {
            title: 'Use "Visual Check" for Self-Correction',
            descriptionHtml:
              'Check <strong>Visual Check</strong> in the AI panel and the AI will automatically inspect a 4-angle snapshot of its creation and fix floating or misaligned parts.',
          },
          {
            title: 'Start Fresh or Add to Scene',
            descriptionHtml:
              'Use the top dropdown in the AI panel: choose <strong>Replace Scene (Clear First)</strong> for a brand-new object, or <strong>Create / Update in Scene</strong> to add beside your current models.',
          },
        ],
      },
    ],
  },
  {
    id: 'collaborate-ai',
    navLabel: 'Collaborate on Models with AI',
    navSubtitle: 'Select, show 3D view & refine together',
    icon: 'bot',
    heroTitle: 'Collaborate Side-by-Side with AI',
    heroSummary:
      'You do not have to accept the first result—and you do not have to choose between manual editing and AI. Combine both seamlessly!',
    heroActions: [
      {
        action: 'open-ai-agent',
        label: 'Open AI Mesh Agent',
        icon: 'bot',
        variant: 'primary',
      },
      {
        action: 'open-ai-texture',
        label: 'Open AI Texture Generator',
        icon: 'image',
        variant: 'secondary',
      },
    ],
    keywords: ['collaborate', 'update', 'refine', 'iterate', 'select', '3d view', 'camera', 'screenshot', 'undo', 'ai texture', 'modify with ai'],
    sections: [
      {
        title: 'The Co-Creation Workflow',
        icon: 'sparkles',
        layout: 'steps',
        items: [
          {
            title: '1. Keep "Create / Update in Scene" Active',
            badge: 'Non-Destructive',
            icon: 'layers',
            descriptionHtml:
              'Make sure the mode dropdown at the top of <strong>AI Mesh Agent</strong> is set to <strong>Create / Update in Scene</strong> so the AI edits or adds to your existing work instead of clearing it.',
          },
          {
            title: '2. Click Any Part, Then Ask',
            badge: 'Targeted Edits',
            icon: 'mouse-pointer',
            descriptionHtml:
              'Select a mesh in the 3D viewport (or in <strong>Scene Objects</strong>) and write: <em>"Make the selected roof taller and give it dark slate tiles"</em> or <em>"Add 4 matching wooden chairs around this table"</em>.',
          },
          {
            title: '3. Show AI Your Camera Angle (+ 3D View)',
            badge: 'Shared Eyes',
            icon: 'camera',
            descriptionHtml:
              'Orbit the camera so the area you want to fix is clearly visible, then tick <strong>+ 3D View</strong> (or click the <strong>Camera icon</strong>). Now when you say <em>"fix the gap on the front left"</em>, the AI sees your exact view!',
          },
          {
            title: '4. Mix Manual Tweaks + Undo Anytime',
            badge: 'Full Control',
            icon: 'undo-2',
            descriptionHtml:
              'Move, sculpt, or recolor parts by hand between AI turns. If an AI edit is not what you wanted, just press <strong>Undo (<kbd>Cmd+Z</kbd> / <kbd>Ctrl+Z</kbd>)</strong> to step cleanly back.',
          },
        ],
      },
      {
        title: 'AI Surface Textures Without Changing Shape',
        icon: 'palette',
        layout: 'grid',
        items: [
          {
            title: 'AI Texture Generator',
            badge: 'Materials Menu',
            icon: 'image',
            descriptionHtml:
              'Happy with your 3D shape and only want new surface art (like mossy bark, worn leather, or sci-fi metal panels)? Open <strong>Tools → Materials → AI Texture Generator</strong> to create seamless PBR textures and apply them with one click.',
            actions: [{ action: 'open-ai-texture', label: 'Open AI Texture Generator', icon: 'image' }],
          },
        ],
      },
    ],
  },
  {
    id: 'convert',
    navLabel: 'Convert Models',
    navSubtitle: 'GLB, glTF, OBJ, STL, DAE, PLY, FBX',
    icon: 'arrow-left-right',
    heroTitle: 'Convert Between 3D File Formats',
    heroSummary:
      'Need to turn a downloaded model into a 3D-printable STL, a web-ready GLB, or an OBJ for another app? Convert any supported format right in your browser.',
    heroActions: [
      {
        action: 'open-file',
        label: 'Open 3D Model',
        icon: 'folder-open',
        variant: 'primary',
      },
      {
        action: 'open-export',
        label: 'Open Export Dialog',
        icon: 'download',
        variant: 'secondary',
      },
    ],
    keywords: ['convert', 'format', 'export', 'import', 'open', 'glb', 'gltf', 'obj', 'stl', 'dae', 'collada', 'ply', 'fbx', 'babylon', '3d print'],
    sections: [
      {
        title: 'How to Convert a Model in 3 Steps',
        icon: 'refresh-cw',
        layout: 'steps',
        items: [
          {
            title: '1. Drop or Open Your Input File',
            badge: 'GLB, glTF, OBJ, STL, PLY, FBX, DAE',
            icon: 'upload-cloud',
            descriptionHtml:
              'Drag &amp; drop your 3D file onto the viewport (or click <strong>File → Open...</strong>).<br/><em>Tip for .OBJ or .DAE models:</em> If your model comes with separate <code>.png</code> or <code>.jpg</code> texture files, select and drop them together in one batch!',
          },
          {
            title: '2. Inspect (and Optional Quick Fix)',
            badge: 'Preview',
            icon: 'eye',
            descriptionHtml:
              'Spin around your model to check textures, orientation, and size. Want to export only one piece? Select that piece before exporting.',
          },
          {
            title: '3. Export to Your Target Format',
            badge: 'Cmd+E / Ctrl+E',
            icon: 'download',
            descriptionHtml:
              'Open <strong>File → Export...</strong> (or press <kbd>Cmd+E</kbd> / <kbd>Ctrl+E</kbd>), type a filename, pick <strong>GLB</strong>, <strong>glTF</strong>, <strong>OBJ</strong>, or <strong>STL</strong>, and click <strong>Export</strong>.',
          },
        ],
      },
      {
        title: 'Which Format Should I Pick? (Plain-English Guide)',
        icon: 'file-check',
        customHtml: `
          <div class="help-format-grid">
            <div class="help-format-card">
              <div class="help-format-head">
                <strong>.GLB</strong>
                <span class="help-pill recommended">Recommended</span>
              </div>
              <p>Packs the 3D shape, colors, and textures into <strong>one single file</strong>. Best for websites, games, AR/VR, and sharing with others.</p>
            </div>
            <div class="help-format-card">
              <div class="help-format-head">
                <strong>.glTF</strong>
                <span class="help-pill">Developer</span>
              </div>
              <p>Same modern standard as GLB, saved as readable JSON scene data—handy when inspecting or post-processing assets.</p>
            </div>
            <div class="help-format-card">
              <div class="help-format-head">
                <strong>.OBJ</strong>
                <span class="help-pill">Universal</span>
              </div>
              <p>Classic geometry format opened by nearly every 3D program (Blender, Maya, Cinema 4D, CAD viewers).</p>
            </div>
            <div class="help-format-card">
              <div class="help-format-head">
                <strong>.STL</strong>
                <span class="help-pill">3D Printing</span>
              </div>
              <p>Pure surface triangle mesh with no colors—the standard format for 3D printer slicers (Bambu Studio, PrusaSlicer, Cura).</p>
            </div>
          </div>
          <div class="help-callout">
            <i class="app-icon" data-lucide="save"></i>
            <div><strong>Want to save your whole Mesh Editor project?</strong> Use <strong>File → Save Scene</strong> (<code>.babylon</code>) to preserve lights, background, and editor state for later.</div>
          </div>
        `,
      },
    ],
  },
  {
    id: 'compress',
    navLabel: 'Compress Models',
    navSubtitle: 'Draco, decimation & WebP textures',
    icon: 'file-archive',
    heroTitle: 'Compress & Optimize 3D Models',
    heroSummary:
      'Make oversized 3D models load dramatically faster without uploading anything to the cloud. Everything compresses locally right inside your browser.',
    heroActions: [
      {
        action: 'open-compress',
        label: 'Open Compress Model',
        icon: 'file-archive',
        variant: 'primary',
      },
      {
        action: 'open-texture-optimizer',
        label: 'Open Texture Optimizer',
        icon: 'zap',
        variant: 'secondary',
      },
    ],
    keywords: ['compress', 'optimize', 'size', 'smaller', 'draco', 'decimate', 'reduce', 'polygons', 'webp', 'vram', 'memory', 'fast'],
    sections: [
      {
        title: 'Why Are 3D Files So Big (and How to Shrink Them)?',
        icon: 'bar-chart-2',
        layout: 'grid',
        items: [
          {
            title: '1. Clean & Draco-Compress Geometry',
            badge: 'Up to 70–85% Smaller',
            icon: 'file-archive',
            descriptionHtml:
              'Open <strong>Tools → Optimization → Compress Model</strong>. Choose your <strong>Active Scene</strong> or switch <strong>Source</strong> to <strong>Import 3D File</strong> to drop a file directly. Pick <strong>Draco Compression (High)</strong> for huge file-size savings with nearly identical looks!',
            actions: [{ action: 'open-compress', label: 'Open Compress Model', icon: 'file-archive' }],
          },
          {
            title: '2. Simplify Ultra-Dense Meshes',
            badge: 'Decimation',
            icon: 'triangle',
            descriptionHtml:
              '3D scans and some AI meshes have hundreds of thousands of tiny triangles. Pick <strong>Balanced Decimation (50%)</strong>—or slide <strong>Polygon Decimation</strong> in Custom—to reduce triangle count while keeping the silhouette intact.',
          },
          {
            title: '3. Shrink Heavy Textures to WebP',
            badge: 'Texture Optimizer',
            icon: 'zap',
            descriptionHtml:
              'Often the hidden culprit behind a 50 MB model is giant PNG/JPG images! Use <strong>Convert textures to WebP</strong> inside Compress Model, or open <strong>Texture Optimizer</strong> to inspect GPU memory and resize/compress textures.',
            actions: [{ action: 'open-texture-optimizer', label: 'Open Texture Optimizer', icon: 'zap' }],
          },
          {
            title: '4. Preview Live Savings First',
            badge: 'Before & After',
            icon: 'check-circle-2',
            descriptionHtml:
              'Watch the <strong>Optimization Results</strong> dashboard show your new Size, Vertex count, Polygon count, and <strong>% saved</strong>. Click <strong>Compress &amp; Download</strong> or <strong>Apply to Scene</strong> (with full Undo!).',
          },
        ],
      },
    ],
  },
  {
    id: 'controls',
    navLabel: 'Controls & Shortcuts',
    navSubtitle: 'Mouse, touch & keyboard keys',
    icon: 'keyboard',
    heroTitle: 'Controls, Touch & Keyboard Shortcuts',
    heroSummary:
      'Quick reference for moving the camera, selecting multiple objects, snapping cleanly, and using Mesh Editor on desktop or touch screens.',
    heroActions: [
      {
        action: 'start-tour',
        label: 'Take Interactive Tour',
        icon: 'play',
        variant: 'secondary',
      },
    ],
    keywords: ['controls', 'shortcuts', 'keyboard', 'mouse', 'touch', 'mobile', 'ipad', 'select', 'marquee', 'snap', 'camera', 'orbit', 'wasd', 'undo', 'redo', 'copy', 'paste'],
    sections: [
      {
        title: 'Mouse Controls & Selection',
        icon: 'mouse',
        customHtml: `
          <table class="help-table">
            <tr>
              <td>Left Click</td>
              <td>Select mesh or facet &amp; drag transform gizmos</td>
            </tr>
            <tr>
              <td>Shift+Click / Cmd+Click</td>
              <td>Toggle selection / multi-select individual meshes</td>
            </tr>
            <tr>
              <td>Click &amp; Drag (Viewport)</td>
              <td>Marquee / rectangle box select multiple meshes (Shift/Cmd for additive)</td>
            </tr>
            <tr>
              <td>Click on Ground / Empty Space</td>
              <td>Clear selection (unless Shift or Cmd is held)</td>
            </tr>
            <tr>
              <td>Right Click (Hold &amp; Drag)</td>
              <td>Orbit &amp; rotate camera freely in 3D</td>
            </tr>
          </table>
        `,
      },
      {
        title: 'Touch & Mobile Controls',
        icon: 'smartphone',
        customHtml: `
          <table class="help-table">
            <tr>
              <td>Tap (1 Finger)</td>
              <td>Select mesh, facet, or drag 3D transform gizmo handles</td>
            </tr>
            <tr>
              <td>Drag (1 Finger)</td>
              <td>Orbit camera around the scene (or drag selection box in <em>Box Select</em> mode)</td>
            </tr>
            <tr>
              <td>Pinch &amp; Drag (2 Fingers)</td>
              <td>Zoom in/out and pan camera smoothly</td>
            </tr>
            <tr>
              <td>Touch Bar (Bottom Left)</td>
              <td>Switch <em>Orbit / Box Select</em>, toggle <em>+Select</em> (multi-select), <em>Snap</em>, and <em>Focus</em> without a keyboard</td>
            </tr>
          </table>
        `,
      },
      {
        title: 'Keyboard Shortcuts & Snapping',
        icon: 'keyboard',
        customHtml: `
          <table class="help-table">
            <tr>
              <td><span class="shortcut-tag">W, A, S, D</span> / <span class="shortcut-tag">Arrows</span></td>
              <td>Fly camera through the 3D scene (no gizmo conflict)</td>
            </tr>
            <tr>
              <td><span class="shortcut-tag">M</span></td>
              <td>Activate Move (Translate) gizmo</td>
            </tr>
            <tr>
              <td><span class="shortcut-tag">E</span></td>
              <td>Activate Rotate gizmo</td>
            </tr>
            <tr>
              <td><span class="shortcut-tag">R</span></td>
              <td>Activate Scale gizmo</td>
            </tr>
            <tr>
              <td><span class="shortcut-tag">B</span></td>
              <td>Activate Bounds (Bounding Box) gizmo</td>
            </tr>
            <tr>
              <td><span class="shortcut-tag">Cmd / Ctrl</span> (Hold while dragging)</td>
              <td>Snap movement to Move Grid (default: 0.1) or rotation to angle steps (default: 5°)</td>
            </tr>
            <tr>
              <td><span class="shortcut-tag">F</span></td>
              <td>Focus camera on selected object(s)</td>
            </tr>
            <tr>
              <td><span class="shortcut-tag">Cmd+Z / Ctrl+Z</span></td>
              <td>Undo last action</td>
            </tr>
            <tr>
              <td><span class="shortcut-tag">Cmd+Shift+Z / Cmd+Y</span></td>
              <td>Redo action</td>
            </tr>
            <tr>
              <td><span class="shortcut-tag">Cmd+G / Ctrl+G</span></td>
              <td>Group selected meshes (Shift+Cmd+G to ungroup)</td>
            </tr>
            <tr>
              <td><span class="shortcut-tag">Cmd+C / Ctrl+C</span></td>
              <td>Copy selected mesh(es)</td>
            </tr>
            <tr>
              <td><span class="shortcut-tag">Cmd+V / Ctrl+V</span></td>
              <td>Paste copied mesh(es) at 3D cursor position</td>
            </tr>
            <tr>
              <td><span class="shortcut-tag">Cmd+D / Ctrl+D</span></td>
              <td>Duplicate selected mesh(es)</td>
            </tr>
            <tr>
              <td><span class="shortcut-tag">Cmd+E / Ctrl+E</span></td>
              <td>Open Export 3D Model dialog</td>
            </tr>
            <tr>
              <td><span class="shortcut-tag">Cmd+P / Ctrl+P</span></td>
              <td>Capture Screenshot (Current / 4 / 8 Directions)</td>
            </tr>
            <tr>
              <td><span class="shortcut-tag">Del / Backspace</span></td>
              <td>Delete selected mesh(es) or facet</td>
            </tr>
            <tr>
              <td><span class="shortcut-tag">Escape</span></td>
              <td>Cancel active tool / deselect / close dialogs</td>
            </tr>
          </table>
        `,
      },
      {
        title: 'Multi-Selection & Scene Tree',
        icon: 'layers',
        customHtml: `
          <p class="help-prose">
            • <strong>Unified Multi-Transform:</strong> When multiple meshes are selected, a bounding proxy gizmo moves, rotates, and scales all items together with undo/redo support.<br />
            • <strong>Outliner Tree Selection:</strong> Click any mesh in the Scene Outliner to select it. Use <span class="shortcut-tag" style="font-size:10px">Cmd/Ctrl+Click</span> to toggle multi-selection or <span class="shortcut-tag" style="font-size:10px">Shift+Click</span> for range selection.<br />
            • <strong>Gizmo Switching:</strong> Switch gizmos (Move, Rotate, Scale, Bounds) at any time without losing your current selection.
          </p>
        `,
      },
    ],
  },
];
