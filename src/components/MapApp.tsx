"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { LAYERS, loadFacilities, type FacilityData, type LayerId } from "@/lib/facilities";

// Leaflet은 브라우저에서만 동작하므로 서버 렌더링을 끕니다.
const MapView = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 grid place-items-center text-muted">지도를 불러오는 중…</div>,
});

export default function MapApp() {
  const [data, setData] = useState<FacilityData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState<Record<LayerId, boolean>>({
    cctv: true,
    lamp: true,
    street: true,
    bell: true,
  });

  useEffect(() => {
    loadFacilities()
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, []);

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

  return (
    <main className="relative flex-1 min-h-dvh overflow-hidden">
      <MapView data={data} visible={visible} />

      {/* 상단: 서비스 이름 */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-[1000] p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="pointer-events-auto inline-flex items-center gap-2 rounded-2xl border border-line bg-panel/90 px-4 py-2.5 shadow-lg backdrop-blur">
          <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-accent shadow-[0_0_12px_var(--accent)]" />
          <h1 className="text-base font-bold tracking-tight">환한길</h1>
          <span className="text-xs text-muted">밤길 안심 경로</span>
        </div>
      </header>

      {/* 하단 패널 */}
      <section
        aria-label="안전시설 보기"
        className="absolute inset-x-0 bottom-0 z-[1000] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      >
        <div className="mx-auto max-w-xl rounded-3xl border border-line bg-panel/95 p-4 shadow-2xl backdrop-blur">
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
            disabled
            className="mt-3 w-full rounded-2xl bg-accent py-3.5 text-sm font-bold text-accent-ink opacity-60"
          >
            안심 경로 찾기 · 곧 열려요
          </button>

          {error && <p className="mt-2 text-xs text-danger">{error}</p>}
        </div>
      </section>
    </main>
  );
}
