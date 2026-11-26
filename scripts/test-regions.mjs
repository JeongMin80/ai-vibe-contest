// 지역별 데이터 점검: 지역마다 도로·시설 파일이 있고, 그 지역 안에서 경로를 찾을 수 있는지
// 실행: node --experimental-strip-types --no-warnings scripts/test-regions.mjs
import { existsSync, readFileSync } from "node:fs";
import { REGIONS, regionOf } from "../src/lib/regions.ts";
import { buildGraph, findRoute, nearestNode } from "../src/lib/routing.ts";
import { parseShare } from "../src/lib/share.ts";

let failures = 0;
const check = (cond, msg) => {
  if (!cond) {
    failures++;
    console.log("  ❌ " + msg);
  }
};

for (const r of REGIONS) {
  const gPath = new URL(`../public/data/${r.id}/graph.json`, import.meta.url);
  const fPath = new URL(`../public/data/${r.id}/facilities.json`, import.meta.url);
  check(existsSync(gPath) && existsSync(fPath), `${r.name}: 데이터 파일 있음`);
  if (!existsSync(gPath) || !existsSync(fPath)) continue;
  const g = buildGraph(JSON.parse(readFileSync(gPath, "utf8")));
  const fac = JSON.parse(readFileSync(fPath, "utf8"));
  check(fac.cctv.length > 0 && fac.lamp.length > 0, `${r.name}: CCTV·보안등이 있음`);
  check(regionOf(...r.center)?.id === r.id, `${r.name}: 중심점이 그 지역으로 판정`);
  // 캠퍼스에서 동쪽으로 약 1km 떨어진 곳까지 경로
  const [lat, lng] = r.center;
  const a = nearestNode(g, lat, lng);
  const b = nearestNode(g, lat + 0.004, lng + 0.009);
  check(a && b, `${r.name}: 캠퍼스 근처 길을 찾음`);
  if (!a || !b) continue;
  const route = findRoute(g, a.node, b.node, 3, { night: true });
  check(route && route.length > 500 && route.length < 3000, `${r.name}: 안심 경로 길이 정상`);
  console.log(
    `  ${r.name}: 길 ${g.raw.edges.length}개 · CCTV ${fac.cctv.length} · 보안등 ${fac.lamp.length} · 비상벨 ${fac.bell.length} · 경로 ${route ? Math.round(route.length) + "m 점수 " + Math.round(route.score) : "없음"}`
  );
  // 공유 링크도 그 지역 좌표를 받아야 함
  check(parseShare(`?t=${lat},${lng},테스트`).to !== undefined, `${r.name}: 공유 링크 좌표 허용`);
}
// 지역 사이(전주와 군산 사이 들판)는 어느 지역도 아님
check(regionOf(35.9, 126.9) === null, "지역 사이 좌표는 서비스 지역 아님");
check(parseShare("?t=35.9,126.9,x").to === undefined, "지역 사이 좌표는 공유 링크에서 무시");

if (failures) {
  console.log(`❌ 지역 점검 실패 ${failures}건`);
  process.exit(1);
}
console.log("✅ 지역 점검 통과");
