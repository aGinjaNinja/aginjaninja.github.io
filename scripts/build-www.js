// Copies web assets into www/ for Capacitor to bundle into the Android app
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'www');

// Clean & create output dir
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

// Directories to copy
const dirs = ['css', 'js', 'img'];
dirs.forEach(d => {
  const src = path.join(ROOT, d);
  if (fs.existsSync(src)) {
    copyDirSync(src, path.join(OUT, d));
  }
});

// Root files to copy
const files = [
  'index.html', 'dashboard.html', 'devices.html', 'racks.html',
  'ports.html', 'photos.html', 'cableruns.html', 'checklist.html',
  'flowchart.html', 'log.html', 'scan.html', 'settings.html',
  'sitemap.html', 'fieldmode.html', 'manifest.json', 'sw.js'
];
files.forEach(f => {
  const src = path.join(ROOT, f);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(OUT, f));
  }
});

console.log('Built www/ with', dirs.length, 'dirs and', files.length, 'files');

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDirSync(s, d);
    else fs.copyFileSync(s, d);
  }
}
