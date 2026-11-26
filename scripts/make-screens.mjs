// 제출용 화면 사진 만들기: Edge(화면 없이)를 휴대폰 크기(390×844, 2배 선명도)로 열고,
// 버튼을 눌러 가며 주요 화면을 PNG로 찍어 docs/screenshots/ 에 저장합니다.
// 실행: node scripts/make-screens.mjs [사이트 주소]   (기본: https://hwanhangil.vercel.app)
// - 위치는 실제 GPS 대신 전북대 근처의 정해진 좌표를 씁니다(시연용). 음성은 끕니다.
// - Chrome DevTools Protocol(브라우저 원격 조작 규약)로 Edge를 조작합니다. 추가 설치가 필요 없습니다.
import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { openEdge, sleep } from "./lib/edge.mjs";

const SITE = (process.argv[2] ?? "https://hwanhangil.vercel.app").replace(/\/$/, "");
const OUT = fileURLToPath(new URL("../docs/screenshots/", import.meta.url));

// 시연 경로: 전북대 → 남서쪽 원룸촌
const ROUTE = "/?f=35.84663,127.13391,%EC%A0%84%EB%B6%81%EB%8C%80%ED%95%99%EA%B5%90&t=35.8400,127.1250,%EC%9B%90%EB%A3%B8%EC%B4%8C&l=mid";
const GUNSAN = "/?f=35.94693,126.68034,%EA%B5%AD%EB%A6%BD%EA%B5%B0%EC%82%B0%EB%8C%80&t=35.9600,126.6950,%EB%82%98%EC%9A%B4%EB%8F%99&l=mid";

mkdirSync(OUT, { recursive: true });
const { go, run, click, shot: capture, close } = await openEdge({ site: SITE });
const shot = async (name) => {
  await capture(join(OUT, name));
  console.log("📸", name);
};
try {
  // 1) 첫 화면
  await go("/", 6000);
  await shot("01-home.png");

  // 2) 안심 경로 결과: 지도 + 요약 문장이 보이게 패널을 스크롤
  await go(ROUTE, 6500);
  await run(`document.querySelector('[aria-live=polite]')?.scrollIntoView({ block: 'start' });`);
  await sleep(600);
  await shot("02-route.png");

  // 3) 길 안내 중 (출발 지점 근처를 걷는 중)
  await click("길 안내 시작");
  await sleep(800);
  await run(`window.__move(35.8458, 127.1326);`);
  await sleep(2500);
  await shot("03-navigation.png");

  // 4) 가까운 안전한 곳
  await go("/", 5000);
  await click("주변");
  await sleep(4000);
  await shot("04-safe-nearby.png");

  // 5) 군산 지역 안심 경로
  await go(GUNSAN, 7000);
  await shot("05-gunsan.png");

  // 6) 데이터 안내
  await go("/about", 3000);
  await shot("06-about.png");

  // 썸네일: 공유 미리보기 그림(1200×630)
  copyFileSync(fileURLToPath(new URL("../src/app/opengraph-image.png", import.meta.url)), join(OUT, "00-thumbnail.png"));
  console.log("📸 00-thumbnail.png (공유 미리보기 그림)");
} finally {
  await close();
}
