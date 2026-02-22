const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const imagesDir = path.join(root, 'assets', 'images', 'result');
const images = [
  'character_jeju_coast.svg',
  'character_city_twilight.svg',
  'character_mountain_mist.svg',
];

const missing = images.filter((file) => !fs.existsSync(path.join(imagesDir, file)));

if (missing.length === 0) {
  console.log('OK: All result images found.');
  process.exit(0);
}

console.log('Missing result images:');
missing.forEach((file) => console.log(`- ${file}`));
process.exit(1);
