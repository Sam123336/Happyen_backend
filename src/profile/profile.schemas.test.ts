import { describe, expect, it } from 'vitest';

import { updatePrivacySchema, updateProfileSchema } from './profile.schemas.js';

describe('profile request schemas', () => {
  it('normalizes usernames and rejects empty updates', () => {
    expect(updateProfileSchema.parse({ username: '  City_Guide  ' })).toEqual({
      username: 'city_guide',
    });
    expect(updateProfileSchema.safeParse({}).success).toBe(false);
  });

  it('accepts only explicit privacy audiences', () => {
    expect(
      updatePrivacySchema.parse({ presenceVisibility: 'friends' }),
    ).toEqual({ presenceVisibility: 'friends' });
    expect(
      updatePrivacySchema.safeParse({ presenceVisibility: 'nearby' }).success,
    ).toBe(false);
  });
});
