// Shared "HH:MM" <-> minutes-since-midnight conversion — used everywhere
// slot/hours math happens (booking availability, the availability-conflict
// check), so there's one definition of what a malformed time string
// resolves to instead of several near-identical copies.
export function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return -1;
  return h * 60 + m;
}

export function fromMinutes(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
