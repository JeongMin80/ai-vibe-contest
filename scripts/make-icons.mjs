// 앱 아이콘 PNG 만들기 (외부 이미지 도구 없이 직접 픽셀을 계산해 PNG로 저장)
// 디자인: 밤하늘색 바탕 + 은은하게 번지는 노란 빛 + 가운데 환한 점 (화면 왼쪽 위 로고와 같은 모양)
// 실행: node scripts/make-icons.mjs
// 결과: public/icons/icon-192.png, icon-512.png, maskable-512.png, src/app/icon.png, src/app/apple-icon.png

import { writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { deflateSync } from "node:zlib";

const BG = [11, 16, 32]; // #0b1020
const LIGHT = [255, 209, 102]; // #ffd166

// ---------- PNG 저장 ----------
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, pixel) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // 필터 없음
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
      raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // 8비트
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------- 그림 ----------
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

/**
 * @param scale 1이면 꽉 차게, 작을수록 가운데로 모임 (maskable 아이콘의 안전 영역용)
 * @param round 모서리를 둥글게 자를지 (일반 아이콘)
 */
function draw(size, { scale = 1, round = true } = {}) {
  const c = (size - 1) / 2;
  const R = size / 2;
  return png(size, (x, y) => {
    const dx = (x - c) / (R * scale);
    const dy = (y - c) / (R * scale);
    const d = Math.hypot(dx, dy);
    // 번지는 빛 + 가운데 점(가장자리를 부드럽게)
    const glow = Math.exp(-((d / 0.42) ** 2)) * 0.55;
    const edge = 1.5 / (R * scale);
    const core = Math.min(1, Math.max(0, (0.2 - d) / edge + 0.5));
    let col = mix(BG, LIGHT, Math.min(1, glow));
    col = mix(col, [255, 236, 179], core); // 가운데는 더 밝게
    // 둥근 모서리 (반지름 = 크기의 22%)
    let alpha = 255;
    if (round) {
      const rr = size * 0.22;
      const qx = Math.max(Math.abs(x - c) - (c - rr), 0);
      const qy = Math.max(Math.abs(y - c) - (c - rr), 0);
      const out = Math.hypot(qx, qy) - rr;
      alpha = Math.round(255 * Math.min(1, Math.max(0, 0.5 - out)));
    }
    return [...col, alpha];
  });
}

const root = new URL("../", import.meta.url);
mkdirSync(new URL("public/icons/", root), { recursive: true });
const out = {
  "public/icons/icon-192.png": draw(192),
  "public/icons/icon-512.png": draw(512),
  // maskable: 안드로이드가 원·물방울 모양으로 잘라내므로 꽉 채우고 내용은 안쪽 80%에
  "public/icons/maskable-512.png": draw(512, { scale: 0.8, round: false }),
  "src/app/icon.png": draw(64),
  "src/app/apple-icon.png": draw(180, { round: false }),
};
for (const [path, buf] of Object.entries(out)) {
  writeFileSync(new URL(path, root), buf);
  console.log(`${path} ${(buf.length / 1024).toFixed(1)}KB`);
}
// Next.js 기본 favicon(Next 로고)은 우리 아이콘으로 대신합니다
const fav = new URL("src/app/favicon.ico", root);
if (existsSync(fav)) {
  rmSync(fav);
  console.log("src/app/favicon.ico 삭제 (icon.png로 대체)");
}
