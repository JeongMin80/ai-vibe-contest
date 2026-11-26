// 시민 제보 → 경로 반영 점검
// 실행: node --experimental-strip-types --no-warnings scripts/test-reports.mjs
import { readFileSync } from "node:fs";
import { buildGraph, findRoute, nearestNode } from "../src/lib/routing.ts";
import { reportPenalties } from "../src/lib/reports.ts";

let failures = 0;
const check = (cond, msg) => {
  if (!cond) {
    failures++;
    console.log("  ❌ " + msg);
  }
};

const g = buildGraph(JSON.parse(readFileSync(new URL("../public/data/graph.json", import.meta.url), "utf8")));
const A = nearestNode(g, 35.8483, 127.132).node; // 중앙도서관 쪽
const B = nearestNode(g, 35.8428, 127.1278).node; // 원룸촌 쪽
const base = findRoute(g, A, B, 3);
const baseShort = findRoute(g, A, B, 0);

// 안심 경로 한가운데 지점에 "매우 어두움" 제보를 넣으면 그 지점을 피해야 함
const mid = base.segments[Math.floor(base.segments.length / 2)].path[0];
const dark = reportPenalties(g, [{ kind: "very_dark", lat: mid[0], lng: mid[1] }]);
check(dark.safe.size > 0, "제보 근처 길에 벌점이 붙음");
check(dark.all.size === 0, "어두움 제보는 최단 경로에는 반영 안 함");
const avoided = findRoute(g, A, B, 3, { penalties: dark });
const sharedEdges = avoided.segments.filter((s) => dark.safe.has(s.edge)).length;
const baseEdges = base.segments.filter((s) => dark.safe.has(s.edge)).length;
console.log(`  어두움 제보: 안심 경로 ${base.length}m → ${avoided.length}m, 제보 근처 길 ${baseEdges}개 → ${sharedEdges}개`);
check(sharedEdges <= baseEdges, "제보 근처 길을 더 많이 지나면 안 됨");
check(findRoute(g, A, B, 0, { penalties: dark }).length === baseShort.length, "최단 경로는 어두움 제보와 무관");

// 공사 제보는 최단 경로에도 반영
const work = reportPenalties(g, [{ kind: "construction", lat: mid[0], lng: mid[1] }]);
check(work.all.size > 0, "공사 제보는 모든 경로에 반영");

// 서비스 지역 밖·기타 제보는 영향 없음
check(reportPenalties(g, [{ kind: "very_dark", lat: 37.56, lng: 126.97 }]).safe.size === 0, "지역 밖 제보는 무시");
check(reportPenalties(g, [{ kind: "other", lat: mid[0], lng: mid[1] }]).safe.size === 0, "기타 제보는 경로에 반영 안 함");

console.log(failures ? `\n제보 점검 실패 ${failures}건` : "✅ 제보 점검 통과");
process.exit(failures ? 1 : 0);
