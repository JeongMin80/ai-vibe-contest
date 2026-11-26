import { scoreLabel, type Route } from "@/lib/routing";

interface Props {
  safe: Route;
  short: Route;
  same: boolean;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const meters = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${Math.round(m)}m`);

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className={`text-sm ${strong ? "font-bold" : ""}`}>{value}</dd>
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 60 ? "bg-safe/20 text-safe" : score >= 35 ? "bg-warn/20 text-warn" : "bg-danger/20 text-danger";
  return (
    <span className={`rounded-lg px-2 py-0.5 text-xs font-bold ${color}`}>
      {score}점 · {scoreLabel(score)}
    </span>
  );
}

function Card({ title, route, highlight }: { title: string; route: Route; highlight?: boolean }) {
  return (
    <div className={`flex-1 rounded-2xl border p-3 ${highlight ? "border-accent bg-panel-2" : "border-line"}`}>
      <div className="mb-2 flex items-center gap-1.5">
        {highlight ? (
          <span className="h-1.5 w-5 rounded-full bg-safe" aria-hidden />
        ) : (
          <span className="h-0 w-5 border-t-2 border-dotted border-slate-300" aria-hidden />
        )}
        <p className="text-sm font-bold">{title}</p>
      </div>
      <p className="text-lg font-bold">
        {route.minutes}분 <span className="text-sm font-normal text-muted">· {meters(route.length)}</span>
      </p>
      <div className="mt-1.5">
        <ScoreBadge score={route.score} />
      </div>
      <dl className="mt-2 space-y-1">
        <Stat label="조명 있는 구간" value={pct(route.litShare)} />
        <Stat label="CCTV 근처 구간" value={pct(route.cctvShare)} />
        <Stat label="어두운 구간" value={meters(route.darkLength)} strong={highlight} />
      </dl>
    </div>
  );
}

export default function RouteResult({ safe, short, same }: Props) {
  const extraMin = safe.minutes - short.minutes;
  const lessDark = short.darkLength - safe.darkLength;
  const darkest = safe.darkStretches[0];

  return (
    <div className="mt-3" aria-live="polite">
      {same ? (
        <p className="mb-2 rounded-xl bg-safe/15 px-3 py-2 text-sm text-safe">
          최단 경로가 이미 가장 안전한 길이에요.
        </p>
      ) : (
        <p className="mb-2 rounded-xl bg-accent/15 px-3 py-2 text-sm">
          <b className="text-accent">{extraMin > 0 ? `${extraMin}분 더 걷고` : "거의 같은 시간에"}</b>, 어두운 길을{" "}
          <b className="text-accent">{meters(Math.max(0, lessDark))}</b> 줄여요.
        </p>
      )}

      <div className="flex gap-2">
        <Card title="안심 경로" route={safe} highlight />
        {!same && <Card title="최단 경로" route={short} />}
      </div>

      {darkest && darkest.length >= 80 && (
        <p className="mt-2 text-xs text-warn">
          ⚠ 안심 경로에도 어두운 구간이 {meters(darkest.length)} 이어지는 곳이 있어요. 지도의 빨간 구간을 확인하세요.
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
        <span className="flex items-center gap-1">
          <i className="h-1.5 w-4 rounded-full bg-safe" /> 밝고 안전
        </span>
        <span className="flex items-center gap-1">
          <i className="h-1.5 w-4 rounded-full bg-warn" /> 보통
        </span>
        <span className="flex items-center gap-1">
          <i className="h-1.5 w-4 rounded-full bg-danger" /> 어두움
        </span>
        <span className="flex items-center gap-1">
          <i className="h-1.5 w-4 rounded-full bg-[#8b9cc9]" /> 캠퍼스(데이터 없음)
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3">
        <p className="text-[11px] leading-snug text-muted">안전 점수는 공공 안전시설 기준 참고 지표예요.</p>
        <a href="tel:112" className="shrink-0 rounded-xl bg-danger px-3 py-2 text-xs font-bold text-white">
          112 신고
        </a>
      </div>
    </div>
  );
}
