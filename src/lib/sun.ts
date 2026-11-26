// 해 뜨는·지는 시각 계산 (일출 방정식, 오차 수 분 이내)
// 참고: https://en.wikipedia.org/wiki/Sunrise_equation
// "밤"을 고정 시각(예: 19시)으로 정하지 않고, 그날 전주의 실제 일몰 시각으로 판단하려고 씁니다.

const RAD = Math.PI / 180;
const DAY_MS = 86_400_000;
const J1970 = 2440587.5;
const J2000 = 2451545.0;

const toJulian = (d: Date) => d.getTime() / DAY_MS + J1970;
const fromJulian = (j: number) => new Date((j - J1970) * DAY_MS);

/** 주어진 날의 일출·일몰 (해가 지평선 아래 0.833°일 때, 대기 굴절 포함) */
export function sunTimes(date: Date, lat: number, lng: number): { sunrise: Date; sunset: Date } {
  // 그 지역의 정오 무렵 기준 날짜 번호
  const n = Math.round(toJulian(date) - J2000 - 0.0008 + lng / 360);
  const jStar = n - lng / 360;
  const M = (357.5291 + 0.98560028 * jStar) % 360;
  const C = 1.9148 * Math.sin(M * RAD) + 0.02 * Math.sin(2 * M * RAD) + 0.0003 * Math.sin(3 * M * RAD);
  const lambda = (M + C + 180 + 102.9372) % 360;
  const jTransit = J2000 + jStar + 0.0053 * Math.sin(M * RAD) - 0.0069 * Math.sin(2 * lambda * RAD);
  const sinDec = Math.sin(lambda * RAD) * Math.sin(23.4397 * RAD);
  const cosDec = Math.cos(Math.asin(sinDec));
  const cosW = (Math.sin(-0.833 * RAD) - Math.sin(lat * RAD) * sinDec) / (Math.cos(lat * RAD) * cosDec);
  const w = Math.acos(Math.max(-1, Math.min(1, cosW))) / RAD;
  return { sunrise: fromJulian(jTransit - w / 360), sunset: fromJulian(jTransit + w / 360) };
}

/** 지금이 해가 진 뒤(또는 뜨기 전)인지 */
export function isNight(date: Date, lat: number, lng: number): boolean {
  const { sunrise, sunset } = sunTimes(date, lat, lng);
  return date < sunrise || date > sunset;
}
