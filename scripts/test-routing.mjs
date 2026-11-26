// 경로 계산 점검: 실제 그래프로 여러 출발·도착 쌍을 계산해 최단 경로와 안심 경로를 비교합니다.
// 실행: node --experimental-strip-types scripts/test-routing.mjs
import { readFileSync } from "node:fs";
import { buildGraph, findRoute, nearestNode, sameRoute, edgeCost } from "../src/lib/routing.ts";

const raw = JSON.parse(readFileSync(new URL("../public/data/graph.json", import.meta.url), "utf8"));
const t0 = performance.now();
const g = buildGraph(raw);
console.log(`그래프 준비 ${(performance.now() - t0).toFixed(0)}ms, 교차점 ${g.nodeCount}`);

let failures = 0;
const check = (cond, msg) => {
  if (!cond) {
    failures++;
    console.log("  ❌ " + msg);
  }
};

// 1) 기본 성질: 가중치 0이면 최단, 같은 점이면 길이 0
{
  const a = nearestNode(g, 35.8468, 127.1294);
  check(a, "전북대 근처 교차점을 찾아야 함");
  const r = findRoute(g, a.node, a.node, 0);
  check(r && r.length === 0, "같은 점 경로 길이는 0");
  check(nearestNode(g, 37.5665, 126.978) === null, "서울 좌표는 범위 밖이라 null");
  check(edgeCost(100, 100, 5) === 100 && edgeCost(100, 0, 3) === 400, "비용 공식");
}

const PAIRS = [
  ["전북대 → 덕진동 원룸촌(신정문 남쪽)", [35.8468, 127.1294], [35.8385, 127.1265]],
  ["전북대 → 금암동", [35.8468, 127.1294], [35.8389, 127.1405]],
  ["전북대 → 인후동 방면", [35.8468, 127.1294], [35.8355, 127.1500]],
  ["전주교대 → 서학동 주택가", [35.8068, 127.1508], [35.8045, 127.1440]],
  ["덕진공원 → 송천동", [35.8475, 127.1205], [35.8580, 127.1260]],
];

for (const [name, A, B] of PAIRS) {
  const a = nearestNode(g, ...A);
  const b = nearestNode(g, ...B);
  if (!a || !b) {
    check(false, `${name}: 교차점 없음`);
    continue;
  }
  const t1 = performance.now();
  const short = findRoute(g, a.node, b.node, 0);
  const safe = findRoute(g, a.node, b.node, 3);
  const ms = performance.now() - t1;
  check(short && safe, `${name}: 경로가 있어야 함`);
  if (!short || !safe) continue;
  check(safe.length >= short.length - 1, `${name}: 안심 경로가 최단보다 짧을 수 없음`);
  check(safe.score >= short.score - 1, `${name}: 안심 경로 점수가 최단보다 낮으면 안 됨`);
  // 경로 연속성: 각 구간의 끝이 다음 구간의 시작과 같아야 함
  let continuous = true;
  for (let i = 1; i < safe.segments.length; i++) {
    const p = safe.segments[i - 1].path.at(-1);
    const q = safe.segments[i].path[0];
    if (Math.abs(p[0] - q[0]) > 1e-6 || Math.abs(p[1] - q[1]) > 1e-6) continuous = false;
  }
  check(continuous, `${name}: 구간이 끊김 없이 이어져야 함`);
  const pct = (x) => `${Math.round(x * 100)}%`;
  console.log(
    `${name} (${ms.toFixed(0)}ms)\n` +
      `   최단: ${short.length}m ${short.minutes}분 · 점수 ${short.score} · CCTV구간 ${pct(short.cctvShare)} · 어두운 ${short.darkLength}m\n` +
      `   안심: ${safe.length}m ${safe.minutes}분 · 점수 ${safe.score} · CCTV구간 ${pct(safe.cctvShare)} · 어두운 ${safe.darkLength}m` +
      (sameRoute(short, safe) ? "  (같은 경로)" : `  (+${safe.length - short.length}m)`)
  );
}

console.log(failures ? `\n실패 ${failures}건` : "\n✅ 모든 점검 통과");
process.exit(failures ? 1 : 0);
