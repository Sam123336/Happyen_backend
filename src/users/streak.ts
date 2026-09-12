export interface Streak {
  streakDays: number;
  streakLastActiveOn: string | null;
}

/** An ISO calendar day, `YYYY-MM-DD`, as the phone reports it. */
export const isoDayPattern = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The streak after opening the city on `today`: unchanged on a repeat visit,
 * one longer the day after the last one, otherwise back to a single day.
 * Returns the same object when nothing changed so callers can skip the write.
 */
export function advanceStreak(previous: Streak, today: string): Streak {
  if (previous.streakLastActiveOn === today) {
    return previous;
  }
  const continued = previous.streakLastActiveOn === dayBefore(today);
  return {
    streakDays: continued ? previous.streakDays + 1 : 1,
    streakLastActiveOn: today,
  };
}

/**
 * Which calendar day a session counts for. The phone's own day when it is
 * plausible — within a day of the server's UTC date, which every timezone
 * satisfies — otherwise the server's, so a wrong clock cannot mint a streak.
 */
export function activeDay(
  reported: string | undefined,
  now: Date = new Date(),
): string {
  const serverDay = isoDay(now);
  if (reported === undefined) {
    return serverDay;
  }
  return Math.abs(daysBetween(reported, serverDay)) <= 1 ? reported : serverDay;
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function dayBefore(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return isoDay(date);
}

function daysBetween(from: string, to: string): number {
  const millisecondsPerDay = 86_400_000;
  return Math.round(
    (Date.parse(`${from}T00:00:00Z`) - Date.parse(`${to}T00:00:00Z`)) /
      millisecondsPerDay,
  );
}
