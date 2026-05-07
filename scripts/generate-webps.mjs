import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const targets = [
  'four-horsemen-workshop',
  'jt-visuals-workshop',
  'lucid-horizon-workshop',
  'known-productions-workshop',
];

for (const slug of targets) {
  const inFile = path.join(root, 'public/og-images', slug + '.jpg');
  const outFile = path.join(root, 'public/og-images', slug + '.webp');
  await sharp(inFile).webp({ quality: 80 }).toFile(outFile);
  console.log('wrote', outFile);
}
