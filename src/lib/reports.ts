// 시민 제보: Supabase `reports` 표(supabase/001_reports.sql)에 쓰고 읽습니다.
// - 로그인 없이 누구나 추가할 수 있고, 최근 14일 제보만 보입니다(DB 규칙). 수정·삭제는 막혀 있습니다.
// - 개인정보는 받지 않습니다 (위치, 종류, 100자 이내 메모만).

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { distM, type Graph } from "./routing.ts";

export type ReportKind = "light_out" | "very_dark" | "construction" | "unsafe" | "other";

export const REPORT_KINDS: { id: ReportKind; label: string; icon: string }[] = [
  { id: "light_out", label: "가로등·보안등 고장", icon: "💡" },
  { id: "very_dark", label: "매우 어두움", icon: "🌑" },
  { id: "unsafe", label: "불안한 곳", icon: "⚠️" },
  { id: "construction", label: "공사 중·통행 불가", icon: "🚧" },
  { id: "other", label: "기타", icon: "📝" },
];

export interface Report {
  id: string;
  created_at: string;
  kind: ReportKind;
  lat: number;
  lng: number;
  note: string | null;
}

let client: SupabaseClient | null = null;
function supabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("제보 서버가 설정되지 않았어요.");
  client ??= createClient(url, key, { auth: { persistSession: false } });
  return client;
}

/** 서비스 지역 근처의 최근 제보 (DB 규칙상 최근 14일만 옴) */
export async function fetchReports(box: { south: number; west: number; north: number; east: number }): Promise<Report[]> {
  const { data, error } = await supabase()
    .from("reports")
    .select("id, created_at, kind, lat, lng, note")
    .gte("lat", box.south)
    .lte("lat", box.north)
    .gte("lng", box.west)
    .lte("lng", box.east)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error("제보를 불러오지 못했어요.");
  return (data ?? []) as Report[];
}

export async function addReport(input: { kind: ReportKind; lat: number; lng: number; note?: string }) {
  const note = input.note?.trim().slice(0, 100) || null;
  const { error } = await supabase().from("reports").insert({ kind: input.kind, lat: input.lat, lng: input.lng, note });
  if (error) throw new Error("제보를 보내지 못했어요. 잠시 후 다시 시도해 주세요.");
}

// ---------- 도배 방지 (같은 기기에서 1분에 1번) ----------
const LAST_KEY = "hwanhangil.lastReport";
export const REPORT_COOLDOWN_MS = 60_000;
export function cooldownLeft(now = Date.now()): number {
  try {
    const last = Number(window.localStorage.getItem(LAST_KEY) ?? 0);
    return Math.max(0, last + REPORT_COOLDOWN_MS - now);
  } catch {
    return 0;
  }
}
export function markReported(now = Date.now()) {
  try {
    window.localStorage.setItem(LAST_KEY, String(now));
  } catch {}
}

// ---------- 경로 반영 ----------
/** 제보 위치에서 이 거리(m) 안의 교차점에 닿는 길에 반영 */
export const REPORT_RADIUS_M = 50;
/** 안심 경로에서 비용 배수: 어두움·고장·불안 제보는 2배, 공사·통행 불가는 5배(최단 경로에도 적용) */
export const REPORT_PENALTY: Record<ReportKind, { safe: number; all: number }> = {
  light_out: { safe: 2, all: 1 },
  very_dark: { safe: 2, all: 1 },
  unsafe: { safe: 2, all: 1 },
  construction: { safe: 5, all: 5 },
  other: { safe: 1, all: 1 },
};

/** 제보 근처 길(edge) → 비용 배수. safe 는 안심 경로용, all 은 모든 경로용 */
export function reportPenalties(g: Graph, reports: Pick<Report, "kind" | "lat" | "lng">[]) {
  const safe = new Map<number, number>();
  const all = new Map<number, number>();
  const CELL = 0.002;
  for (const r of reports) {
    const p = REPORT_PENALTY[r.kind];
    if (!p || (p.safe === 1 && p.all === 1)) continue;
    const ci = Math.floor(r.lat / CELL);
    const cj = Math.floor(r.lng / CELL);
    for (let di = -1; di <= 1; di++)
      for (let dj = -1; dj <= 1; dj++) {
        for (const node of g.grid.get(`${ci + di},${cj + dj}`) ?? []) {
          if (distM(r.lat, r.lng, g.lat[node], g.lng[node]) > REPORT_RADIUS_M) continue;
          for (let k = g.adjStart[node]; k < g.adjStart[node + 1]; k++) {
            const e = g.adjEdge[k];
            safe.set(e, Math.max(safe.get(e) ?? 1, p.safe));
            if (p.all > 1) all.set(e, Math.max(all.get(e) ?? 1, p.all));
          }
        }
      }
  }
  return { safe, all };
}
