// 길 안내: 지금 위치가 경로 위 어디쯤인지, 경로에서 벗어났는지, 앞에 어두운 구간이 있는지 계산합니다.
// 짧은 거리(수 km)라서 위도·경도를 평면(m)으로 바꿔 계산해도 오차가 작습니다.

import { DARK_SCORE, FLAG_CAMPUS, type Route } from "./routing.ts";

export interface RouteLine {
  pts: [number, number][];
  /** 각 점까지의 누적 거리(m) */
  cum: number[];
  total: number;
  lat0: number;
  kx: number;
  ky: number;
}

/** 경로에서 이 거리(m)보다 멀어지면 이탈로 봅니다 (GPS 오차를 고려) */
export const OFF_ROUTE_M = 40;
/** 도착지 이 거리(m) 안이면 도착 */
export const ARRIVE_M = 25;

export function buildLine(route: Route): RouteLine {
  const pts: [number, number][] = [];
  for (const s of route.segments)
    for (const p of s.path) {
      const last = pts[pts.length - 1];
      if (!last || last[0] !== p[0] || last[1] !== p[1]) pts.push(p);
    }
  const lat0 = pts[0]?.[0] ?? 0;
  const ky = 110_540; // 위도 1도 ≈ 110.54km
  const kx = 111_320 * Math.cos((lat0 * Math.PI) / 180);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    const dx = (pts[i][1] - pts[i - 1][1]) * kx;
    const dy = (pts[i][0] - pts[i - 1][0]) * ky;
    cum.push(cum[i - 1] + Math.hypot(dx, dy));
  }
  return { pts, cum, total: cum[cum.length - 1] ?? 0, lat0, kx, ky };
}

/** 지금 위치를 경로 위에 투영: along = 출발점부터 경로를 따라온 거리, offset = 경로까지의 거리 */
export function locate(line: RouteLine, lat: number, lng: number): { along: number; offset: number } {
  const { pts, cum, kx, ky } = line;
  if (pts.length === 1) {
    const d = Math.hypot((lng - pts[0][1]) * kx, (lat - pts[0][0]) * ky);
    return { along: 0, offset: d };
  }
  let best = { along: 0, offset: Infinity };
  for (let i = 1; i < pts.length; i++) {
    // 점 i-1 을 원점으로 하는 평면 좌표
    const ax = 0;
    const ay = 0;
    const bx = (pts[i][1] - pts[i - 1][1]) * kx;
    const by = (pts[i][0] - pts[i - 1][0]) * ky;
    const px = (lng - pts[i - 1][1]) * kx;
    const py = (lat - pts[i - 1][0]) * ky;
    const len2 = bx * bx + by * by;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * bx + (py - ay) * by) / len2));
    const qx = bx * t;
    const qy = by * t;
    const offset = Math.hypot(px - qx, py - qy);
    if (offset < best.offset) best = { along: cum[i - 1] + Math.sqrt(len2) * t, offset };
  }
  return best;
}

/** 지금 위치(along)보다 앞에 있는 첫 어두운 구간: 몇 m 앞에서 시작해 몇 m 이어지는지 */
export function darkAhead(route: Route, line: RouteLine, along: number): { startIn: number; length: number } | null {
  // 구간별 시작 거리를 line 기준으로 다시 계산 (구간 길이 반올림 오차를 피하려고)
  let start = 0;
  let run: { start: number; length: number } | null = null;
  for (const s of route.segments) {
    let segLen = 0;
    for (let i = 1; i < s.path.length; i++) {
      segLen += Math.hypot((s.path[i][1] - s.path[i - 1][1]) * line.kx, (s.path[i][0] - s.path[i - 1][0]) * line.ky);
    }
    const end = start + segLen;
    const dark = s.score < DARK_SCORE && !(s.flags & FLAG_CAMPUS);
    if (dark && end > along) {
      if (!run) run = { start: Math.max(start, along), length: 0 };
      run.length += end - Math.max(start, along);
    } else if (run) {
      break;
    }
    start = end;
  }
  // 30m 미만의 짧은 어두운 구간은 알림이 잦아지기만 해서 무시합니다
  if (!run || run.length < 30) return null;
  return { startIn: Math.round(run.start - along), length: Math.round(run.length) };
}

/** 지금 위치(along)가 속한 경로 구간 (안전 점수 표시용) */
export function segmentAt(route: Route, line: RouteLine, along: number) {
  let start = 0;
  for (const s of route.segments) {
    let segLen = 0;
    for (let i = 1; i < s.path.length; i++) {
      segLen += Math.hypot((s.path[i][1] - s.path[i - 1][1]) * line.kx, (s.path[i][0] - s.path[i - 1][0]) * line.ky);
    }
    if (along <= start + segLen) return s;
    start += segLen;
  }
  return route.segments[route.segments.length - 1] ?? null;
}
