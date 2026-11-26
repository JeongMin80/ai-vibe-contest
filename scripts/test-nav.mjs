// 길 안내 계산 점검
// 실행: node --experimental-strip-types --no-warnings scripts/test-nav.mjs
import { readFileSync } from "node:fs";
import { buildLine, locate, darkAhead } from "../src/lib/navigation.ts";
import { buildGraph, findRoute, nearestNode } from "../src/lib/routing.ts";

let failures = 0;
const check = (cond, msg) => {
  if (!cond) {
    failures++;
    console.log("  ❌ " + msg);
  }
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// 1) 인공 경로: 북쪽으로 약 111m(0.001도) 가는 직선 두 구간
const fake = {
  segments: [
    { path: [[35.84, 127.13], [35.8405, 127.13]], score: 80, flags: 0, len: 55 },
    { path: [[35.8405, 127.13], [35.841, 127.13]], score: 10, flags: 0, len: 55 },
  ],
};
const line = buildLine(fake);
check(line.pts.length === 3, "겹치는 점은 하나로 합침");
check(near(line.total, 110.5, 1), `총 길이 약 110m (${line.total.toFixed(1)})`);

const onStart = locate(line, 35.84, 127.13);
check(near(onStart.along, 0, 0.5) && near(onStart.offset, 0, 0.5), "출발점은 along 0, offset 0");

const mid = locate(line, 35.8405, 127.1303); // 동쪽으로 약 27m
check(near(mid.along, 55.3, 1), `중간 along ≈ 55m (${mid.along.toFixed(1)})`);
check(near(mid.offset, 27, 2), `중간에서 옆으로 27m (${mid.offset.toFixed(1)})`);

const past = locate(line, 35.8415, 127.13); // 끝점보다 55m 더 북쪽
check(near(past.along, line.total, 0.5), "끝을 지나면 along = 전체 길이");

const dark = darkAhead(fake, line, 0);
check(dark && near(dark.startIn, 55, 2) && near(dark.length, 55, 2), "앞의 어두운 구간: 55m 앞, 55m 길이");
const inside = darkAhead(fake, line, 70);
check(inside && near(inside.startIn, 0, 1) && near(inside.length, 40, 2), "어두운 구간 안에서는 0m 앞, 남은 길이");
check(darkAhead(fake, line, 90) === null, "남은 어두운 길이 30m 미만이면 알리지 않음");
check(darkAhead(fake, line, 110) === null, "끝에 다다르면 없음");

// 2) 실제 경로: 경로 위 점들은 offset이 작고 along이 늘어나야 함
const g = buildGraph(JSON.parse(readFileSync(new URL("../public/data/jeonju/graph.json", import.meta.url), "utf8")));
const r = findRoute(g, nearestNode(g, 35.8483, 127.132).node, nearestNode(g, 35.8428, 127.1278).node, 3);
const realLine = buildLine(r);
check(near(realLine.total, r.length, r.length * 0.02 + 5), `실제 경로 길이 일치 (${realLine.total.toFixed(0)} vs ${r.length})`);
let prev = -1;
let monotonic = true;
let maxOff = 0;
for (let i = 0; i < realLine.pts.length; i += 3) {
  const [la, ln] = realLine.pts[i];
  const p = locate(realLine, la, ln);
  if (p.along < prev - 1) monotonic = false;
  prev = p.along;
  maxOff = Math.max(maxOff, p.offset);
}
check(monotonic, "경로를 따라가면 along이 줄지 않음");
check(maxOff < 0.5, `경로 위 점의 offset ≈ 0 (최대 ${maxOff.toFixed(2)}m)`);

console.log(failures ? `\n길 안내 점검 실패 ${failures}건` : "✅ 길 안내 점검 통과");
process.exit(failures ? 1 : 0);
