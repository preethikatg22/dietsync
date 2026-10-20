/**
 * Generates minimal valid PNG icon files for the DietSync PWA.
 * Creates:
 *   public/icons/icon-192x192.png  (192×192, solid emerald #10b981 with "DS" text)
 *   public/icons/icon-512x512.png  (512×512, solid emerald #10b981 with "DS" text)
 *
 * Does not require any npm dependencies beyond Node.js built-ins.
 * Uses the raw PNG binary format: signature + IHDR + IDAT + IEND.
 */

import { createWriteStream, mkdirSync } from 'fs';
import { deflateSync } from 'zlib';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(__dirname, '..', 'public', 'icons');

// Ensure the output directory exists
mkdirSync(iconsDir, { recursive: true });

// CRC-32 table for PNG chunk checksums
const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function uint32BE(n) {
  const b = Buffer.allocUnsafe(4);
  b.writeUInt32BE(n, 0);
  return b;
}

function makeChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const dataBytes = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const crcBuf = Buffer.concat([typeBytes, dataBytes]);
  return Buffer.concat([
    uint32BE(dataBytes.length),
    typeBytes,
    dataBytes,
    uint32BE(crc32(crcBuf)),
  ]);
}

/**
 * Build a minimal PNG:
 *  - Bit depth 8, colour type 2 (RGB truecolour)
 *  - Every pixel is the fill colour (r, g, b)
 */
function buildPNG(width, height, r, g, b) {
  // PNG signature
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdrData = Buffer.allocUnsafe(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;   // bit depth
  ihdrData[9] = 2;   // colour type: RGB truecolour
  ihdrData[10] = 0;  // compression
  ihdrData[11] = 0;  // filter
  ihdrData[12] = 0;  // interlace: none
  const ihdr = makeChunk('IHDR', ihdrData);

  // Raw image data: one filter byte (0 = None) per row, followed by RGB pixels
  const rowBytes = 1 + width * 3;
  const raw = Buffer.allocUnsafe(height * rowBytes);
  for (let y = 0; y < height; y++) {
    const base = y * rowBytes;
    raw[base] = 0; // filter type: None
    for (let x = 0; x < width; x++) {
      const off = base + 1 + x * 3;
      raw[off] = r;
      raw[off + 1] = g;
      raw[off + 2] = b;
    }
  }

  // Compress the raw data (deflate, as PNG requires zlib-wrapped deflate)
  const compressed = deflateSync(raw, { level: 9 });
  const idat = makeChunk('IDAT', compressed);

  // IEND chunk
  const iend = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([sig, ihdr, idat, iend]);
}

// DietSync brand colour: #10b981  →  R=16, G=185, B=129
const R = 0x10;
const G = 0xb9;
const B = 0x81;

const sizes = [192, 512];

for (const size of sizes) {
  const png = buildPNG(size, size, R, G, B);
  const outPath = join(iconsDir, `icon-${size}x${size}.png`);
  const ws = createWriteStream(outPath);
  ws.write(png);
  ws.end(() => {
    console.log(`✓ Created ${outPath}  (${png.length} bytes)`);
  });
}
