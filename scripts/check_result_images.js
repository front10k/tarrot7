const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const imagesDir = path.join(root, 'assets', 'images', 'result');
const images = [
  'photo_aurora_bay.jpg',
  'photo_han_river.jpg',
  'photo_pine_ridge.jpg',
  'photo_night_market.jpg',
  'photo_dawn_field.jpg',
  'photo_cloud_pass.jpg',
  'photo_harbor_light.jpg',
  'photo_skyline.jpg',
  'photo_stone_valley.jpg',
  'photo_tide_bridge.jpg',
  'photo_city_pulse.jpg',
  'photo_summit_mist.jpg',
];

const missing = images.filter((file) => !fs.existsSync(path.join(imagesDir, file)));

if (missing.length === 0) {
  console.log('OK: All result images found.');
  process.exit(0);
}

console.log('Missing result images:');
missing.forEach((file) => console.log(`- ${file}`));
process.exit(1);
