// Edge(화면 없이)를 휴대폰 크기로 열고 Chrome DevTools Protocol(브라우저 원격 조작 규약)로 조작하는 도우미.
// make-screens.mjs(화면 사진)와 check-live.mjs(실제 사이트 자동 점검)가 함께 씁니다. 추가 설치가 필요 없습니다.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 페이지마다 먼저 실행: 첫 방문 안내 닫힘, 위치는 시연용 좌표(__move로 바꿀 수 있음), 음성은 소리 없이,
// 공유창 대신 복사(__copied에 기록)
export const PRELUDE = `
  try { localStorage.setItem('hwanhangil.onboarded.v1', '1'); localStorage.setItem('hwanhangil.voice.v1', '1'); } catch {}
  window.__pos = { latitude: 35.84663, longitude: 127.13391, accuracy: 8 };
  window.__watchers = [];
  const geo = navigator.geolocation;
  geo.getCurrentPosition = (ok) => setTimeout(() => ok({ coords: window.__pos, timestamp: Date.now() }), 50);
  geo.watchPosition = (ok) => { window.__watchers.push(ok); setTimeout(() => ok({ coords: window.__pos, timestamp: Date.now() }), 50); return window.__watchers.length; };
  geo.clearWatch = () => {};
  window.__move = (lat, lng) => { window.__pos = { latitude: lat, longitude: lng, accuracy: 8 }; window.__watchers.forEach(w => w({ coords: window.__pos, timestamp: Date.now() })); };
  if (window.speechSynthesis) { window.speechSynthesis.speak = () => {}; }
  try { Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }); } catch {}
  window.__copied = null;
  try { Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (t) => { window.__copied = t; } }, configurable: true }); } catch {}
  window.__errors = [];
  window.addEventListener('error', (e) => window.__errors.push(String(e.message)));
  window.addEventListener('unhandledrejection', (e) => window.__errors.push(String(e.reason)));
`;

/** Edge를 열고 조작 함수 묶음을 돌려줍니다. 끝나면 close()를 꼭 부르세요. */
export async function openEdge({ site, port = 9333, width = 390, height = 844, scale = 2 }) {
  const exe = [
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  ].find(existsSync);
  if (!exe) throw new Error("Microsoft Edge 를 찾지 못했습니다.");
  const profile = mkdtempSync(join(tmpdir(), "hwanhangil-edge-"));
  const proc = spawn(exe, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--no-first-run", "about:blank"], {
    stdio: "ignore",
  });

  let ws;
  let seq = 0;
  const pending = new Map();
  const send = (method, params = {}) => {
    const id = ++seq;
    ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
  };

  const close = async () => {
    ws?.close();
    proc.kill();
    await sleep(500);
    try {
      rmSync(profile, { recursive: true, force: true });
    } catch {}
  };

  try {
    for (let i = 0; i < 50 && !ws; i++) {
      try {
        const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
        const page = list.find((t) => t.type === "page");
        if (page) {
          const sock = new WebSocket(page.webSocketDebuggerUrl);
          await new Promise((r, j) => {
            sock.onopen = r;
            sock.onerror = j;
          });
          sock.onmessage = (e) => {
            const m = JSON.parse(e.data);
            if (m.id && pending.has(m.id)) {
              const p = pending.get(m.id);
              pending.delete(m.id);
              if (m.error) p.reject(new Error(m.error.message));
              else p.resolve(m.result);
            }
          };
          ws = sock;
          break;
        }
      } catch {}
      await sleep(200);
    }
    if (!ws) throw new Error("Edge 에 연결하지 못했습니다.");

    await send("Page.enable");
    await send("Runtime.enable");
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: scale, mobile: true });
    await send("Emulation.setTouchEmulationEnabled", { enabled: true });
    await send("Page.addScriptToEvaluateOnNewDocument", { source: PRELUDE });
  } catch (e) {
    await close();
    throw e;
  }

  const run = async (js) => {
    const r = await send("Runtime.evaluate", { expression: `(async () => { ${js} })()`, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? "스크립트 오류");
    return r.result.value;
  };
  const go = async (path, wait = 4500) => {
    await send("Page.navigate", { url: site + path });
    await sleep(wait);
  };
  /** 조건(자바스크립트 식)이 참이 될 때까지 기다림. 걸린 시간(ms)을 돌려주고, 시간이 지나면 오류 */
  const waitFor = async (expr, timeout = 15000, what = expr) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      if (await run(`return !!(${expr});`).catch(() => false)) return Date.now() - t0;
      await sleep(200);
    }
    throw new Error(`시간 초과: ${what}`);
  };
  const shot = async (file) => {
    const { data } = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(file, Buffer.from(data, "base64"));
  };
  /** 글자가 포함된 첫 버튼·링크 누르기 */
  const click = (text) =>
    run(`const b = [...document.querySelectorAll('button, a')].find(x => x.textContent.includes(${JSON.stringify(text)}));
         if (!b) throw new Error('버튼 없음: ' + ${JSON.stringify(text)}); b.click();`);
  const text = () => run(`return document.body.innerText;`);

  return { send, run, go, waitFor, shot, click, text, close };
}
