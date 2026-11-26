// 안전 점수가 매겨진 도로 그래프(public/data/graph.json)로 브라우저에서 경로를 계산합니다.
// 알고리즘: 이진 힙을 쓴 다익스트라.
// 비용 = 길이 × (1 + 안전가중치 × (1 − 안전점수/100))
//   안전가중치 0  → 최단 경로
//   안전가중치 커질수록 → 점수 낮은(어두운) 길을 더 피함

export interface RawGraph {
  area: string;
  builtAt: string;
  hasLight: boolean;
  hwTypes: string[];
  nodes: number[]; // [lat, lng, ...]
  edges: [number, number, number, number, number, number, number, number[]][];
}

export const FLAG_CAMPUS = 1;
export const FLAG_BELL = 2;
/** 30m 안에 보안등(실제 데이터)이 있음 */
export const FLAG_LAMP = 4;
/** 큰길·보도라서 가로등이 있다고 추정 */
export const FLAG_STREETLIGHT = 8;

export interface Graph {
  raw: RawGraph;
  nodeCount: number;
  lat: Float64Array;
  lng: Float64Array;
  /** CSR 인접 리스트: node i 의 이웃은 adjStart[i]..adjStart[i+1] */
  adjStart: Int32Array;
  adjNode: Int32Array;
  adjEdge: Int32Array;
  /** 가까운 교차점 찾기용 격자 */
  grid: Map<string, number[]>;
}

const CELL = 0.002; // 약 200m

export async function loadGraph(): Promise<Graph> {
  const res = await fetch("/data/graph.json");
  if (!res.ok) throw new Error(`도로 데이터를 불러오지 못했습니다 (${res.status})`);
  const raw: RawGraph = await res.json();
  return buildGraph(raw);
}

export function buildGraph(raw: RawGraph): Graph {
  const n = raw.nodes.length / 2;
  const lat = new Float64Array(n);
  const lng = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    lat[i] = raw.nodes[2 * i];
    lng[i] = raw.nodes[2 * i + 1];
  }
  const deg = new Int32Array(n + 1);
  for (const e of raw.edges) {
    deg[e[0]]++;
    deg[e[1]]++;
  }
  const adjStart = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) adjStart[i + 1] = adjStart[i] + deg[i];
  const fill = adjStart.slice(0, n);
  const adjNode = new Int32Array(adjStart[n]);
  const adjEdge = new Int32Array(adjStart[n]);
  raw.edges.forEach((e, ei) => {
    const [u, v] = e;
    adjNode[fill[u]] = v;
    adjEdge[fill[u]++] = ei;
    adjNode[fill[v]] = u;
    adjEdge[fill[v]++] = ei;
  });
  const grid = new Map<string, number[]>();
  for (let i = 0; i < n; i++) {
    const k = `${Math.floor(lat[i] / CELL)},${Math.floor(lng[i] / CELL)}`;
    let list = grid.get(k);
    if (!list) grid.set(k, (list = []));
    list.push(i);
  }
  return { raw, nodeCount: n, lat, lng, adjStart, adjNode, adjEdge, grid };
}

const R = 6371000;
const toRad = (d: number) => (d * Math.PI) / 180;
export function distM(aLat: number, aLng: number, bLat: number, bLng: number) {
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** 가장 가까운 교차점 (maxM 안에 없으면 null) */
export function nearestNode(g: Graph, la: number, ln: number, maxM = 400): { node: number; dist: number } | null {
  const ci = Math.floor(la / CELL);
  const cj = Math.floor(ln / CELL);
  let best = -1;
  let bestD = Infinity;
  for (let di = -1; di <= 1; di++)
    for (let dj = -1; dj <= 1; dj++) {
      const list = g.grid.get(`${ci + di},${cj + dj}`);
      if (!list) continue;
      for (const i of list) {
        const d = distM(la, ln, g.lat[i], g.lng[i]);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
    }
  return best >= 0 && bestD <= maxM ? { node: best, dist: bestD } : null;
}

// ---------- 이진 힙 ----------
class MinHeap {
  private keys: number[] = [];
  private vals: number[] = [];
  get size() {
    return this.keys.length;
  }
  push(key: number, val: number) {
    const k = this.keys;
    const v = this.vals;
    let i = k.length;
    k.push(key);
    v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p];
      v[i] = v[p];
      i = p;
    }
    k[i] = key;
    v[i] = val;
  }
  pop(): [number, number] {
    const k = this.keys;
    const v = this.vals;
    const topK = k[0];
    const topV = v[0];
    const lastK = k.pop()!;
    const lastV = v.pop()!;
    if (k.length) {
      let i = 0;
      const n = k.length;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= n) break;
        const r = l + 1;
        const c = r < n && k[r] < k[l] ? r : l;
        if (k[c] >= lastK) break;
        k[i] = k[c];
        v[i] = v[c];
        i = c;
      }
      k[i] = lastK;
      v[i] = lastV;
    }
    return [topK, topV];
  }
}

export function edgeCost(len: number, score: number, safetyWeight: number) {
  return len * (1 + safetyWeight * (1 - score / 100));
}

export interface RouteSegment {
  edge: number;
  /** 이 구간의 좌표들 (진행 방향 순서) */
  path: [number, number][];
  len: number;
  score: number;
  cctv: number;
  flags: number;
}

export interface Route {
  nodes: number[];
  segments: RouteSegment[];
  length: number;
  /** 도보 분 (분당 75m, 시속 4.5km) */
  minutes: number;
  /** 길이 가중 평균 안전 점수 */
  score: number;
  /** CCTV 50m 안을 지나는 길이 비율 (0~1) */
  cctvShare: number;
  /** 보안등이나 큰길 가로등이 있는 길이 비율 (0~1) */
  litShare: number;
  /** 점수 35 미만 어두운 구간의 총 길이 */
  darkLength: number;
  /** 연속된 어두운 구간 목록 (길이 순) */
  darkStretches: { from: [number, number]; length: number }[];
  /** 지나는 길 근처 CCTV 수(구간별 합, 중복 가능) */
  cctvNear: number;
  /** 경로 100m 안 비상벨이 있는 구간 수 */
  bellSegments: number;
}

export const DARK_SCORE = 35;
const WALK_M_PER_MIN = 75;

export function findRoute(g: Graph, from: number, to: number, safetyWeight: number): Route | null {
  const n = g.nodeCount;
  const dist = new Float64Array(n).fill(Infinity);
  const prevEdge = new Int32Array(n).fill(-1);
  const prevNode = new Int32Array(n).fill(-1);
  const heap = new MinHeap();
  dist[from] = 0;
  heap.push(0, from);
  const edges = g.raw.edges;

  while (heap.size) {
    const [d, u] = heap.pop();
    if (d > dist[u]) continue;
    if (u === to) break;
    for (let k = g.adjStart[u]; k < g.adjStart[u + 1]; k++) {
      const v = g.adjNode[k];
      const ei = g.adjEdge[k];
      const e = edges[ei];
      const nd = d + edgeCost(e[2], e[3], safetyWeight);
      if (nd < dist[v]) {
        dist[v] = nd;
        prevEdge[v] = ei;
        prevNode[v] = u;
        heap.push(nd, v);
      }
    }
  }
  if (from !== to && prevEdge[to] < 0) return null;

  // 경로 되짚기
  const nodes: number[] = [to];
  const edgeSeq: number[] = [];
  for (let cur = to; cur !== from; cur = prevNode[cur]) {
    edgeSeq.push(prevEdge[cur]);
    nodes.push(prevNode[cur]);
  }
  nodes.reverse();
  edgeSeq.reverse();

  const segments: RouteSegment[] = edgeSeq.map((ei, i) => {
    const [u, v, len, score, cctv, flags, , geom] = edges[ei];
    const mid: [number, number][] = [];
    for (let j = 0; j < geom.length; j += 2) mid.push([geom[j], geom[j + 1]]);
    const start = nodes[i];
    const forward = start === u;
    const a: [number, number] = [g.lat[u], g.lng[u]];
    const b: [number, number] = [g.lat[v], g.lng[v]];
    const path = forward ? [a, ...mid, b] : [b, ...mid.reverse(), a];
    return { edge: ei, path, len, score, cctv, flags };
  });

  return summarize(nodes, segments);
}

function summarize(nodes: number[], segments: RouteSegment[]): Route {
  let length = 0;
  let scoreSum = 0;
  let cctvLen = 0;
  let litLen = 0;
  let darkLength = 0;
  let cctvNear = 0;
  let bellSegments = 0;
  const darkStretches: Route["darkStretches"] = [];
  let run: { from: [number, number]; length: number } | null = null;

  for (const s of segments) {
    length += s.len;
    scoreSum += s.score * s.len;
    if (s.cctv > 0) cctvLen += s.len;
    if (s.flags & (FLAG_LAMP | FLAG_STREETLIGHT)) litLen += s.len;
    cctvNear += s.cctv;
    if (s.flags & FLAG_BELL) bellSegments++;
    const dark = s.score < DARK_SCORE && !(s.flags & FLAG_CAMPUS);
    if (dark) {
      darkLength += s.len;
      if (!run) run = { from: s.path[0], length: 0 };
      run.length += s.len;
    } else if (run) {
      darkStretches.push(run);
      run = null;
    }
  }
  if (run) darkStretches.push(run);
  darkStretches.sort((a, b) => b.length - a.length);

  return {
    nodes,
    segments,
    length,
    minutes: Math.max(1, Math.round(length / WALK_M_PER_MIN)),
    score: length ? Math.round(scoreSum / length) : 0,
    cctvShare: length ? cctvLen / length : 0,
    litShare: length ? litLen / length : 0,
    darkLength,
    darkStretches,
    cctvNear,
    bellSegments,
  };
}

/** 두 경로가 사실상 같은지 (겹치는 구간 비율 95% 이상) */
export function sameRoute(a: Route, b: Route) {
  const setA = new Set(a.segments.map((s) => s.edge));
  let shared = 0;
  for (const s of b.segments) if (setA.has(s.edge)) shared += s.len;
  return shared / Math.max(a.length, b.length) > 0.95;
}

export function scoreColor(score: number, flags = 0) {
  if (flags & FLAG_CAMPUS) return "#8b9cc9";
  if (score >= 60) return "#34d399";
  if (score >= DARK_SCORE) return "#fbbf24";
  return "#f87171";
}

export function scoreLabel(score: number) {
  if (score >= 60) return "밝고 안전한 편";
  if (score >= DARK_SCORE) return "보통";
  return "어두운 편";
}
