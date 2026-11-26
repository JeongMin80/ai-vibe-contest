"use client";

import { useState } from "react";
import { REPORT_KINDS, addReport, cooldownLeft, markReported, type ReportKind } from "@/lib/reports";

interface Props {
  pos: { lat: number; lng: number } | null;
  picking: boolean;
  locating: boolean;
  onPickOnMap: () => void;
  onLocate: () => void;
  onDone: (sent: boolean) => void;
}

/** 시민 제보: 위치 → 종류 → (메모) → 보내기 */
export default function ReportPanel({ pos, picking, locating, onPickOnMap, onLocate, onDone }: Props) {
  const [kind, setKind] = useState<ReportKind | null>(null);
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "error">("idle");
  const [error, setError] = useState("");

  const send = async () => {
    if (!pos || !kind) return;
    const wait = cooldownLeft();
    if (wait > 0) {
      setStatus("error");
      setError(`제보는 1분에 한 번만 보낼 수 있어요. ${Math.ceil(wait / 1000)}초 뒤에 다시 시도해 주세요.`);
      return;
    }
    setStatus("sending");
    try {
      await addReport({ kind, lat: pos.lat, lng: pos.lng, note });
      markReported();
      onDone(true);
    } catch (e) {
      setStatus("error");
      setError((e as Error).message);
    }
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-bold">어두운 곳·고장 제보</p>
        <button type="button" onClick={() => onDone(false)} className="text-xs text-muted underline underline-offset-2">
          닫기
        </button>
      </div>
      <p className="mb-3 text-xs leading-relaxed text-muted">
        제보는 14일 동안 지도에 보이고, 다른 사람의 안심 경로가 그곳을 피하는 데 쓰여요. 이름·연락처는 받지 않아요.
      </p>

      <p className="mb-1 text-[11px] text-muted">1. 위치</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onLocate}
          disabled={locating}
          className="flex-1 rounded-xl border border-line py-2 text-xs disabled:opacity-50"
        >
          {locating ? "찾는 중…" : "📍 지금 여기"}
        </button>
        <button
          type="button"
          onClick={onPickOnMap}
          className={`flex-1 rounded-xl border py-2 text-xs ${picking ? "border-accent bg-accent/15 text-accent" : "border-line"}`}
        >
          🗺 지도에서 고르기
        </button>
      </div>
      <p className="mt-1 text-[11px] text-muted">{pos ? "✓ 위치를 골랐어요 (지도의 ⚠ 표시)" : picking ? "지도에서 제보할 곳을 눌러 주세요" : "위치를 골라 주세요"}</p>

      <p className="mb-1 mt-3 text-[11px] text-muted">2. 무엇인가요?</p>
      <div className="grid grid-cols-2 gap-1.5">
        {REPORT_KINDS.map((k) => (
          <button
            key={k.id}
            type="button"
            aria-pressed={kind === k.id}
            onClick={() => setKind(k.id)}
            className={`rounded-xl border px-2 py-2 text-left text-xs ${kind === k.id ? "border-accent bg-accent/15" : "border-line"}`}
          >
            {k.icon} {k.label}
          </button>
        ))}
      </div>

      <label className="mb-1 mt-3 block text-[11px] text-muted" htmlFor="report-note">
        3. 메모 (선택, 100자)
      </label>
      <input
        id="report-note"
        value={note}
        maxLength={100}
        onChange={(e) => setNote(e.target.value)}
        placeholder="예: 원룸 골목 입구 보안등이 꺼져 있어요"
        className="w-full rounded-lg border border-line bg-bg px-2.5 py-1.5 text-sm outline-none focus:border-accent"
      />

      <button
        type="button"
        onClick={() => void send()}
        disabled={!pos || !kind || status === "sending"}
        className="mt-3 w-full rounded-2xl bg-accent py-3 text-sm font-bold text-accent-ink disabled:opacity-40"
      >
        {status === "sending" ? "보내는 중…" : "제보 보내기"}
      </button>
      {status === "error" && <p className="mt-2 text-xs text-danger">{error}</p>}
    </div>
  );
}
