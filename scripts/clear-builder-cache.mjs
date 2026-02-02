import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function uniq(values) {
  return [...new Set(values.filter(Boolean))];
}

function rmDir(dirPath) {
  try {
    fs.rmSync(dirPath, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

const localAppData = process.env.LOCALAPPDATA;
const home = os.homedir();

const candidates = uniq([
  process.env.ELECTRON_BUILDER_CACHE ? path.resolve(process.env.ELECTRON_BUILDER_CACHE) : null,
  path.resolve('.cache', 'electron-builder'),
  localAppData ? path.join(localAppData, 'electron-builder', 'cache') : null,
  localAppData ? path.join(localAppData, 'electron-builder', 'Cache') : null,
  home ? path.join(home, 'AppData', 'Local', 'electron-builder', 'cache') : null,
  home ? path.join(home, 'AppData', 'Local', 'electron-builder', 'Cache') : null,
]);

const deleted = [];
for (const p of candidates) {
  if (fs.existsSync(p)) {
    if (rmDir(p)) deleted.push(p);
  }
}

if (deleted.length === 0) {
  console.log('No electron-builder cache directories found to delete.');
} else {
  console.log('Deleted electron-builder cache directories:');
  for (const p of deleted) console.log(`- ${p}`);
}
