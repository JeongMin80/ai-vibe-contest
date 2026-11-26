"use client";

import { useState } from "react";
import { PLACES } from "@/lib/facilities";
import type { SavedPlace } from "@/lib/savedPlaces";

interface Target {
  field: "from" | "to";
  lat: number;
  lng: number;
  label: string;
}

interface Props {
  places: SavedPlace[];
  /** 저장할 수 있는 지점 (아직 저장 안 된 도착지 또는 출발지) */
  target: Target | null;
  onPick: (lat: number, lng: number, name: string) => void;
  onRemove: (id: string) => void;
  onSave: (name: string, home: boolean) => void;
}

const GENERIC_LABELS = new Set(["지도에서 고른 곳", "현재 위치"]);

/** 내 장소 칩(집·자주 가는 곳) + 캠퍼스 바로가기 + 지금 지점 저장하기 */
export default function MyPlaces({ places, target, onPick, onRemove, onSave }: Props) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [manage, setManage] = useState(false);

  const openSave = () => {
    setName(target && !GENERIC_LABELS.has(target.label) ? target.label.slice(0, 20) : "");
    setEditing(true);
  };
  const save = (home: boolean) => {
    onSave(name, home);
    setEditing(false);
  };

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {places.map((p) => (
          <span key={p.id} className="inline-flex items-center rounded-full border border-accent/50 bg-accent/10 text-xs">
            <button type="button" onClick={() => onPick(p.lat, p.lng, p.home ? `🏠 ${p.name}` : `★ ${p.name}`)} className="py-1 pl-3 pr-2">
              {p.home ? "🏠" : "★"} {p.name}
            </button>
            {manage && (
              <button
                type="button"
                onClick={() => onRemove(p.id)}
                aria-label={`${p.name} 삭제`}
                className="mr-1 grid h-5 w-5 place-items-center rounded-full bg-danger/20 text-[11px] text-danger"
              >
                ×
              </button>
            )}
          </span>
        ))}
        {PLACES.map((p) => (
          <button
            key={p.name}
            type="button"
            onClick={() => onPick(p.lat, p.lng, p.name)}
            className="rounded-full border border-line px-3 py-1 text-xs text-muted"
          >
            {p.name}
          </button>
        ))}
        {places.length > 0 && (
          <button type="button" onClick={() => setManage((m) => !m)} className="px-1 text-[11px] text-muted underline underline-offset-2">
            {manage ? "완료" : "편집"}
          </button>
        )}
      </div>

      {target && !editing && (
        <button type="button" onClick={openSave} className="mt-2 text-xs text-accent underline underline-offset-2">
          ★ {target.field === "to" ? "도착지" : "출발지"}를 내 장소로 저장
        </button>
      )}

      {target && editing && (
        <div className="mt-2 rounded-2xl border border-line bg-panel-2/60 p-2.5">
          <label className="block text-[11px] text-muted" htmlFor="place-name">
            이 기기에만 저장돼요 (로그인 없음)
          </label>
          <input
            id="place-name"
            value={name}
            maxLength={20}
            onChange={(e) => setName(e.target.value)}
            placeholder="이름 (예: 도서관, 알바)"
            className="mt-1 w-full rounded-lg border border-line bg-bg px-2.5 py-1.5 text-sm outline-none focus:border-accent"
          />
          <div className="mt-2 flex gap-1.5">
            <button type="button" onClick={() => save(true)} className="flex-1 rounded-lg bg-accent py-1.5 text-xs font-bold text-accent-ink">
              🏠 집으로 저장
            </button>
            <button type="button" onClick={() => save(false)} className="flex-1 rounded-lg border border-accent py-1.5 text-xs font-bold text-accent">
              ★ 저장
            </button>
            <button type="button" onClick={() => setEditing(false)} className="rounded-lg px-2 text-xs text-muted">
              취소
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
