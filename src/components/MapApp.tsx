"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { LAYERS, loadFacilities, type FacilityData, type LayerId } from "@/lib/facilities";
import { FLAG_STREETLIGHT, distM, findRoute, loadGraph, nearestNode, sameRoute, type Graph, type Route } from "@/lib/routing";
import { ARRIVE_M, OFF_ROUTE_M, buildLine, darkAhead, locate, segmentAt, type RouteLine } from "@/lib/navigation";
import NavPanel, { type NavState } from "./NavPanel";
import type { Point } from "./MapView";
import {
  findNear,
  getPlacesServerSnapshot,
  getPlacesSnapshot,
  removePlace,
  subscribePlaces,
  upsertPlace,
  writePlaces,
} from "@/lib/savedPlaces";
import MyPlaces from "./MyPlaces";
import PlaceField from "./PlaceField";
import RouteResult from "./RouteResult";
import Onboarding from "./Onboarding";
import SafeNearby from "./SafeNearby";

// Leaflet은 브라우저에서만 동작하므로 서버 렌더링을 끕니다.
const MapView = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 grid place-items-center text-muted">지도를 불러오는 중…</div>,
});

type Field = "from" | "to";

// 처음 안내를 봤는지 (이 기기에 저장). 저장소를 못 쓰면 다시 보지 않도록 메모리에도 기억합니다.
const ONBOARD_KEY = "hwanhangil.onboarded.v1";
let onboardDismissed = false;
const onboardListeners = new Set<() => void>();
function subscribeOnboard(cb: () => void) {
  onboardListeners.add(cb);
  return () => {
    onboardListeners.delete(cb);
  };
}
function getOnboarded() {
  if (onboardDismissed) return true;
  try {
    return window.localStorage.getItem(ONBOARD_KEY) === "1";
  } catch {
    return true;
  }
}
// 서버 렌더링 때는 숨겨 두고, 브라우저에서 처음 온 사람에게만 보여줍니다
const getOnboardedServer = () => true;
function finishOnboarding() {
  onboardDismissed = true;
  try {
    window.localStorage.setItem(ONBOARD_KEY, "1");
  } catch {}
  onboardListeners.forEach((l) => l());
}
export type Level = "low" | "mid" | "high";
// 실험 근거: scripts/tune-weights.mjs (개발기록.md 참고)
export const LEVEL_WEIGHT: Record<Level, number> = { low: 1.5, mid: 3, high: 12 };
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
  /** 길 안내 중이면 상태, 아니면 null */
  const [nav, setNav] = useState<NavState | null>(null);
  const graphPromise = useRef<Promise<Graph> | null>(null);
  // 비동기 콜백(현재 위치 등)에서도 최신 출발·도착을 보도록
  const fromRef = useRef<Point | null>(null);
  const toRef = useRef<Point | null>(null);
  useEffect(() => {
    fromRef.current = from;
    toRef.current = to;
  }, [from, to]);

  // 내 장소: 이 기기의 저장소에서 읽음 (서버 렌더링 때는 빈 목록)
  const places = useSyncExternalStore(subscribePlaces, getPlacesSnapshot, getPlacesServerSnapshot);
  const home = places.find((p) => p.home) ?? null;
  const onboarded = useSyncExternalStore(subscribeOnboard, getOnboarded, getOnboardedServer);
  /** "어디로 가세요?"로 들어오면 도착지 검색칸에 바로 커서 */
  const [focusTo, setFocusTo] = useState(false);

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

  // 도로 데이터는 지도가 뜬 뒤 미리 받아 둡니다 (큰길 조명 표시 + 경로 찾기를 바로 쓰도록)
  useEffect(() => {
    const t = setTimeout(() => void ensureGraph(), 800);
    return () => clearTimeout(t);
  }, [ensureGraph]);

  const startRouteMode = () => {
    setMode("route");
    setMessage(null);
    if (!from) setPicking("from");
    void ensureGraph();
  };

  /** 🔍 어디로 가세요?: 도착지 검색부터, 출발지는 현재 위치로 자동 */
  const startWhereTo = () => {
    setMode("route");
    setMessage(null);
    setPicking("to");
    setFocusTo(true);
    void ensureGraph();
    if (!fromRef.current) locateMe("from");
  };

  const closeRouteMode = () => {
    setFocusTo(false);
    setNav(null);
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
      if (field === "from") {
        setFrom(p);
        fromRef.current = p;
      } else {
        setTo(p);
        toRef.current = p;
      }
      // 다음에 채울 칸으로 자동 이동
      const other = field === "from" ? toRef.current : fromRef.current;
      setPicking(other ? null : field === "from" ? "to" : "from");
    },
    [ensureGraph]
  );

  /** 🏠 집으로 안심 귀가: 도착지 = 집, 출발지 = 현재 위치 */
  const goHome = () => {
    if (!home) return;
    setMode("route");
    setMessage(null);
    const h = { lat: home.lat, lng: home.lng, label: `🏠 ${home.name}` };
    setTo(h);
    toRef.current = h;
    setFrom(null);
    fromRef.current = null;
    setPicking("from");
    void ensureGraph();
    locateMe("from");
  };

  const savePlace = (name: string, isHome: boolean) => {
    const t = to ?? from;
    if (!t) return;
    const ok = writePlaces(upsertPlace(places, { name, home: isHome, lat: t.lat, lng: t.lng }));
    if (!ok) setMessage("이 브라우저에서는 저장할 수 없어서, 창을 닫으면 사라져요.");
  };

  const onMapPick = useCallback(
    (lat: number, lng: number) => {
      // 길 안내 중에는 지도를 눌러도 출발·도착이 바뀌지 않게
      if (mode !== "route" || nav) return;
      const field: Field | null = picking ?? (!from ? "from" : !to ? "to" : null);
      if (!field) return;
      void setPoint(field, lat, lng, "지도에서 고른 곳");
    },
    [mode, nav, picking, from, to, setPoint]
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

  // 큰길 조명(추정)은 도로 데이터에서 계산한 구간 수
  const streetLitCount = useMemo(
    () => (graph ? graph.raw.edges.reduce((n, e) => n + (e[5] & FLAG_STREETLIGHT ? 1 : 0), 0) : 0),
    [graph]
  );

  const counts = useMemo(
    () =>
      ({
        cctv: data?.cctv.length ?? 0,
        lamp: data?.lamp.length ?? 0,
        street: streetLitCount,
        bell: data?.bell.length ?? 0,
      }) satisfies Record<LayerId, number>,
    [data, streetLitCount]
  );

  const shownSafe: Route | null = routes?.safe ?? null;
  const shownShort: Route | null = routes && !routes.same ? routes.short : null;

  // ---------- 길 안내 ----------
  const navActive = nav !== null;
  const line = useMemo(() => (routes?.safe ? buildLine(routes.safe) : null), [routes]);
  const lineRef = useRef<RouteLine | null>(null);
  useEffect(() => {
    lineRef.current = line;
  }, [line]);

  // 안내 중에는 위치를 계속 받아서 경로 위 위치·이탈·도착을 계산
  useEffect(() => {
    if (!navActive || !("geolocation" in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const me = { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy ?? 30 };
        const l = lineRef.current;
        const dest = toRef.current;
        setNav((prev) => {
          if (!prev) return prev;
          const p = l ? locate(l, me.lat, me.lng) : { along: prev.along, offset: 0 };
          // GPS 오차만큼은 봐줌 (최대 30m)
          const off = p.offset > OFF_ROUTE_M + Math.min(me.acc, 30);
          const arrived =
            prev.arrived ||
            (!!dest && distM(me.lat, me.lng, dest.lat, dest.lng) < ARRIVE_M) ||
            (!!l && l.total - p.along < ARRIVE_M && p.offset < OFF_ROUTE_M);
          return { ...prev, me, along: p.along, offset: p.offset, offCount: off ? prev.offCount + 1 : 0, arrived, error: null };
        });
      },
      (err) =>
        setNav((prev) =>
          prev && {
            ...prev,
            error:
              err.code === err.PERMISSION_DENIED
                ? "위치 권한이 꺼져 있어요. 브라우저 설정에서 이 사이트의 위치를 허용해 주세요."
                : "현재 위치를 찾지 못했어요. 하늘이 보이는 곳에서 잠시 기다려 주세요.",
          }
        ),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 }
    );
    // 걷는 동안 화면이 꺼지지 않게 (지원하는 브라우저만)
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    if ("wakeLock" in navigator) {
      navigator.wakeLock
        .request("screen")
        .then((l) => {
          if (cancelled) void l.release();
          else lock = l;
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
      navigator.geolocation.clearWatch(id);
      void lock?.release().catch(() => {});
    };
  }, [navActive]);

  // ---------- 가까운 안전한 곳 ----------
  const [safe, setSafe] = useState<{ origin: { lat: number; lng: number } | null; locating: boolean; error: string | null } | null>(
    null
  );

  const openSafe = () => {
    // 길 안내 중이면 이미 아는 위치를 바로 씀
    if (nav?.me) {
      setSafe({ origin: { lat: nav.me.lat, lng: nav.me.lng }, locating: false, error: null });
      return;
    }
    if (!("geolocation" in navigator)) {
      setSafe({ origin: null, locating: false, error: "이 브라우저에서는 현재 위치를 쓸 수 없어요. 위급하면 112에 전화하세요." });
      return;
    }
    setSafe({ origin: null, locating: true, error: null });
    navigator.geolocation.getCurrentPosition(
      (pos) => setSafe((s) => s && { origin: { lat: pos.coords.latitude, lng: pos.coords.longitude }, locating: false, error: null }),
      (err) =>
        setSafe(
          (s) =>
            s && {
              origin: null,
              locating: false,
              error:
                err.code === err.PERMISSION_DENIED
                  ? "위치 권한이 꺼져 있어 주변을 찾을 수 없어요. 위급하면 112에 전화하세요."
                  : "현재 위치를 찾지 못했어요. 위급하면 112에 전화하세요.",
            }
        ),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  /** 고른 안전한 곳까지 안심 경로: 출발 = 지금 위치 */
  const routeToSafe = async (lat: number, lng: number, name: string) => {
    const origin = safe?.origin;
    setSafe(null);
    setNav(null);
    setMode("route");
    setMessage(null);
    if (origin) await setPoint("from", origin.lat, origin.lng, "현재 위치");
    await setPoint("to", lat, lng, name);
  };

  const startNav = () => {
    if (!("geolocation" in navigator)) {
      setMessage("이 브라우저에서는 현재 위치를 쓸 수 없어서 길 안내를 할 수 없어요.");
      return;
    }
    setMessage(null);
    setPicking(null);
    setNav({ me: null, along: 0, offset: 0, offCount: 0, arrived: false, follow: true, error: null });
  };

  const reroute = () => {
    if (!nav?.me) return;
    void setPoint("from", nav.me.lat, nav.me.lng, "현재 위치");
    setNav((p) => p && { ...p, offCount: 0, along: 0, follow: true });
  };

  const navSegment = nav && line && shownSafe ? segmentAt(shownSafe, line, nav.along) : null;
  const navDark = nav && line && shownSafe ? darkAhead(shownSafe, line, nav.along) : null;

  return (
    <main className="relative flex-1 min-h-dvh overflow-hidden">
      <MapView
        data={data}
        graph={graph}
        visible={visible}
        from={mode === "route" ? from : null}
        to={mode === "route" ? to : null}
        safe={mode === "route" ? shownSafe : null}
        short={mode === "route" ? shownShort : null}
        onPick={onMapPick}
        picking={mode === "route" && picking !== null && !nav}
        // 길 안내 중이거나 "가까운 안전한 곳"을 열었을 때 내 위치를 보여줌
        me={nav?.me ?? (safe?.origin ? { ...safe.origin, acc: 20 } : null)}
        follow={nav ? nav.follow : !!safe?.origin}
        onUserMove={() => setNav((p) => (p && p.follow ? { ...p, follow: false } : p))}
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
          {safe ? (
            <SafeNearby
              origin={safe.origin}
              locating={safe.locating}
              error={safe.error}
              data={data}
              onRoute={(lat, lng, name) => void routeToSafe(lat, lng, name)}
              onClose={() => setSafe(null)}
            />
          ) : mode === "browse" ? (
            <>
              {!onboarded && <Onboarding onDone={finishOnboarding} />}

              {/* 가장 먼저 할 일: 어디로 갈지 */}
              <button
                type="button"
                onClick={startWhereTo}
                className="flex w-full items-center gap-3 rounded-2xl bg-accent px-4 py-3.5 text-left text-accent-ink shadow-[0_0_24px_rgba(255,209,102,0.25)] active:scale-[0.99]"
              >
                <span aria-hidden className="text-lg">
                  🔍
                </span>
                <span className="flex-1">
                  <span className="block text-base font-bold">어디로 가세요?</span>
                  <span className="block text-xs opacity-75">지금 위치에서 밝고 안전한 길을 찾아 드려요</span>
                </span>
              </button>

              <div className="mt-2 grid grid-cols-2 gap-2">
                {home ? (
                  <button
                    type="button"
                    onClick={goHome}
                    className="rounded-2xl border border-accent py-2.5 text-sm font-bold text-accent active:scale-[0.99]"
                  >
                    🏠 {home.name}까지
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={startRouteMode}
                    className="rounded-2xl border border-line py-2.5 text-sm font-bold active:scale-[0.99]"
                  >
                    출발·도착 직접 고르기
                  </button>
                )}
                <button
                  type="button"
                  onClick={openSafe}
                  className="rounded-2xl border border-danger/60 py-2.5 text-sm font-bold text-danger active:scale-[0.99]"
                >
                  🆘 주변 · 112
                </button>
              </div>

              {/* 지도 표시: 작게 */}
              <div className="mt-3 flex items-center justify-between gap-2">
                <p className="text-[11px] text-muted">지도에 표시</p>
                <Link href="/about" className="text-[11px] text-muted underline underline-offset-2">
                  데이터 안내
                </Link>
              </div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {LAYERS.map((l) => {
                  const on = visible[l.id];
                  const empty = (l.id === "street" ? graph !== null : data !== null) && counts[l.id] === 0;
                  const loading = l.id === "street" ? graph === null : data === null;
                  return (
                    <button
                      key={l.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setVisible((v) => ({ ...v, [l.id]: !v[l.id] }))}
                      className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition ${
                        on ? "border-line bg-panel-2" : "border-transparent opacity-45"
                      }`}
                    >
                      <span className="h-2 w-2 rounded-full" style={{ background: l.color }} aria-hidden />
                      {l.short}
                      <span className="text-muted">
                        {loading ? "…" : empty ? "준비 중" : counts[l.id].toLocaleString()}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          ) : nav && shownSafe && line ? (
            <NavPanel
              nav={nav}
              total={line.total}
              segment={navSegment}
              dark={navDark}
              destination={to?.label ?? "도착지"}
              onReroute={reroute}
              onFollow={() => setNav((p) => p && { ...p, follow: true })}
              onStop={() => setNav(null)}
              onSafe={openSafe}
            />
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
                    return (
                      <PlaceField
                        key={field}
                        field={field}
                        label={p?.label ?? null}
                        active={picking === field}
                        locating={locating}
                        onFocus={() => setPicking(field)}
                        // 검색 결과 좌표는 저장하지 않고, 가장 가까운 OSM 길 위의 점으로 바꿔서 씁니다
                        onSelect={(r) => void setPoint(field, r.lat, r.lng, r.name)}
                        onLocate={() => locateMe(field)}
                        autoFocus={field === "to" && focusTo && !to}
                      />
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

              <MyPlaces
                places={places}
                target={(() => {
                  // 아직 저장되지 않은 도착지(없으면 출발지)를 저장 후보로
                  const t = to ? { field: "to" as const, ...to } : from ? { field: "from" as const, ...from } : null;
                  return t && !findNear(places, t.lat, t.lng) ? t : null;
                })()}
                onPick={(lat, lng, name) => void setPoint(picking ?? (!from ? "from" : "to"), lat, lng, name)}
                onRemove={(id) => writePlaces(removePlace(places, id))}
                onSave={savePlace}
              />

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
                <RouteResult safe={routes.safe} short={routes.short} same={routes.same} onStart={startNav} />
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
