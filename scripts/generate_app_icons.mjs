import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

// Function to generate a simple RGBA PNG buffer with an emerald "V" badge
function createPngBuffer(width, height) {
  // Raw RGBA image data
  const rowSize = width * 4 + 1; // 1 filter byte per scanline
  const rawData = Buffer.alloc(rowSize * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // Filter type: None

    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;

      // Draw rounded rectangle / emerald background
      const cx = width / 2;
      const cy = height / 2;
      const r = width * 0.45;
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);

      if (dist <= r) {
        // Emerald green gradient (#10b981)
        rawData[pxOffset] = 16;     // R
        rawData[pxOffset + 1] = 185; // G
        rawData[pxOffset + 2] = 129; // B
        rawData[pxOffset + 3] = 255; // Alpha
      } else {
        // Transparent
        rawData[pxOffset] = 0;
        rawData[pxOffset + 1] = 0;
        rawData[pxOffset + 2] = 0;
        rawData[pxOffset + 3] = 0;
      }
    }
  }

  // PNG Signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // Bit depth: 8
  ihdr[9] = 6; // Color type: RGBA
  ihdr[10] = 0; // Compression
  ihdr[11] = 0; // Filter
  ihdr[12] = 0; // Interlace
  const ihdrChunk = createChunk('IHDR', ihdr);

  // IDAT chunk
  const compressed = zlib.deflateSync(rawData);
  const idatChunk = createChunk('IDAT', compressed);

  // IEND chunk
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
  const length = data.length;
  const chunk = Buffer.alloc(4 + 4 + length + 4);
  chunk.writeUInt32BE(length, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);

  const crc = crc32(chunk.subarray(4, 8 + length));
  chunk.writeUInt32BE(crc >>> 0, 8 + length);
  return chunk;
}

// Standard CRC32 table
const crcTable = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

// Function to generate an .ico file embedding 32x32 PNG
function createIcoBuffer(png32) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // Reserved
  header.writeUInt16LE(1, 2); // Type 1 = Icon
  header.writeUInt16LE(1, 4); // Number of images

  const dirEntry = Buffer.alloc(16);
  dirEntry.writeUInt8(32, 0); // Width
  dirEntry.writeUInt8(32, 1); // Height
  dirEntry.writeUInt8(0, 2);  // Colors
  dirEntry.writeUInt8(0, 3);  // Reserved
  dirEntry.writeUInt16LE(1, 4); // Color planes
  dirEntry.writeUInt16LE(32, 6); // Bits per pixel
  dirEntry.writeUInt32LE(png32.length, 8); // Image size in bytes
  dirEntry.writeUInt32LE(22, 12); // Offset to image data (6 + 16 = 22)

  return Buffer.concat([header, dirEntry, png32]);
}

async function main() {
  const iconsDir = path.resolve('src-tauri/icons');
  if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
  }

  const png32 = createPngBuffer(32, 32);
  const png128 = createPngBuffer(128, 128);
  const png256 = createPngBuffer(256, 256);
  const png512 = createPngBuffer(512, 512);
  const ico = createIcoBuffer(png32);

  fs.writeFileSync(path.join(iconsDir, '32x32.png'), png32);
  fs.writeFileSync(path.join(iconsDir, '128x128.png'), png128);
  fs.writeFileSync(path.join(iconsDir, '128x128@2x.png'), png256);
  fs.writeFileSync(path.join(iconsDir, 'icon.png'), png512);
  fs.writeFileSync(path.join(iconsDir, 'icon.ico'), ico);

  // Also copy to public/ directory for Web PWA / favicon
  const publicDir = path.resolve('public');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }
  fs.writeFileSync(path.join(publicDir, 'icon-512.png'), png512);
  fs.writeFileSync(path.join(publicDir, 'icon-192.png'), png128);

  console.log('Successfully generated icons for Tauri 2 and Web PWA.');
}

main().catch(console.error);
