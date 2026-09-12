import { describe, expect, it } from 'vitest';

import { activeDay, advanceStreak } from './streak.js';

describe('advanceStreak', () => {
  it('grows by one on consecutive days and restarts after a gap', () => {
    const start = advanceStreak(
      { streakDays: 0, streakLastActiveOn: null },
      '2026-09-12',
    );
    expect(start).toEqual({ streakDays: 1, streakLastActiveOn: '2026-09-12' });

    const nextDay = advanceStreak(start, '2026-09-13');
    expect(nextDay.streakDays).toBe(2);

    // Month boundary is still "the day after".
    expect(
      advanceStreak(
        { streakDays: 5, streakLastActiveOn: '2026-09-30' },
        '2026-10-01',
      ).streakDays,
    ).toBe(6);

    expect(advanceStreak(nextDay, '2026-09-20')).toEqual({
      streakDays: 1,
      streakLastActiveOn: '2026-09-20',
    });
  });

  it('returns the same object on a second opening the same day', () => {
    const streak = { streakDays: 3, streakLastActiveOn: '2026-09-12' };
    expect(advanceStreak(streak, '2026-09-12')).toBe(streak);
  });
});

describe('activeDay', () => {
  const serverNow = new Date('2026-09-12T20:30:00Z');

  it('trusts a phone day within a day of the server and nothing further', () => {
    expect(activeDay('2026-09-13', serverNow)).toBe('2026-09-13');
    expect(activeDay('2026-09-11', serverNow)).toBe('2026-09-11');
    expect(activeDay('2026-09-20', serverNow)).toBe('2026-09-12');
    expect(activeDay('2026-13-45', serverNow)).toBe('2026-09-12');
    expect(activeDay(undefined, serverNow)).toBe('2026-09-12');
  });
});
