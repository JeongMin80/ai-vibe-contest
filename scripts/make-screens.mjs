// 제출용 화면 사진 만들기: Edge(화면 없이)를 휴대폰 크기(390×844, 2배 선명도)로 열고,
// 버튼을 눌러 가며 주요 화면을 PNG로 찍어 docs/screenshots/ 에 저장합니다.
// 실행: node scripts/make-screens.mjs [사이트 주소]   (기본: https://hwanhangil.vercel.app)
// - 위치는 실제 GPS 대신 전북대 근처의 정해진 좌표를 씁니다(시연용). 음성은 끕니다.
// - Chrome DevTools Protocol(브라우저 원격 조작 규약)로 Edge를 조작합니다. 추가 설치가 필요 없습니다.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SITE = (process.argv[2] ?? "https://hwanhangil.vercel.app").replace(/\/$/, "");
const OUT = fileURLToPath(new URL("../docs/screenshots/", import.meta.url));
const EDGE = [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
].find(existsSync);
if (!EDGE) throw new Error("Microsoft Edge 를 찾지 못했습니다.");

const PORT = 9333;
const profile = mkdtempSync(join(tmpdir(), "hwanhangil-shots-"));
const edge = spawn(EDGE, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--no-first-run", "about:blank"], {
  stdio: "ignore",
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- DevTools 연결 ----
let ws;
let seq = 0;
const pending = new Map();
function send(method, params = {}) {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}
async function connect() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === "page");
      if (page) {
        ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((r, j) => {
          ws.onopen = r;
          ws.onerror = j;
        });
        ws.onmessage = (e) => {
          const m = JSON.parse(e.data);
          if (m.id && pending.has(m.id)) {
            const p = pending.get(m.id);
            pending.delete(m.id);
            if (m.error) p.reject(new Error(m.error.message));
            else p.resolve(m.result);
          }
        };
        return;
      }
    } catch {}
    await sleep(200);
  }
  throw new Error("Edge 에 연결하지 못했습니다.");
}
async function run(js) {
  const r = await send("Runtime.evaluate", { expression: `(async () => { ${js} })()`, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? "스크립트 오류");
  return r.result.value;
}
async function go(path, wait = 4500) {
  await send("Page.navigate", { url: SITE + path });
  await sleep(wait);
}
async function shot(name) {
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(OUT, name), Buffer.from(data, "base64"));
  console.log("📸", name);
}
// 버튼 누르기 (글자가 포함된 첫 버튼·링크)
const click = (text) =>
  run(`const b = [...document.querySelectorAll('button, a')].find(x => x.textContent.includes(${JSON.stringify(text)}));
       if (!b) throw new Error('버튼 없음: ' + ${JSON.stringify(text)}); b.click();`);

// 페이지마다 먼저 실행: 첫 방문 안내 닫힘, 위치는 시연용 좌표(바꿀 수 있게), 음성은 끔
const PRELUDE = `
  try { localStorage.setItem('hwanhangil.onboarded.v1', '1'); localStorage.setItem('hwanhangil.voice.v1', '1'); } catch {}
  window.__pos = { latitude: 35.84663, longitude: 127.13391, accuracy: 8 };
  window.__watchers = [];
  const geo = navigator.geolocation;
  geo.getCurrentPosition = (ok) => setTimeout(() => ok({ coords: window.__pos, timestamp: Date.now() }), 50);
  geo.watchPosition = (ok) => { window.__watchers.push(ok); setTimeout(() => ok({ coords: window.__pos, timestamp: Date.now() }), 50); return window.__watchers.length; };
  geo.clearWatch = () => {};
  window.__move = (lat, lng) => { window.__pos = { latitude: lat, longitude: lng, accuracy: 8 }; window.__watchers.forEach(w => w({ coords: window.__pos, timestamp: Date.now() })); };
  if (window.speechSynthesis) { window.speechSynthesis.speak = () => {}; }
`;

// 시연 경로: 전북대 → 남서쪽 원룸촌
const ROUTE = "/?f=35.84663,127.13391,%EC%A0%84%EB%B6%81%EB%8C%80%ED%95%99%EA%B5%90&t=35.8400,127.1250,%EC%9B%90%EB%A3%B8%EC%B4%8C&l=mid";
const GUNSAN = "/?f=35.94693,126.68034,%EA%B5%AD%EB%A6%BD%EA%B5%B0%EC%82%B0%EB%8C%80&t=35.9600,126.6950,%EB%82%98%EC%9A%B4%EB%8F%99&l=mid";

try {
  mkdirSync(OUT, { recursive: true });
  await connect();
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send("Emulation.setTouchEmulationEnabled", { enabled: true });
  await send("Page.addScriptToEvaluateOnNewDocument", { source: PRELUDE });

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
  ws?.close();
  edge.kill();
  await sleep(500);
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {}
}
