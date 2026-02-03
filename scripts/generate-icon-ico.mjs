import fs from 'node:fs';
import path from 'node:path';
import pngToIco from 'png-to-ico';
import sharp from 'sharp';

const ROOT = path.resolve(process.cwd());
const pngPath = path.join(ROOT, 'assets', 'icon.png');
const icoPath = path.join(ROOT, 'assets', 'icon.ico');
const trayIcoPath = path.join(ROOT, 'assets', 'tray.ico');
const trayPngPath = path.join(ROOT, 'assets', 'tray.png');

const ICON_SHAPE = (process.env.ICON_SHAPE || 'circle').toLowerCase();
const sizes = [16, 24, 32, 48, 64, 128, 256];
const traySizes = [16, 24, 32, 48];

async function renderSizedPng(size) {
  let pipeline = sharp(pngPath)
    .ensureAlpha()
    .resize(size, size, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    });

  if (ICON_SHAPE === 'circle') {
    const r = size / 2;
    const svg = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg"><circle cx="${r}" cy="${r}" r="${r}" fill="white"/></svg>`;
    pipeline = pipeline.composite([{ input: Buffer.from(svg), blend: 'dest-in' }]);
  }

  return pipeline.png({ compressionLevel: 9 }).toBuffer();
}

if (!fs.existsSync(pngPath)) {
  console.error(`Missing ${pngPath}. Add your PNG icon first.`);
  process.exit(1);
}

try {
  const images = await Promise.all(sizes.map((s) => renderSizedPng(s)));
  const trayImages = await Promise.all(traySizes.map((s) => renderSizedPng(s)));

  const buf = await pngToIco(images);
  fs.writeFileSync(icoPath, buf);
  console.log(`Wrote ${icoPath}`);
  console.log(`Included sizes: ${sizes.join(', ')} (${ICON_SHAPE})`);

  const trayBuf = await pngToIco(trayImages);
  fs.writeFileSync(trayIcoPath, trayBuf);
  console.log(`Wrote ${trayIcoPath}`);
  console.log(`Included sizes: ${traySizes.join(', ')} (${ICON_SHAPE})`);

  // Also emit a PNG for dev/debug and for platforms that prefer PNG tray icons.
  const trayPng = await renderSizedPng(32);
  fs.writeFileSync(trayPngPath, trayPng);
  console.log(`Wrote ${trayPngPath}`);
} catch (err) {
  console.error('Failed to generate .ico from .png');
  console.error(err);
  process.exit(1);
}
