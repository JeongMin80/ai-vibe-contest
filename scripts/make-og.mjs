// 공유 미리보기 이미지 만들기: scripts/og/og.html 을 Edge(헤드리스)로 1200×630 크기로 찍어 저장합니다.
// 실행: node scripts/make-og.mjs   (Windows, Microsoft Edge 필요 · 한글은 PC에 설치된 Noto Sans KR 사용)
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const EDGE = [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
].find(existsSync);
if (!EDGE) {
  console.error("Microsoft Edge 를 찾지 못했습니다.");
  process.exit(1);
}

const html = new URL("./og/og.html", import.meta.url);
const out = fileURLToPath(new URL("../src/app/opengraph-image.png", import.meta.url));
execFileSync(EDGE, [
  "--headless",
  "--disable-gpu",
  "--hide-scrollbars",
  "--force-device-scale-factor=1",
  "--window-size=1200,630",
  "--virtual-time-budget=2000",
  `--screenshot=${out}`,
  pathToFileURL(fileURLToPath(html)).href,
]);
// 트위터(X) 카드도 같은 그림
copyFileSync(out, out.replace("opengraph-image", "twitter-image"));
console.log(`${out} ${Math.round(statSync(out).size / 1024)}KB`);
