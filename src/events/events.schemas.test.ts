import { describe, expect, it } from 'vitest';

import { nearbyQuerySchema } from './events.schemas.js';

const bengaluru = { lat: '12.9716', lng: '77.5946' };

describe('nearbyQuerySchema', () => {
  it('defaults the radius and page size', () => {
    const parsed = nearbyQuerySchema.parse(bengaluru);

    expect(parsed.radius_m).toBe(5_000);
    expect(parsed.limit).toBe(50);
    expect(parsed.starts_after).toBeUndefined();
  });

  it('coerces the window and the category', () => {
    const parsed = nearbyQuerySchema.parse({
      ...bengaluru,
      category: 'comedy',
      starts_after: '2026-09-08T18:00:00.000Z',
      starts_before: '2026-09-09T02:00:00.000Z',
    });

    expect(parsed.category).toBe('comedy');
    expect(parsed.starts_after).toEqual(new Date('2026-09-08T18:00:00.000Z'));
  });

  it('rejects a window that ends before it starts', () => {
    expect(() =>
      nearbyQuerySchema.parse({
        ...bengaluru,
        starts_after: '2026-09-09T02:00:00.000Z',
        starts_before: '2026-09-08T18:00:00.000Z',
      }),
    ).toThrow();
  });

  it('refuses a radius that would return the whole city', () => {
    expect(() =>
      nearbyQuerySchema.parse({ ...bengaluru, radius_m: '50001' }),
    ).toThrow();
  });

  it('rejects an unknown category and unknown parameters', () => {
    expect(() =>
      nearbyQuerySchema.parse({ ...bengaluru, category: 'techno' }),
    ).toThrow();
    expect(() =>
      nearbyQuerySchema.parse({ ...bengaluru, bbox: '1,2,3,4' }),
    ).toThrow();
  });
});
