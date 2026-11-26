// 일출·일몰과 밤 경로 점검
// 실행: node --experimental-strip-types --no-warnings scripts/test-night.mjs
import { readFileSync } from "node:fs";
import { sunTimes, isNight } from "../src/lib/sun.ts";
import { buildGraph, findRoute, nearestNode } from "../src/lib/routing.ts";

let failures = 0;
const check = (cond, msg) => {
  if (!cond) {
    failures++;
    console.log("  ❌ " + msg);
  }
};
const JEONJU = [35.82, 127.15];
// 한국 시각(UTC+9) 문자열로 바꾸기
const kst = (d) => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(11, 16);
const minutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
const near = (got, want, tol) => Math.abs(minutes(got) - minutes(want)) <= tol;

// 기준값: 전주의 계절별 대략적인 일출·일몰 시각(근사치). 계산이 크게 틀리지 않았는지만 ±10분으로 확인
const CASES = [
  ["2026-11-26T12:00:00+09:00", "07:19", "17:22"],
  ["2026-06-21T12:00:00+09:00", "05:17", "19:53"],
  ["2026-03-20T12:00:00+09:00", "06:35", "18:44"],
];
for (const [day, rise, set] of CASES) {
  const { sunrise, sunset } = sunTimes(new Date(day), ...JEONJU);
  check(near(kst(sunrise), rise, 10), `${day.slice(0, 10)} 일출 ${kst(sunrise)} (기대 ${rise})`);
  check(near(kst(sunset), set, 10), `${day.slice(0, 10)} 일몰 ${kst(sunset)} (기대 ${set})`);
  console.log(`  ${day.slice(0, 10)} 일출 ${kst(sunrise)} · 일몰 ${kst(sunset)}`);
}
check(isNight(new Date("2026-11-26T22:00:00+09:00"), ...JEONJU), "밤 10시는 밤");
check(isNight(new Date("2026-11-26T05:30:00+09:00"), ...JEONJU), "새벽 5시 반은 밤");
check(!isNight(new Date("2026-11-26T13:00:00+09:00"), ...JEONJU), "오후 1시는 낮");
check(isNight(new Date("2026-11-26T18:00:00+09:00"), ...JEONJU), "11월 오후 6시는 밤");
check(!isNight(new Date("2026-06-21T19:00:00+09:00"), ...JEONJU), "6월 오후 7시는 아직 낮");

// 밤 경로: 조명 없는 산길·공원길을 덜 지나야 함
const g = buildGraph(JSON.parse(readFileSync(new URL("../public/data/jeonju/graph.json", import.meta.url), "utf8")));
const PAIRS = [
  [[35.8475, 127.1205], [35.858, 127.126]], // 덕진공원 → 송천동
  [[35.8468, 127.1294], [35.852, 127.142]], // 전북대 → 건지산 쪽
  [[35.8415, 127.1195], [35.8475, 127.1205]], // 가련산 쪽 → 덕진공원
];
let dayTrail = 0;
let nightTrail = 0;
for (const [A, B] of PAIRS) {
  const a = nearestNode(g, ...A).node;
  const b = nearestNode(g, ...B).node;
  const day = findRoute(g, a, b, 3);
  const night = findRoute(g, a, b, 3, { night: true });
  check(night.trailLength <= day.trailLength, "밤 경로의 어두운 산길이 낮 경로보다 길면 안 됨");
  dayTrail += day.trailLength;
  nightTrail += night.trailLength;
  console.log(`  낮: ${day.length}m 산길 ${day.trailLength}m  /  밤: ${night.length}m 산길 ${night.trailLength}m`);
}
check(nightTrail < dayTrail, `밤에는 산길이 줄어야 함 (낮 ${dayTrail}m → 밤 ${nightTrail}m)`);
// 최단 경로(가중치 0)는 밤이어도 그대로
const s1 = findRoute(g, nearestNode(g, ...PAIRS[0][0]).node, nearestNode(g, ...PAIRS[0][1]).node, 0);
const s2 = findRoute(g, nearestNode(g, ...PAIRS[0][0]).node, nearestNode(g, ...PAIRS[0][1]).node, 0, { night: true });
check(s1.length === s2.length, "최단 경로는 밤 설정과 무관");

console.log(failures ? `\n밤 점검 실패 ${failures}건` : "✅ 밤 점검 통과");
process.exit(failures ? 1 : 0);
