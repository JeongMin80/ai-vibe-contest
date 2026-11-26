"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LAYERS, PLACES, loadFacilities, type FacilityData, type LayerId } from "@/lib/facilities";
import { findRoute, loadGraph, nearestNode, sameRoute, type Graph, type Route } from "@/lib/routing";
import type { Point } from "./MapView";
import RouteResult from "./RouteResult";

// Leaflet은 브라우저에서만 동작하므로 서버 렌더링을 끕니다.
const MapView = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 grid place-items-center text-muted">지도를 불러오는 중…</div>,
});

type Field = "from" | "to";
export type Level = "low" | "mid" | "high";
export const LEVEL_WEIGHT: Record<Level, number> = { low: 1.5, mid: 3, high: 8 };
const LEVEL_LABEL: Record<Level, string> = { low: "조금", mid: "보통", high: "최대" };

export default function MapApp() {
  const [data, setData] = useState<FacilityData | null>(null);
  const [visible, setVisible] = useState<Record<LayerId, boolean>>({ cctv: true, lamp: true, street: true, bell: true });
  const [graph, setGraph] = useState<Graph | null>(null);
  const [mode, setMode] = useState<"browse" | "route">("browse");
  const [from, setFrom] = useState<Point | null>(null);
  const [to, setTo] = useState<Point | null>(null);
  const [picking, setPicking] = useState<Field | null>(null);
  const [level, setLevel] = useState<Level>("mid");
  const [message, setMessage] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const graphPromise = useRef<Promise<Graph> | null>(null);

  useEffect(() => {
    loadFacilities()
      .then(setData)
      .catch((e: Error) => setMessage(e.message));
  }, []);

  const ensureGraph = useCallback(() => {
    if (!graphPromise.current) {
      graphPromise.current = loadGraph();
      graphPromise.current.then(setGraph).catch((e: Error) => {
        graphPromise.current = null;
        setMessage(e.message);
      });
    }
    return graphPromise.current;
  }, []);

  const startRouteMode = () => {
    setMode("route");
    setMessage(null);
    if (!from) setPicking("from");
    void ensureGraph();
  };

  const closeRouteMode = () => {
    setMode("browse");
    setPicking(null);
    setFrom(null);
    setTo(null);
    setMessage(null);
  };

  /** 좌표를 가장 가까운 길에 붙여서 출발/도착으로 지정 */
  const setPoint = useCallback(
    async (field: Field, lat: number, lng: number, label: string) => {
      const g = await ensureGraph();
      const near = nearestNode(g, lat, lng);
      if (!near) {
        setMessage("서비스 지역(전북대·전주교대 주변) 밖이거나 길에서 너무 멀어요. 지도에서 길 가까운 곳을 눌러 주세요.");
        return;
      }
      setMessage(null);
      const p = { lat: g.lat[near.node], lng: g.lng[near.node], label };
      if (field === "from") setFrom(p);
      else setTo(p);
      // 다음에 채울 칸으로 자동 이동
      const other = field === "from" ? to : from;
      setPicking(other ? null : field === "from" ? "to" : "from");
    },
    [ensureGraph, from, to]
  );

  const onMapPick = useCallback(
    (lat: number, lng: number) => {
      if (mode !== "route") return;
      const field: Field | null = picking ?? (!from ? "from" : !to ? "to" : null);
      if (!field) return;
      void setPoint(field, lat, lng, "지도에서 고른 곳");
    },
    [mode, picking, from, to, setPoint]
  );

  const locateMe = (field: Field) => {
    if (!("geolocation" in navigator)) {
      setMessage("이 브라우저에서는 현재 위치를 쓸 수 없어요.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        void setPoint(field, pos.coords.latitude, pos.coords.longitude, "현재 위치");
      },
      (err) => {
        setLocating(false);
        setMessage(
          err.code === err.PERMISSION_DENIED
            ? "위치 권한이 꺼져 있어요. 지도에서 직접 골라 주세요."
            : "현재 위치를 찾지 못했어요. 지도에서 직접 골라 주세요."
        );
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const swap = () => {
    setFrom(to);
    setTo(from);
  };

  // 경로 계산 (출발·도착·안전 정도가 바뀔 때마다)
  const routes = useMemo(() => {
    if (!graph || !from || !to) return null;
    const a = nearestNode(graph, from.lat, from.lng);
    const b = nearestNode(graph, to.lat, to.lng);
    if (!a || !b) return null;
    const short = findRoute(graph, a.node, b.node, 0);
    const safe = findRoute(graph, a.node, b.node, LEVEL_WEIGHT[level]);
    if (!short || !safe) return { short: null, safe: null, same: false, failed: true };
    return { short, safe, same: sameRoute(short, safe), failed: false };
  }, [graph, from, to, level]);

  const counts = useMemo(
    () =>
      ({
        cctv: data?.cctv.length ?? 0,
        lamp: data?.lamp.length ?? 0,
        street: data?.street.length ?? 0,
        bell: data?.bell.length ?? 0,
      }) satisfies Record<LayerId, number>,
    [data]
  );

  const shownSafe: Route | null = routes?.safe ?? null;
  const shownShort: Route | null = routes && !routes.same ? routes.short : null;

  return (
    <main className="relative flex-1 min-h-dvh overflow-hidden">
      <MapView
        data={data}
        visible={visible}
        from={mode === "route" ? from : null}
        to={mode === "route" ? to : null}
        safe={mode === "route" ? shownSafe : null}
        short={mode === "route" ? shownShort : null}
        onPick={onMapPick}
        picking={mode === "route" && picking !== null}
      />

      {/* 상단: 서비스 이름 / 선택 안내 */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-[1000] flex flex-col items-start gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] md:flex-row md:items-center">
        <div className="pointer-events-auto inline-flex items-center gap-2 rounded-2xl border border-line bg-panel/90 px-4 py-2.5 shadow-lg backdrop-blur">
          <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-accent shadow-[0_0_12px_var(--accent)]" />
          <h1 className="text-base font-bold tracking-tight">환한길</h1>
          <span className="text-xs text-muted">밤길 안심 경로</span>
        </div>
        {mode === "route" && picking && (
          <p
            role="status"
            className="pointer-events-auto rounded-xl bg-accent px-3 py-2 text-sm font-bold text-accent-ink shadow-lg"
          >
            지도에서 {picking === "from" ? "출발지" : "도착지"}를 눌러 주세요
          </p>
        )}
      </header>

      {/* 패널: 휴대폰은 아래쪽, 넓은 화면은 왼쪽에 붙임 */}
      <section
        aria-label={mode === "route" ? "안심 경로 찾기" : "안전시설 보기"}
        className="absolute inset-x-0 bottom-0 z-[1000] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:inset-x-auto md:bottom-auto md:left-0 md:top-16 md:w-[400px]"
      >
        <div className="mx-auto max-h-[55dvh] max-w-xl overflow-y-auto rounded-3xl border border-line bg-panel/95 p-4 shadow-2xl backdrop-blur md:max-h-[calc(100dvh-5.5rem)]">
          {mode === "browse" ? (
            <>
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-sm font-bold">지도에 표시할 안전시설</p>
                <Link href="/about" className="text-xs text-muted underline underline-offset-2">
                  데이터 안내
                </Link>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {LAYERS.map((l) => {
                  const on = visible[l.id];
                  const empty = data !== null && counts[l.id] === 0;
                  return (
                    <button
                      key={l.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setVisible((v) => ({ ...v, [l.id]: !v[l.id] }))}
                      className={`flex flex-col items-center gap-1 rounded-2xl border px-1 py-2.5 text-xs transition ${
                        on ? "border-line bg-panel-2" : "border-transparent bg-transparent opacity-50"
                      }`}
                    >
                      <span className="h-3 w-3 rounded-full" style={{ background: l.color }} aria-hidden />
                      <span className="font-medium">{l.short}</span>
                      <span className="text-[11px] text-muted">{empty ? "준비 중" : counts[l.id].toLocaleString()}</span>
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={startRouteMode}
                className="mt-3 w-full rounded-2xl bg-accent py-3.5 text-base font-bold text-accent-ink shadow-[0_0_24px_rgba(255,209,102,0.25)] active:scale-[0.99]"
              >
                안심 경로 찾기
              </button>
            </>
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-bold">안심 경로 찾기</p>
                <button type="button" onClick={closeRouteMode} className="text-xs text-muted underline underline-offset-2">
                  닫기
                </button>
              </div>

              <div className="flex gap-2">
                <div className="flex-1 space-y-2">
                  {(["from", "to"] as const).map((field) => {
                    const p = field === "from" ? from : to;
                    const active = picking === field;
                    return (
                      <div
                        key={field}
                        className={`flex items-center gap-2 rounded-2xl border px-3 py-2 ${
                          active ? "border-accent bg-panel-2" : "border-line bg-panel-2/60"
                        }`}
                      >
                        <span
                          className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold text-bg ${
                            field === "from" ? "bg-accent" : "bg-safe"
                          }`}
                          aria-hidden
                        >
                          {field === "from" ? "출" : "도"}
                        </span>
                        <button
                          type="button"
                          onClick={() => setPicking(field)}
                          className="min-w-0 flex-1 truncate text-left text-sm"
                          aria-label={`${field === "from" ? "출발지" : "도착지"} 지도에서 고르기`}
                        >
                          {p ? p.label : <span className="text-muted">{field === "from" ? "출발지" : "도착지"} · 지도에서 고르기</span>}
                        </button>
                        <button
                          type="button"
                          onClick={() => locateMe(field)}
                          disabled={locating}
                          className="shrink-0 rounded-lg border border-line px-2 py-1 text-[11px] text-muted disabled:opacity-50"
                        >
                          {locating ? "찾는 중" : "현재 위치"}
                        </button>
                      </div>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={swap}
                  aria-label="출발지와 도착지 바꾸기"
                  className="self-center rounded-xl border border-line px-2.5 py-3 text-muted"
                >
                  ⇅
                </button>
              </div>

              <div className="mt-2 flex flex-wrap gap-1.5">
                {PLACES.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => void setPoint(picking ?? (!from ? "from" : "to"), p.lat, p.lng, p.name)}
                    className="rounded-full border border-line px-3 py-1 text-xs text-muted"
                  >
                    {p.name}
                  </button>
                ))}
              </div>

              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="text-xs text-muted">안전 우선 정도</span>
                <div className="flex rounded-xl border border-line p-0.5" role="radiogroup" aria-label="안전 우선 정도">
                  {(Object.keys(LEVEL_LABEL) as Level[]).map((lv) => (
                    <button
                      key={lv}
                      type="button"
                      role="radio"
                      aria-checked={level === lv}
                      onClick={() => setLevel(lv)}
                      className={`rounded-lg px-3 py-1 text-xs ${level === lv ? "bg-accent font-bold text-accent-ink" : "text-muted"}`}
                    >
                      {LEVEL_LABEL[lv]}
                    </button>
                  ))}
                </div>
              </div>

              {!graph && <p className="mt-3 text-xs text-muted">길 데이터를 불러오는 중…</p>}
              {routes?.failed && <p className="mt-3 text-sm text-danger">두 지점을 잇는 길을 찾지 못했어요.</p>}
              {routes && routes.safe && routes.short && (
                <RouteResult safe={routes.safe} short={routes.short} same={routes.same} />
              )}
            </>
          )}

          {message && (
            <p role="alert" className="mt-3 rounded-xl bg-danger/15 px-3 py-2 text-xs text-danger">
              {message}
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
