import { describe, expect, it } from 'vitest';

import { toFeedEvent } from './predicthq.client.js';

const base = {
  category: 'concerts',
  id: 'phq-1',
  location: [77.5946, 12.9716] as [number, number],
  start: '2026-10-01T18:00:00Z',
  title: 'Kryptos',
};

describe('toFeedEvent', () => {
  it('maps a concert to the music category', () => {
    expect(toFeedEvent(base)[0]).toMatchObject({
      category: 'music',
      latitude: 12.9716,
      longitude: 77.5946,
      sourceId: 'phq-1',
    });
  });

  it.each([
    ['conferences', 'a medical congress'],
    ['expos', 'a garment trade show'],
    ['observances', 'the September equinox'],
  ])('drops %s, which is not somewhere you go out to', (category) => {
    expect(toFeedEvent({ ...base, category })).toEqual([]);
  });

  it('names the venue, not the performer', () => {
    const event = toFeedEvent({
      ...base,
      entities: [
        { name: 'Kryptos', type: 'organization' },
        { name: 'Hard Rock Café - Bengaluru', type: 'venue' },
      ],
    });

    // The first entity is the band; a pin labelled with it is useless.
    expect(event[0]?.venueName).toBe('Hard Rock Café - Bengaluru');
  });

  it('falls back to the street address when no venue is named', () => {
    const event = toFeedEvent({
      ...base,
      entities: [],
      geo: { address: { formatted_address: 'Taj MG Road, Bengaluru' } },
    });

    expect(event[0]?.venueName).toBe('Taj MG Road, Bengaluru');
  });

  it('treats an end equal to the start as no duration', () => {
    // The check constraint refuses end <= start, and a zero-length event is
    // really an event with no stated end.
    expect(toFeedEvent({ ...base, end: base.start })[0]?.endAt).toBeNull();
  });

  it('keeps a genuine end time', () => {
    const event = toFeedEvent({ ...base, end: '2026-10-01T21:00:00Z' });

    expect(event[0]?.endAt?.toISOString()).toBe('2026-10-01T21:00:00.000Z');
  });

  it('drops an event with nowhere to put a pin', () => {
    expect(toFeedEvent({ ...base, location: null })).toEqual([]);
  });

  it('drops an unreadable entry rather than failing the whole ingest', () => {
    expect(toFeedEvent({ nonsense: true })).toEqual([]);
  });
});
