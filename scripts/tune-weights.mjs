// 안전가중치 실험: 같은 경로 7쌍을 가중치별로 계산해 거리와 어두운 구간을 비교합니다.
// 실행: node --experimental-strip-types --no-warnings scripts/tune-weights.mjs
import { readFileSync } from "node:fs";
import { buildGraph, findRoute, nearestNode } from "../src/lib/routing.ts";

const g = buildGraph(JSON.parse(readFileSync(new URL("../public/data/graph.json", import.meta.url), "utf8")));

// 전북대·전주교대 주변의 실제 귀갓길 예시
const PAIRS = [
  [[35.8468, 127.1294], [35.8385, 127.1265]],
  [[35.8468, 127.1294], [35.8389, 127.1405]],
  [[35.8468, 127.1294], [35.8355, 127.15]],
  [[35.8068, 127.1508], [35.8045, 127.144]],
  [[35.8475, 127.1205], [35.858, 127.126]],
  [[35.833, 127.128], [35.8445, 127.1395]],
  [[35.841, 127.118], [35.835, 127.136]],
];

console.log("가중치 | 총 거리 | 어두운 구간 | 평균 점수 | CCTV 구간");
for (const w of [0, 1.5, 3, 6, 8, 12]) {
  let L = 0, D = 0, S = 0, C = 0;
  for (const [A, B] of PAIRS) {
    const r = findRoute(g, nearestNode(g, ...A).node, nearestNode(g, ...B).node, w);
    L += r.length;
    D += r.darkLength;
    S += r.score * r.length;
    C += r.cctvShare * r.length;
  }
  console.log(
    `${String(w).padStart(5)} | ${L}m | ${D}m (${Math.round((D / L) * 100)}%) | ${Math.round(S / L)} | ${Math.round((C / L) * 100)}%`
  );
}
