// 실제 사이트 자동 점검: 배포된 사이트를 휴대폰 크기(390×844) Edge로 열어 사람이 쓰는 순서대로 눌러 보고,
// 결과를 표로 docs/live-check.md 에 남깁니다.
// 실행: npm run check:live [사이트 주소]   (기본: https://hwanhangil.vercel.app)
// - 위치는 실제 GPS 대신 정해진 좌표를 씁니다. 공유창 대신 복사된 문장을 확인합니다.
// - 시민 제보는 실제 데이터베이스에 남으므로 보내지 않습니다(제보 창이 열리는지만 확인).
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { openEdge, sleep } from "./lib/edge.mjs";

const SITE = (process.argv[2] ?? "https://hwanhangil.vercel.app").replace(/\/$/, "");
const OUT = fileURLToPath(new URL("../docs/live-check.md", import.meta.url));

const ROUTE = "/?f=35.84663,127.13391,전북대학교&t=35.8400,127.1250,원룸촌&l=mid";
const GUNSAN = "/?f=35.94693,126.68034,국립군산대&t=35.9600,126.6950,나운동&l=mid";
const JEJU = "/?f=33.4547,126.56034,제주대학교&t=33.4880,126.5300,제주시내&l=mid";

const results = [];
async function step(name, fn) {
  const t0 = Date.now();
  try {
    const detail = String((await fn()) ?? "");
    results.push({ name, ok: true, ms: Date.now() - t0, detail });
    console.log(`✅ ${name} (${((Date.now() - t0) / 1000).toFixed(1)}초) ${detail}`);
  } catch (e) {
    const detail = String(e.message).split("\n")[0];
    results.push({ name, ok: false, ms: Date.now() - t0, detail });
    console.log(`❌ ${name}: ${detail}`);
  }
}

const has = (t) => `document.body.innerText.includes(${JSON.stringify(t)})`;
const btn = (t) => `[...document.querySelectorAll('button, a')].some(x => x.textContent.includes(${JSON.stringify(t)}))`;
// 안심 경로 결과의 요약 문장 ("N분 더 걷고, …" 또는 "최단 경로가 이미 …")
const NEAR = `[...document.querySelectorAll('section[aria-label]')].filter(s => ['지구대·파출소', '편의점', '안전비상벨'].includes(s.getAttribute('aria-label')))`;
const SUMMARY = `(() => { const p = document.querySelector('[aria-live=polite] p'); return p && /걷고|시간에|이미/.test(p.textContent) ? p.textContent : ''; })()`;

const edge = await openEdge({ site: SITE });
const { run, go: goRaw, waitFor, click } = edge;
// 화면을 열고, 지도가 그려질 때까지(= 버튼이 실제로 눌리는 상태) 기다림. 걸린 시간(ms)을 돌려줌
const pageErrors = [];
const collectErrors = async () => pageErrors.push(...((await run(`return window.__errors ?? [];`).catch(() => [])) || []));
const go = async (path) => {
  await collectErrors();
  const t0 = Date.now();
  await goRaw(path, 300);
  if (path.startsWith("/about")) return Date.now() - t0;
  await waitFor(`document.querySelector('.leaflet-container')`, 20000, "지도 표시");
  await sleep(400);
  return Date.now() - t0;
};
try {
  await step("첫 화면 열기", async () => {
    const ms = await go("/");
    const title = await run(`return document.title;`);
    if (!title.includes("환한길")) throw new Error("제목이 다름: " + title);
    return `지도까지 그려지는 데 ${(ms / 1000).toFixed(1)}초`;
  });

  await step("도로 데이터 받기 (전주)", async () => {
    const r = await run(`const t = performance.now(); const res = await fetch('/data/jeonju/graph.json', { cache: 'no-store' }); const b = await res.arrayBuffer();
      return { ok: res.ok, kb: Math.round(b.byteLength / 1024), ms: Math.round(performance.now() - t) };`);
    if (!r.ok) throw new Error("받지 못함");
    return `${r.kb}KB, ${r.ms}ms`;
  });

  await step("장소 검색 API", async () => {
    const r = await run(`const res = await fetch('/api/search?q=' + encodeURIComponent('전북대학교') + '&region=jeonju');
      const j = await res.json(); const arr = Object.values(j).find(Array.isArray) ?? [];
      return { ok: res.ok, n: arr.length, cache: res.headers.get('cache-control') };`);
    if (!r.ok || r.n === 0) throw new Error("검색 결과 없음");
    if (!String(r.cache).includes("no-store")) throw new Error("검색 결과가 캐시됨: " + r.cache);
    return `결과 ${r.n}건, 저장·캐시 안 함(no-store)`;
  });

  await step("안심 경로 찾기 (전주)", async () => {
    await go(ROUTE);
    await waitFor(SUMMARY, 25000, "경로 요약 문장");
    return `"${(await run(`return ${SUMMARY};`)).trim()}"`;
  });

  await step("경로 공유 링크", async () => {
    await click("이 경로를 친구·가족에게 공유");
    await waitFor(`window.__copied`, 5000, "복사된 링크");
    const c = await run(`return window.__copied;`);
    if (!c.includes("/?f=") || !c.includes("&t=")) throw new Error("링크 형식이 다름");
    return "출발·도착이 담긴 링크 복사됨";
  });

  await step("길 안내 시작", async () => {
    await click("길 안내 시작");
    await waitFor(has("까지"), 10000, "남은 거리 표시");
    await run(`window.__move(35.8458, 127.1326);`);
    await sleep(800);
    return "남은 거리 " + (await run(`return document.querySelector('[aria-live=polite] .text-2xl')?.textContent ?? '';`)).trim();
  });

  await step("안심 귀가 알림 (출발)", async () => {
    await run(`window.__copied = null;`);
    await click("출발 알리기");
    await waitFor(`window.__copied`, 5000, "알림 문장");
    const c = await run(`return window.__copied;`);
    if (!/도착할 예정/.test(c) || !c.includes("/?f=")) throw new Error("문장이 다름: " + c);
    return `"${c.split("\n")[0]}" + 경로 링크`;
  });

  await step("늦어짐 확인 (괜찮으세요?)", async () => {
    // 시계를 30분 앞당기면 30초 안에 "괜찮으세요?"가 떠야 함
    await run(`window.__off = 30 * 60_000; window.__copied = null;`);
    const ms = await waitFor(has("괜찮으세요"), 40000, "늦어짐 확인");
    await click("지금 위치 보내기");
    await waitFor(`window.__copied`, 5000, "위치 알림");
    const c = await run(`return window.__copied;`);
    if (!c.includes("늦어지고") || !c.includes("/?t=")) throw new Error("문장이 다름: " + c);
    await click("괜찮아요");
    await waitFor(`!${has("괜찮으세요")}`, 3000, "확인 닫힘");
    await run(`window.__off = 0;`);
    return `${Math.round(ms / 1000)}초 만에 표시 → 지금 위치 링크 보내기 → 괜찮아요로 닫힘`;
  });

  await step("경로 이탈 알림", async () => {
    // 경로에서 떨어진 곳으로 두 번 이동 (GPS 튐을 거르려고 2번 연속일 때 알림)
    await run(`window.__move(35.8478, 127.1262);`);
    await sleep(600);
    await run(`window.__move(35.8479, 127.1263);`);
    await waitFor(has("벗어났어요"), 5000, "이탈 안내");
    await click("다시 찾기");
    await waitFor(`!${has("벗어났어요")}`, 15000, "다시 찾은 경로");
    return "벗어남 안내 → 그 자리에서 새 안심 경로";
  });

  await step("도착", async () => {
    await run(`window.__move(35.8400, 127.1250);`);
    await sleep(600);
    await run(`window.__move(35.8400, 127.1250);`);
    await waitFor(has("도착했어요"), 8000, "도착 안내");
    await run(`window.__copied = null;`);
    await click("도착 알리기");
    await waitFor(`window.__copied`, 5000, "도착 알림");
    return `"${await run(`return window.__copied;`)}"`;
  });

  await step("가까운 안전한 곳", async () => {
    await go("/");
    await waitFor(btn("주변"), 20000, "첫 화면");
    await click("주변");
    await waitFor(`${NEAR}.reduce((n, s) => n + s.querySelectorAll('li').length, 0) >= 3`, 15000, "주변 장소 목록");
    return await run(`return ${NEAR}.map(s => s.getAttribute('aria-label') + ' ' + s.querySelectorAll('li').length + '곳').join(', ');`);
  });

  await step("시민 제보 창 (보내지는 않음)", async () => {
    await go("/");
    await waitFor(btn("제보하기"), 20000, "제보 버튼");
    await click("제보하기");
    await waitFor(`document.getElementById('report-note')`, 5000, "제보 작성 창");
    return "제보 종류·메모 입력 창이 열림";
  });

  await step("군산 지역 안심 경로", async () => {
    await go(GUNSAN);
    await waitFor(SUMMARY, 25000, "경로 요약 문장");
    const label = await run(`return [...document.querySelectorAll('.leaflet-tooltip-pane div')].map(d => d.textContent).find(t => t.includes('피함')) ?? '';`);
    if (!label) throw new Error("지도에 피한 어두운 길 표시가 없음");
    return `"${(await run(`return ${SUMMARY};`)).trim()}" · 지도 표시 "${label}"`;
  });

  await step("제주 지역 안심 경로", async () => {
    await go(JEJU);
    await waitFor(SUMMARY, 25000, "경로 요약 문장");
    return `"${(await run(`return ${SUMMARY};`)).trim()}"`;
  });

  await step("지역 바꾸기 버튼", async () => {
    await go("/");
    const radios = `document.querySelectorAll('[role=radiogroup][aria-label="지역"] [role=radio]')`;
    await waitFor(`${radios}.length === 3`, 20000, "지역 버튼 3개");
    await run(`[...${radios}].find(b => b.textContent.includes('군산')).click();`);
    await waitFor(`[...${radios}].find(b => b.getAttribute('aria-checked') === 'true')?.textContent.includes('군산')`, 5000, "군산 선택됨");
    return "전주 → 군산 바뀜";
  });

  await step("데이터 안내 화면", async () => {
    await go("/about");
    await waitFor(`${has("서비스 지역")} && ${has("사용하는 데이터")}`, 15000, "안내 문서");
    return "서비스 지역·데이터 출처 표시";
  });

  await step("화면 오류 없음", async () => {
    await collectErrors();
    if (pageErrors.length) throw new Error(pageErrors.join(" / "));
    return "모든 화면에서 자바스크립트 오류 0건";
  });
} finally {
  await edge.close();
}

const pass = results.filter((r) => r.ok).length;
const kst = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 16).replace("T", " ");
const md = `# 실제 사이트 자동 점검 결과

- 점검 시각: ${kst} (한국 시간)
- 대상: ${SITE}
- 방법: \`npm run check:live\` — 휴대폰 크기(390×844) Edge로 사이트를 열어 사람이 쓰는 순서대로 자동으로 누름 ([scripts/check-live.mjs](../scripts/check-live.mjs))
- 위치는 실제 GPS 대신 정해진 좌표로 바꿔 가며 걷는 상황을 흉내 냄. 시민 제보는 실제 데이터에 남으므로 창이 열리는지만 확인
- **결과: ${results.length}개 중 ${pass}개 통과**

| # | 점검 | 결과 | 걸린 시간 | 확인한 내용 |
|---|---|---|---|---|
${results.map((r, i) => `| ${i + 1} | ${r.name} | ${r.ok ? "✅ 통과" : "❌ 실패"} | ${(r.ms / 1000).toFixed(1)}초 | ${r.detail.replace(/\|/g, "\\|")} |`).join("\n")}
`;
writeFileSync(OUT, md);
console.log(`\n${results.length}개 중 ${pass}개 통과 → docs/live-check.md`);
process.exit(pass === results.length ? 0 : 1);
