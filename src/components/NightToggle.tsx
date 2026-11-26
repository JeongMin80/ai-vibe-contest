/** 밤 모드 표시와 켜기·끄기. 밤에는 조명 없는 산길·공원길을 더 피해서 경로를 찾습니다. */
export default function NightToggle({ night, auto, onToggle }: { night: boolean; auto: boolean; onToggle: () => void }) {
  return (
    <div className="mt-2 flex items-center justify-between gap-3 rounded-xl bg-panel-2/60 px-3 py-2">
      <p className="text-xs leading-snug">
        {night ? "🌙 밤 시간" : "☀️ 낮 시간"}
        <span className="text-muted">
          {night ? " · 조명 없는 산길·공원길을 더 피해요" : " · 밤이 되면 산길·공원길을 더 피해요"}
          {auto ? " (일몰 기준 자동)" : ""}
        </span>
      </p>
      <button
        type="button"
        role="switch"
        aria-checked={night}
        aria-label="밤 모드"
        onClick={onToggle}
        className={`relative h-6 w-11 shrink-0 rounded-full transition ${night ? "bg-accent" : "bg-line"}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${night ? "left-[22px]" : "left-0.5"}`} />
      </button>
    </div>
  );
}
