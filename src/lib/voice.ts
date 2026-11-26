// 길 안내 음성·진동 알림
// - 무엇을 언제 말할지는 pickCue(순수 함수)가 정합니다 → scripts/test-voice.mjs 로 점검
// - 실제 소리·진동은 speak()/buzz() 가 브라우저 기능(음성 합성, 진동)으로 냅니다. 지원하지 않으면 조용히 넘어갑니다.

export interface Cue {
  /** 같은 알림을 되풀이하지 않기 위한 이름 */
  key: string;
  text: string;
  /** 진동 패턴(ms): 울림, 쉼, 울림 … */
  vibrate: number[];
}

export interface CueInput {
  arrived: boolean;
  /** 경로를 벗어났는지 (GPS 튐을 거른 뒤) */
  offRoute: boolean;
  /** 경로 위 지금 위치(출발점부터 m) */
  along: number;
  /** 앞쪽 어두운 구간 (없으면 null) */
  dark: { startIn: number; length: number } | null;
  destination: string;
}

/** 어두운 구간은 이 거리 안으로 다가오면 알림 */
export const DARK_WARN_M = 60;

const roundM = (m: number) => (m < 10 ? "곧" : `약 ${Math.round(m / 10) * 10}미터 앞`);

/**
 * 지금 상태에서 새로 말할 알림 하나와, 갱신된 "이미 말한 알림" 목록을 돌려줍니다.
 * - 도착: 한 번
 * - 경로 이탈: 벗어날 때마다 한 번 (경로로 돌아오면 다시 알릴 수 있게 지움)
 * - 어두운 구간: 구간마다 한 번 (구간 시작 위치로 구분)
 */
export function pickCue(input: CueInput, spoken: ReadonlySet<string>): { cue: Cue | null; spoken: Set<string> } {
  const next = new Set(spoken);
  if (input.arrived) {
    if (next.has("arrived")) return { cue: null, spoken: next };
    next.add("arrived");
    return {
      cue: { key: "arrived", text: `${input.destination}에 도착했어요. 안전하게 도착하셨어요.`, vibrate: [300, 120, 300] },
      spoken: next,
    };
  }
  if (input.offRoute) {
    if (next.has("off")) return { cue: null, spoken: next };
    next.add("off");
    return {
      cue: { key: "off", text: "경로를 벗어났어요. 화면에서 안심 경로 다시 찾기를 눌러 주세요.", vibrate: [200, 100, 200, 100, 200] },
      spoken: next,
    };
  }
  next.delete("off");
  const d = input.dark;
  if (d && d.startIn <= DARK_WARN_M) {
    // 같은 어두운 구간을 걸어가는 동안 되풀이하지 않도록, 구간이 시작되는 위치(20m 단위)로 구분
    const key = `dark-${Math.round((input.along + d.startIn) / 20)}`;
    if (next.has(key)) return { cue: null, spoken: next };
    next.add(key);
    const len = Math.round(d.length / 10) * 10;
    return {
      cue: {
        key,
        text: `${roundM(d.startIn)}, 어두운 길이 ${len}미터 이어져요. 주변을 살피며 걸어 주세요.`,
        vibrate: [150],
      },
      spoken: next,
    };
  }
  return { cue: null, spoken: next };
}

/** 안내 시작 문장 (버튼을 누를 때 바로 말해야 아이폰에서도 소리가 납니다) */
export function startText(destination: string, meters: number) {
  const min = Math.max(1, Math.round(meters / 75));
  return `${destination}까지 걸어서 약 ${min}분, 안심 경로로 안내를 시작합니다.`;
}

export function speak(text: string) {
  try {
    const s = window.speechSynthesis;
    if (!s) return;
    s.cancel(); // 앞 문장이 남아 있으면 끊고 새 알림을 먼저
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ko-KR";
    u.rate = 1.05;
    const ko = s.getVoices().find((v) => v.lang.toLowerCase().startsWith("ko"));
    if (ko) u.voice = ko;
    s.speak(u);
  } catch {}
}

export function buzz(pattern: number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {}
}

export function stopVoice() {
  try {
    window.speechSynthesis?.cancel();
  } catch {}
}

// 음성 안내 켜기·끄기 (이 기기에 저장, 기본은 켜짐)
const VOICE_KEY = "hwanhangil.voice.v1";
let memoryVoice: boolean | null = null;
const voiceListeners = new Set<() => void>();
export function subscribeVoice(cb: () => void) {
  voiceListeners.add(cb);
  return () => {
    voiceListeners.delete(cb);
  };
}
export function getVoiceOn() {
  if (memoryVoice !== null) return memoryVoice;
  try {
    return window.localStorage.getItem(VOICE_KEY) !== "0";
  } catch {
    return true;
  }
}
export const getVoiceServer = () => true;
export function setVoiceOn(on: boolean) {
  memoryVoice = on;
  try {
    window.localStorage.setItem(VOICE_KEY, on ? "1" : "0");
  } catch {}
  if (!on) stopVoice();
  voiceListeners.forEach((l) => l());
}
