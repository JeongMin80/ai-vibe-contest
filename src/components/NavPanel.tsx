import type { RouteSegment } from "@/lib/routing";
import { FLAG_CAMPUS, scoreColor, scoreLabel } from "@/lib/routing";

export interface NavState {
  me: { lat: number; lng: number; acc: number } | null;
  along: number;
  offset: number;
  /** 연속으로 경로를 벗어난 횟수 (GPS 튐을 걸러내려고 2번 이상일 때만 알림) */
  offCount: number;
  arrived: boolean;
  follow: boolean;
  error: string | null;
}

interface Props {
  nav: NavState;
  total: number;
  segment: RouteSegment | null;
  dark: { startIn: number; length: number } | null;
  destination: string;
  onReroute: () => void;
  onFollow: () => void;
  onStop: () => void;
  /** 가까운 안전한 곳 열기 */
  onSafe?: () => void;
  /** 음성·진동 안내 */
  voiceOn: boolean;
  onToggleVoice: () => void;
}

const meters = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${Math.max(0, Math.round(m / 10) * 10)}m`);

/** 걸으면서 보는 안내 화면 (지도를 많이 가리지 않게 작게) */
export default function NavPanel({ nav, total, segment, dark, destination, onReroute, onFollow, onStop, onSafe, voiceOn, onToggleVoice }: Props) {
  const remaining = Math.max(0, total - nav.along);
  const minutes = Math.max(1, Math.round(remaining / 75));
  const offRoute = nav.offCount >= 2 && !nav.arrived;

  return (
    <div aria-live="polite">
      {nav.arrived ? (
        <div className="rounded-2xl bg-safe/15 p-3 text-center">
          <p className="text-lg font-bold text-safe">도착했어요 🏁</p>
          <p className="mt-0.5 text-xs text-muted">{destination}에 안전하게 도착했어요.</p>
        </div>
      ) : !nav.me ? (
        <p className="rounded-2xl bg-panel-2 p-3 text-sm text-muted">{nav.error ?? "현재 위치를 찾는 중…"}</p>
      ) : (
        <>
          <div className="flex items-end justify-between gap-2">
            <div>
              <p className="text-[11px] text-muted">{destination}까지</p>
              <p className="text-2xl font-bold">
                {meters(remaining)} <span className="text-base font-normal text-muted">· 약 {minutes}분</span>
              </p>
            </div>
            {segment && (
              <span className="flex items-center gap-1.5 rounded-lg bg-panel-2 px-2 py-1 text-xs">
                <i className="h-2 w-2 rounded-full" style={{ background: scoreColor(segment.score, segment.flags) }} />
                지금 길: {segment.flags & FLAG_CAMPUS ? "캠퍼스 안" : scoreLabel(segment.score)}
              </span>
            )}
          </div>

          {offRoute ? (
            <div className="mt-2 rounded-xl bg-warn/15 px-3 py-2">
              <p className="text-sm font-bold text-warn">경로에서 {Math.round(nav.offset)}m 벗어났어요</p>
              <button type="button" onClick={onReroute} className="mt-1.5 w-full rounded-lg bg-warn py-2 text-sm font-bold text-bg">
                여기서 안심 경로 다시 찾기
              </button>
            </div>
          ) : dark ? (
            <p className="mt-2 rounded-xl bg-danger/15 px-3 py-2 text-sm text-danger">
              {dark.startIn < 15 ? "⚠ 지금 어두운 구간이에요" : `⚠ ${meters(dark.startIn)} 앞`} · 어두운 길이 {meters(dark.length)} 이어져요
            </p>
          ) : (
            <p className="mt-2 rounded-xl bg-safe/10 px-3 py-2 text-sm text-safe">앞으로 밝은 길이 이어져요</p>
          )}

          {nav.me.acc > 50 && <p className="mt-1.5 text-[11px] text-muted">GPS 정확도가 낮아요(±{Math.round(nav.me.acc)}m).</p>}
        </>
      )}

      {!nav.arrived && (
        <button
          type="button"
          onClick={onToggleVoice}
          aria-pressed={voiceOn}
          className="mt-2 py-1.5 text-xs text-muted underline underline-offset-2"
        >
          {voiceOn ? "🔊 음성·진동 안내 켜짐 · 끄기" : "🔇 음성·진동 안내 꺼짐 · 켜기"}
        </button>
      )}

      <div className="mt-2 flex gap-2">
        {!nav.follow && nav.me && !nav.arrived && (
          <button type="button" onClick={onFollow} className="rounded-xl border border-line px-3 py-2.5 text-xs">
            내 위치로
          </button>
        )}
        <a href="tel:112" className="rounded-xl bg-sos px-4 py-2.5 text-sm font-bold text-white">
          112
        </a>
        {onSafe && !nav.arrived && (
          <button type="button" onClick={onSafe} className="rounded-xl border border-danger/60 px-3 py-2.5 text-xs font-bold text-danger">
            🆘 주변
          </button>
        )}
        <button type="button" onClick={onStop} className="flex-1 rounded-xl border border-line py-2.5 text-sm font-bold">
          {nav.arrived ? "닫기" : "안내 끝내기"}
        </button>
      </div>
    </div>
  );
}
