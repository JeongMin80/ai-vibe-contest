"use client";

import { useEffect, useRef, useState } from "react";
import type { SearchResult } from "@/app/api/search/route";

interface Props {
  field: "from" | "to";
  /** 지금 정해진 장소 이름 (없으면 null) */
  label: string | null;
  active: boolean;
  locating: boolean;
  onFocus: () => void;
  onSelect: (r: SearchResult) => void;
  onLocate: () => void;
  /** 검색할 지역 (전주·군산·제주) */
  region: string;
  /** 처음 나타날 때 바로 입력칸에 커서 */
  autoFocus?: boolean;
}

const NAME = { from: "출발지", to: "도착지" } as const;

/** 출발지/도착지 입력칸: 장소 검색(카카오) + 현재 위치 + 지도에서 고르기 */
export default function PlaceField({ field, label, active, locating, onFocus, onSelect, onLocate, autoFocus, region }: Props) {
  const [text, setText] = useState("");
  const [editing, setEditing] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "empty">("idle");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // 입력이 멈추고 0.25초 뒤 검색 (이전 요청은 취소)
  useEffect(() => {
    const q = text.trim();
    // 빈 검색어일 때는 목록 자체를 숨기므로 상태를 바꿀 필요가 없습니다
    if (!editing || q.length < 1) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setStatus("loading");
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&region=${region}`, { signal: ctrl.signal });
        const json = (await res.json()) as { results?: SearchResult[]; error?: string };
        if (!res.ok || !json.results) {
          setError(json.error ?? "검색하지 못했어요.");
          setStatus("error");
          return;
        }
        setResults(json.results.slice(0, 6));
        setStatus(json.results.length ? "idle" : "empty");
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          setError("검색하지 못했어요. 인터넷 연결을 확인해 주세요.");
          setStatus("error");
        }
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [text, editing, region]);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const choose = (r: SearchResult) => {
    onSelect(r);
    setEditing(false);
    setText("");
    setResults([]);
    inputRef.current?.blur();
  };

  const showList = editing && text.trim().length > 0;

  return (
    <div>
      <div
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
        <input
          ref={inputRef}
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          aria-label={`${NAME[field]} 검색`}
          placeholder={`${NAME[field]} 검색 · 또는 지도 누르기`}
          value={editing ? text : (label ?? "")}
          onFocus={() => {
            setEditing(true);
            setText("");
            onFocus();
          }}
          onBlur={() => {
            // 결과를 누를 시간을 주고 닫음
            setTimeout(() => setEditing(false), 200);
          }}
          onChange={(e) => {
            setText(e.target.value);
            if (!e.target.value.trim()) {
              setResults([]);
              setStatus("idle");
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && results[0]) choose(results[0]);
            if (e.key === "Escape") inputRef.current?.blur();
          }}
          className="min-w-0 flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-muted"
        />
        <button
          type="button"
          onClick={onLocate}
          disabled={locating}
          className="shrink-0 rounded-lg border border-line px-2 py-1 text-[11px] text-muted disabled:opacity-50"
        >
          {locating ? "찾는 중" : "현재 위치"}
        </button>
      </div>

      {showList && (
        <div className="mt-1 overflow-hidden rounded-2xl border border-line bg-panel" role="listbox" aria-label={`${NAME[field]} 검색 결과`}>
          {status === "loading" && results.length === 0 && <p className="px-3 py-2.5 text-xs text-muted">찾는 중…</p>}
          {status === "empty" && (
            <p className="px-3 py-2.5 text-xs text-muted">이 지역의 서비스 범위(대학가 주변)에서 찾지 못했어요. 다른 지역이면 위쪽에서 지역을 바꿔 주세요.</p>
          )}
          {status === "error" && <p className="px-3 py-2.5 text-xs text-danger">{error}</p>}
          {results.map((r, i) => (
            <button
              key={`${r.name}-${r.lat}-${r.lng}-${i}`}
              type="button"
              role="option"
              aria-selected={false}
              // 입력칸 blur 보다 먼저 선택되도록 mousedown 에서 처리
              onMouseDown={(e) => {
                e.preventDefault();
                choose(r);
              }}
              className="block w-full border-t border-line px-3 py-2 text-left first:border-t-0 hover:bg-panel-2 focus:bg-panel-2"
            >
              <span className="block truncate text-sm">{r.name}</span>
              <span className="block truncate text-[11px] text-muted">
                {r.category ? `${r.category} · ` : ""}
                {r.address}
              </span>
            </button>
          ))}
          {results.length > 0 && <p className="border-t border-line px-3 py-1 text-right text-[10px] text-muted">장소 검색: 카카오</p>}
        </div>
      )}
    </div>
  );
}
