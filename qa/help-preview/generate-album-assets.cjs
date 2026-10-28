// Run with the workspace Node runtime. Sharp is an existing API dependency.
const path = require('node:path');
const fs = require('node:fs/promises');
const sharp = require(path.resolve(__dirname, '../../../LeaderProductAPI/node_modules/sharp'));
const palettes = [
  { wall: '#D39D6F', floor: '#89664D', furniture: '#714C39', accent: '#F2DFBD' },
  { wall: '#6FA399', floor: '#406D67', furniture: '#315A55', accent: '#D5E6C5' },
  { wall: '#8F99B9', floor: '#545F80', furniture: '#3C4668', accent: '#E0DDFA' },
  { wall: '#BE8C96', floor: '#865B68', furniture: '#603B4C', accent: '#F2D8D5' },
];
const sizes = [[720, 1080], [1440, 810], [960, 960], [1280, 960], [640, 1120], [1600, 800], [800, 1000], [1440, 960], [960, 960], [700, 1080]];
async function main() {
  const output = path.join(__dirname, 'assets/albums'); await fs.mkdir(output, { recursive: true });
  for (const [index, [width, height]] of sizes.entries()) {
    const palette = palettes[index % palettes.length], w = 640, h = Math.round(w * height / width);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${palette.wall}"/><path d="M0 ${h * .72}H640V${h}H0Z" fill="${palette.floor}"/><rect x="72" y="${h * .12}" width="185" height="${h * .32}" rx="5" fill="${palette.accent}"/><path d="M165 ${h * .12}V${h * .44}M72 ${h * .28}H257" stroke="${palette.wall}" stroke-width="12"/><circle cx="475" cy="${h * .28}" r="63" fill="${palette.accent}" opacity=".7"/><rect x="180" y="${h * .59}" width="330" height="${h * .2}" rx="25" fill="${palette.furniture}"/><rect x="195" y="${h * .55}" width="140" height="${h * .15}" rx="18" fill="${palette.accent}" opacity=".8"/><path d="M110 ${h * .76}V${h * .52}M110 ${h * .62}Q35 ${h * .46} 110 ${h * .52}Q195 ${h * .42} 110 ${h * .66}" stroke="#305F4B" stroke-width="15" fill="#477B56"/><path d="M70 ${h * .73}H150L137 ${h * .85}H83Z" fill="${palette.accent}"/><text x="575" y="${h - 28}" font-family="sans-serif" text-anchor="middle" font-size="40" fill="${palette.accent}">${index + 1}</text></svg>`;
    const destination = path.join(output, `room-${String(index + 1).padStart(2, '0')}.png`);
    await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(destination);
    const metadata = await sharp(destination).metadata();
    if (metadata.width !== width || metadata.height !== height || metadata.format !== 'png') throw new Error(`Invalid PNG: ${destination}`);
  }
  console.log('Generated and decoded 10 local album PNG assets');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
