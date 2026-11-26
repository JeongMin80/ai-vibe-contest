"use client";

// 처음 온 사람에게 한 번만 보여주는 3줄 안내
const STEPS = [
  { icon: "🔍", text: "‘어디로 가세요?’에 목적지를 입력하면" },
  { icon: "🟢", text: "CCTV·보안등이 많은 밝은 길을 최단 경로와 비교해 보여줘요" },
  { icon: "🆘", text: "불안할 땐 가까운 지구대·편의점·비상벨을 바로 찾아요" },
];

export default function Onboarding({ onDone }: { onDone: () => void }) {
  return (
    <div className="mb-3 rounded-2xl border border-accent/40 bg-accent/10 p-3" role="note" aria-label="처음 오셨나요">
      <p className="text-sm font-bold">처음 오셨나요? 환한길은 이렇게 써요</p>
      <ol className="mt-2 space-y-1">
        {STEPS.map((s) => (
          <li key={s.icon} className="flex gap-2 text-xs leading-relaxed">
            <span aria-hidden>{s.icon}</span>
            <span>{s.text}</span>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-[11px] text-muted">지금은 전북대·전주교대 주변에서 쓸 수 있어요.</p>
      <button type="button" onClick={onDone} className="mt-2 w-full rounded-lg border border-accent/60 py-1.5 text-xs font-bold text-accent">
        알겠어요
      </button>
    </div>
  );
}
