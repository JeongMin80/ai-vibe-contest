"use client";

import { useEffect, useMemo, useState } from "react";
import type { NearbyPlace } from "@/app/api/nearby/route";
import type { FacilityData } from "@/lib/facilities";
import { distM } from "@/lib/routing";

interface Props {
  /** 기준 위치 (현재 위치). 없으면 위치를 찾는 중 */
  origin: { lat: number; lng: number } | null;
  locating: boolean;
  error: string | null;
  data: FacilityData | null;
  onRoute: (lat: number, lng: number, name: string) => void;
  onClose: () => void;
}

interface Item {
  kind: "bell" | "store" | "police";
  name: string;
  sub: string;
  lat: number;
  lng: number;
  distance: number;
  phone?: string;
}

const KIND = {
  bell: { icon: "🔔", label: "안전비상벨", note: "누르면 경찰·관제센터와 연결돼요" },
  store: { icon: "🏪", label: "편의점", note: "밤늦게도 사람이 있는 곳" },
  police: { icon: "👮", label: "지구대·파출소", note: "24시간 경찰이 있는 곳" },
} as const;

const meters = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${Math.round(m)}m`);
// 직선거리라 실제 걷는 거리는 조금 더 깁니다 (약 1.3배로 잡음)
const walkMin = (m: number) => Math.max(1, Math.round((m * 1.3) / 75));

/** 지금 위치에서 가까운 안전한 곳: 비상벨(공공데이터) + 편의점·지구대(카카오 실시간) */
export default function SafeNearby({ origin, locating, error, data, onRoute, onClose }: Props) {
  const [remote, setRemote] = useState<{ stores: NearbyPlace[]; police: NearbyPlace[] } | null>(null);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [tryKey, setTryKey] = useState(0);

  useEffect(() => {
    if (!origin) return;
    const ctrl = new AbortController();
    fetch(`/api/nearby?lat=${origin.lat}&lng=${origin.lng}`, { signal: ctrl.signal })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "주변 장소를 불러오지 못했어요.");
        setRemote(json);
        setRemoteError(null);
      })
      .catch((e: Error) => {
        if (e.name === "AbortError") return;
        // fetch 자체가 실패(TypeError)하면 인터넷 문제
        setRemoteError(e instanceof TypeError ? "인터넷 연결이 불안정해 찾지 못했어요." : e.message);
      });
    return () => ctrl.abort();
  }, [origin, tryKey]);

  const bells = useMemo<Item[]>(() => {
    if (!origin || !data) return [];
    return data.bell
      .map(([lat, lng, place]) => ({
        kind: "bell" as const,
        name: place || "안전비상벨",
        sub: "공공데이터",
        lat,
        lng,
        distance: distM(origin.lat, origin.lng, lat, lng),
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 2);
  }, [origin, data]);

  const groups: { kind: Item["kind"]; items: Item[] }[] = [
    {
      kind: "police",
      items: (remote?.police ?? []).map((p) => ({ kind: "police", name: p.name, sub: p.address, lat: p.lat, lng: p.lng, distance: p.distance, phone: p.phone })),
    },
    {
      kind: "store",
      items: (remote?.stores ?? []).map((p) => ({ kind: "store", name: p.name, sub: p.address, lat: p.lat, lng: p.lng, distance: p.distance })),
    },
    { kind: "bell", items: bells },
  ];

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-bold">가까운 안전한 곳</p>
        <button type="button" onClick={onClose} className="-my-1 -mr-2 px-2 py-1.5 text-xs text-muted underline underline-offset-2">
          닫기
        </button>
      </div>

      <a href="tel:112" className="mb-3 flex items-center justify-center gap-2 rounded-2xl bg-sos py-3 text-base font-bold text-white">
        📞 위급하면 112에 바로 전화
      </a>

      {!origin ? (
        <p className="rounded-xl bg-panel-2 px-3 py-2.5 text-sm text-muted">{error ?? (locating ? "현재 위치를 찾는 중…" : "현재 위치가 필요해요.")}</p>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <section key={g.kind} aria-label={KIND[g.kind].label}>
              <p className="mb-1 text-[11px] text-muted">
                {KIND[g.kind].icon} {KIND[g.kind].label} · {KIND[g.kind].note}
              </p>
              {g.items.length === 0 ? (
                <div className="rounded-xl border border-line px-3 py-2 text-xs text-muted">
                  <p>{g.kind === "bell" ? "가까운 곳에 비상벨이 없어요." : remoteError ? remoteError : remote ? "근처에서 찾지 못했어요." : "찾는 중…"}</p>
                  {g.kind === "store" && remoteError && (
                    <button
                      type="button"
                      onClick={() => {
                        setRemoteError(null);
                        setTryKey((k) => k + 1);
                      }}
                      className="mt-1 py-1 text-accent underline underline-offset-2"
                    >
                      다시 찾기
                    </button>
                  )}
                </div>
              ) : (
                <ul className="space-y-1">
                  {g.items.map((it) => (
                    <li key={`${it.kind}-${it.name}-${it.lat}`} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{it.name}</p>
                        <p className="truncate text-[11px] text-muted">
                          {meters(it.distance)} · 걸어서 약 {walkMin(it.distance)}분
                        </p>
                      </div>
                      {it.phone && (
                        <a href={`tel:${it.phone}`} className="shrink-0 rounded-lg border border-line px-2 py-1.5 text-[11px]" aria-label={`${it.name} 전화`}>
                          전화
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => onRoute(it.lat, it.lng, `${KIND[it.kind].icon} ${it.name}`)}
                        className="shrink-0 rounded-lg bg-accent px-2.5 py-1.5 text-[11px] font-bold text-accent-ink"
                      >
                        안심 경로
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
          <p className="text-right text-[10px] text-muted">편의점·지구대: 카카오 · 비상벨: 행정안전부 공공데이터</p>
        </div>
      )}
    </div>
  );
}
