// 자막이 들어간 시연 영상 자동 만들기 (소리 없음)
// 실행: npm run demo-video [사이트 주소]   (기본: https://hwanhangil.vercel.app) → docs/demo/hwanhangil-demo.mp4 (또는 .webm)
//
// 방법
// 1) Edge(화면 없이)를 휴대폰 크기로 열고, 화면이 바뀔 때마다 오는 화면 프레임(DevTools screencast)을 모읍니다.
// 2) 사람이 쓰는 순서대로 버튼을 누르고, 길 안내는 실제 안심 경로를 따라 위치를 조금씩 옮겨 "걷는" 장면을 만듭니다.
//    (경로는 앱과 같은 계산 코드 src/lib/routing.ts 로 미리 구합니다)
// 3) 모은 프레임과 자막을 브라우저 안의 캔버스에 시간 순서대로 그리며 녹화(MediaRecorder)해 영상 파일로 만듭니다.
//    ffmpeg 같은 프로그램을 따로 설치할 필요가 없습니다. 녹화는 실제 시간만큼 걸립니다(약 1분 30초).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildGraph, findRoute, nearestNode, distM } from "../src/lib/routing.ts";
import { isNight } from "../src/lib/sun.ts";
import { openEdge, sleep } from "./lib/edge.mjs";

const SITE = (process.argv[2] ?? "https://hwanhangil.vercel.app").replace(/\/$/, "");
const OUT_DIR = fileURLToPath(new URL("../docs/demo/", import.meta.url));

// 시연 경로: 전북대 → 남서쪽 원룸촌 (앱의 "보통" 안전 우선 = 가중치 3)
const FROM = [35.84663, 127.13391];
const TO = [35.84, 127.125];
const ROUTE = `/?f=${FROM.join(",")},전북대학교&t=${TO.join(",")},원룸촌&l=mid`;

// ---- 1) 걷는 경로 미리 계산 ----
function walkPoints() {
  const raw = JSON.parse(readFileSync(new URL("../public/data/jeonju/graph.json", import.meta.url), "utf8"));
  const g = buildGraph(raw);
  const a = nearestNode(g, ...FROM);
  const b = nearestNode(g, ...TO);
  const night = isNight(new Date(), 35.8242, 127.148);
  const route = findRoute(g, a.node, b.node, 3, { night });
  const pts = [];
  for (const s of route.segments) for (const p of s.path) pts.push(p);
  // 12m 간격으로 고르게 나누기
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const [la0, ln0] = pts[i - 1];
    const [la1, ln1] = pts[i];
    const d = distM(la0, ln0, la1, ln1);
    const n = Math.max(1, Math.round(d / 12));
    for (let k = 1; k <= n; k++) out.push([la0 + ((la1 - la0) * k) / n, ln0 + ((ln1 - ln0) * k) / n]);
  }
  out.push(TO);
  return out;
}
const WALK = walkPoints();

// ---- 2) 화면 녹화 ----
mkdirSync(OUT_DIR, { recursive: true });
const edge = await openEdge({ site: SITE });
const { send, on, run, go: goRaw, waitFor, click } = edge;

const frames = []; // { t: 초, data: base64 JPEG }
const captions = []; // { t, step, title, sub }
let lastKept = 0;
on("Page.screencastFrame", (p) => {
  send("Page.screencastFrameAck", { sessionId: p.sessionId }).catch(() => {});
  const t = p.metadata.timestamp;
  if (t - lastKept < 1 / 12) return; // 초당 12장까지만
  lastKept = t;
  frames.push({ t, data: p.data });
});
let step = 0;
const caption = (title, sub = "") => captions.push({ t: Date.now() / 1000, step: ++step, title, sub });

const go = async (path) => {
  await goRaw(path, 300);
  if (!path.startsWith("/about")) await waitFor(`document.querySelector('.leaflet-container')`, 20000, "지도 표시");
  await sleep(600);
};
const radio = (group, label) =>
  run(`[...document.querySelectorAll('[role=radiogroup][aria-label="${group}"] [role=radio]')].find(b => b.textContent.includes(${JSON.stringify(label)})).click();`);

try {
  await go("/");
  await send("Page.startScreencast", { format: "jpeg", quality: 72, maxWidth: 720, maxHeight: 1600, everyNthFrame: 1 });
  caption("환한길 · 밤길 안심 경로", "가장 빠른 길이 아니라, 가장 밝은 길로 집까지");
  await sleep(3500);
  caption("공공데이터로 만든 밤길 지도", "CCTV(파랑) · 보안등(주황) · 큰길 조명(노란 빛) · 안전비상벨(빨강)");
  await run(`document.querySelector('.leaflet-control-zoom-in')?.click();`);
  await sleep(4000);

  caption("출발·도착을 고르면 안심 경로", "색깔 선 = 안심 경로(초록 밝음 → 빨강 어두움), 회색 점선 = 최단 경로");
  await go(ROUTE);
  await waitFor(`document.querySelector('[aria-live=polite] p')`, 20000, "경로 결과");
  await sleep(2500);
  await run(`document.querySelector('[aria-live=polite]')?.scrollIntoView({ block: 'start', behavior: 'smooth' });`);
  await sleep(3500);

  caption("안전 우선 정도를 고를 수 있어요", "조금 · 보통 · 최대 — 돌아가는 거리와 밝은 길 사이에서 선택");
  await radio("안전 우선 정도", "최대");
  await sleep(3000);
  await radio("안전 우선 정도", "보통");
  await sleep(2500);

  caption("길 안내 시작", "남은 거리 · 지금 걷는 길의 안전 정도 · 앞쪽 어두운 구간 예고");
  await click("길 안내 시작");
  await sleep(1500);
  const quarter = Math.round(WALK.length * 0.25);
  for (let i = 0; i < quarter; i++) {
    await run(`window.__move(${WALK[i][0]}, ${WALK[i][1]});`);
    await sleep(180);
  }

  await click("출발 알리기");
  await sleep(300);
  const msg = (await run(`return window.__copied ?? '';`)).split("\n")[0].replace("[환한길] ", "");
  caption("📨 가족·친구에게 출발 알리기", `"${msg}" + 경로 링크`);
  await sleep(4500);

  caption("걷는 동안 음성·진동으로 알려 줘요", "어두운 길 60m 앞 · 경로에서 벗어남 · 도착 — 휴대폰을 주머니에 넣어도 OK");
  for (let i = quarter; i < WALK.length; i++) {
    await run(`window.__move(${WALK[i][0]}, ${WALK[i][1]});`);
    await sleep(150);
  }
  await run(`window.__move(${TO[0]}, ${TO[1]});`);
  await waitFor(`document.body.innerText.includes('도착했어요')`, 8000, "도착");
  await sleep(500);
  await click("도착 알리기");
  await sleep(300);
  caption("도착하면 📨 도착 알리기 한 번", `"${(await run(`return window.__copied ?? '';`)).replace("[환한길] ", "")}"`);
  await sleep(4000);

  caption("🆘 불안할 때: 가까운 안전한 곳", "가장 가까운 지구대 · 24시 편의점 · 안전비상벨까지 안심 경로, 112 바로 걸기");
  await go("/");
  await click("주변");
  await waitFor(`document.querySelectorAll('section[aria-label] li').length >= 3`, 15000, "주변 목록");
  await sleep(5000);

  caption("전주 · 군산 · 제주 대학가", "같은 방법으로 지역을 넓힐 수 있어요 (군산: 어두운 길 540m 줄임)");
  await go(`/?f=35.94693,126.68034,국립군산대&t=35.96,126.695,나운동&l=mid`);
  await sleep(4000);
  await go(`/?f=33.4547,126.56034,제주대학교&t=33.488,126.53,제주시내&l=mid`);
  await sleep(3500);

  caption("데이터 출처와 한계도 숨기지 않아요", "공공데이터 출처 · 갱신 시점 · 추정한 부분을 그대로 공개");
  await go("/about");
  for (let y = 0; y < 6; y++) {
    await run(`window.scrollBy({ top: 260, behavior: 'smooth' });`);
    await sleep(800);
  }
  caption("환한길 · hwanhangil.vercel.app", "앱 설치·로그인 없이 휴대폰 브라우저에서 바로");
  await go("/");
  await sleep(3500);
  await send("Page.stopScreencast");
  await sleep(300);
  console.log(`🎞️ 화면 ${frames.length}장, 자막 ${captions.length}개 모음`);

  // ---- 3) 캔버스에 그려 영상으로 녹화 ----
  await send("Page.navigate", { url: "about:blank" });
  await sleep(800);
  await run(`window.__f = []; window.__c = ${JSON.stringify(captions)};`);
  const t0 = frames[0].t;
  for (let i = 0; i < frames.length; i += 15) {
    const chunk = frames.slice(i, i + 15).map((f) => ({ t: f.t, d: f.data }));
    await run(`window.__f.push(...${JSON.stringify(chunk)});`);
  }
  const total = frames.at(-1).t - t0 + 1.5;
  console.log(`🎬 녹화 중… (약 ${Math.round(total)}초)`);

  const info = await run(`
    const F = window.__f, C = window.__c;
    const W = 720, VH = Math.round(W * 844 / 390 / 2) * 2, CAP = 190, H = VH + CAP;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; document.body.appendChild(cv);
    const ctx = cv.getContext('2d');
    const mime = ['video/mp4;codecs=avc1.640028', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find(m => MediaRecorder.isTypeSupported(m));
    const rec = new MediaRecorder(cv.captureStream(30), { mimeType: mime, videoBitsPerSecond: 1_800_000 });
    const parts = []; rec.ondataavailable = e => e.data.size && parts.push(e.data);
    const load = d => { const im = new Image(); im.src = 'data:image/jpeg;base64,' + d; return im.decode().then(() => im); };
    const FONT = '"Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
    const wrap = (text, maxW) => { const out = []; let line = ''; for (const ch of text) { if (ctx.measureText(line + ch).width > maxW && line) { out.push(line); line = ch; } else line += ch; } if (line) out.push(line); return out; };
    let img = null, cap = null;
    const draw = () => {
      ctx.fillStyle = '#0b1020'; ctx.fillRect(0, 0, W, H);
      if (img) ctx.drawImage(img, 0, 0, W, VH);
      ctx.fillStyle = '#0b1020'; ctx.fillRect(0, VH, W, CAP);
      ctx.fillStyle = '#fbbf24'; ctx.fillRect(0, VH, W, 4);
      if (cap) {
        ctx.fillStyle = '#fbbf24'; ctx.font = 'bold 22px ' + FONT; ctx.fillText(cap.step + ' / ' + C.length, 28, VH + 42);
        ctx.fillStyle = '#ffffff'; ctx.font = 'bold 34px ' + FONT;
        wrap(cap.title, W - 56).slice(0, 1).forEach((l, i) => ctx.fillText(l, 28, VH + 88 + i * 40));
        ctx.fillStyle = '#c3cbe0'; ctx.font = '24px ' + FONT;
        wrap(cap.sub, W - 56).slice(0, 2).forEach((l, i) => ctx.fillText(l, 28, VH + 128 + i * 32));
      }
    };
    const ev = [...F.map(f => ({ t: f.t, d: f.d })), ...C.map(c => ({ t: c.t, c }))].sort((a, b) => a.t - b.t);
    const start = ev[0].t;
    rec.start(1000);
    const wall0 = performance.now();
    let pending = null;
    for (let i = 0; i < ev.length; i++) {
      const e = ev[i];
      if (e.d) img = await (pending && pending.d === e.d ? pending.p : load(e.d));
      if (e.c) cap = e.c;
      const nx = ev.slice(i + 1).find(x => x.d);
      pending = nx ? { d: nx.d, p: load(nx.d) } : null;
      const until = (i + 1 < ev.length ? ev[i + 1].t : ev[i].t + 1.5) - start;
      do { draw(); await new Promise(r => setTimeout(r, 40)); } while ((performance.now() - wall0) / 1000 < until);
    }
    rec.stop();
    await new Promise(r => (rec.onstop = r));
    window.__blob = new Blob(parts, { type: mime.split(';')[0] });
    return { mime, size: window.__blob.size, seconds: Math.round((performance.now() - wall0) / 1000) };
  `);
  console.log(`✅ ${info.mime} · ${(info.size / 1e6).toFixed(1)}MB · ${info.seconds}초`);

  // 영상 파일을 조금씩 받아 저장
  const bufs = [];
  const STEP = 3_000_000;
  for (let off = 0; off < info.size; off += STEP) {
    const b64 = await run(`const b = window.__blob.slice(${off}, ${off + STEP});
      return await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(',')[1]); fr.readAsDataURL(b); });`);
    bufs.push(Buffer.from(b64, "base64"));
  }
  const ext = info.mime.includes("mp4") ? "mp4" : "webm";
  const file = join(OUT_DIR, `hwanhangil-demo.${ext}`);
  writeFileSync(file, Buffer.concat(bufs));
  console.log(`💾 ${file}`);
} finally {
  await edge.close();
}
