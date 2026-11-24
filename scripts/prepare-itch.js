const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const itchDir = path.join(rootDir, 'dist-itch');
const releaseDir = path.join(rootDir, 'release');
const pkgPath = path.join(rootDir, 'package.json');

if (!fs.existsSync(distDir)) {
  console.error('[prepare-itch] dist directory not found. Please run "npm run build" first.');
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const version = pkg.version || '0.0.0';
const zipName = `MeshEditor-${version}-itch-html5.zip`;
const zipPath = path.join(releaseDir, zipName);

const EXCLUDED_TOP_LEVEL = new Set([
  'screenshots',
  'models',
  'src',
  'webcomponent-example.html',
  'app.html',
  'mesheditor-element.bundle.js',
  'mesheditor-element.bundle.js.LICENSE.txt',
]);

const EXCLUDED_FILENAMES = new Set(['.DS_Store', 'Thumbs.db']);

function shouldCopy(srcPath) {
  const rel = path.relative(distDir, srcPath);
  if (!rel) return true;

  const parts = rel.split(path.sep);
  const baseName = parts[parts.length - 1];

  if (EXCLUDED_FILENAMES.has(baseName)) return false;
  if (EXCLUDED_TOP_LEVEL.has(parts[0])) return false;
  if (baseName.endsWith('.map')) return false;

  return true;
}

function getDirStats(dirPath) {
  let totalBytes = 0;
  let fileCount = 0;

  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      const sub = getDirStats(fullPath);
      totalBytes += sub.totalBytes;
      fileCount += sub.fileCount;
    } else if (entry.isFile()) {
      totalBytes += fs.statSync(fullPath).size;
      fileCount += 1;
    }
  }

  return { totalBytes, fileCount };
}

function formatMB(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// Verify dist/index.html is the editor app (not the docs landing page from build:pages)
const indexHtmlPath = path.join(distDir, 'index.html');
if (!fs.existsSync(indexHtmlPath)) {
  console.error('[prepare-itch] dist/index.html not found. Please run "npm run build" first.');
  process.exit(1);
}
const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
if (!indexHtml.includes('renderCanvas')) {
  console.error(
    '[prepare-itch] dist/index.html appears to be the marketing landing page instead of the Mesh Editor app. Run "npm run build" (not "npm run build:pages") before packaging for itch.io.',
  );
  process.exit(1);
}

// 1. Rebuild clean dist-itch/ folder
fs.rmSync(itchDir, { recursive: true, force: true });
fs.cpSync(distDir, itchDir, {
  recursive: true,
  force: true,
  filter: shouldCopy,
});

const stats = getDirStats(itchDir);
console.log(
  `[prepare-itch] Prepared clean HTML5 build in dist-itch/ (${stats.fileCount} files, ${formatMB(stats.totalBytes)})`,
);

// 2. Create ready-to-upload ZIP in release/
fs.mkdirSync(releaseDir, { recursive: true });
if (fs.existsSync(zipPath)) {
  fs.unlinkSync(zipPath);
}

try {
  if (process.platform === 'win32') {
    execFileSync(
      'powershell',
      ['-NoProfile', '-Command', `Compress-Archive -Path '${itchDir}\\*' -DestinationPath '${zipPath}' -Force`],
      { stdio: 'inherit' },
    );
  } else {
    execFileSync('zip', ['-r', '-q', zipPath, '.'], { cwd: itchDir, stdio: 'inherit' });
  }
  const zipSize = fs.statSync(zipPath).size;
  console.log(`[prepare-itch] Created itch.io HTML5 archive: release/${zipName} (${formatMB(zipSize)})`);
} catch (err) {
  console.warn(`[prepare-itch] Could not create ZIP automatically (${err.message}). You can still zip or push dist-itch/ directly.`);
}
