import { describe, expect, it } from 'vitest';

import { MEMBER_LIST_MAXIMUM, listMembersQuerySchema } from './membership.js';

describe('what the members list may be asked', () => {
  it('a picker sends a name and nothing else, and gets a short list', () => {
    expect(listMembersQuerySchema.parse({ q: ' okeke ' })).toEqual({
      q: 'okeke',
      status: [],
      limit: 20,
    });
  });

  it('several statuses arrive as one value, separated by commas', () => {
    const parsed = listMembersQuerySchema.parse({
      status: 'ACTIVE, SUSPENDED,CANCELLED,ACTIVE',
    });
    expect(parsed.status).toEqual(['ACTIVE', 'SUSPENDED', 'CANCELLED']);
  });

  it('an empty status means every status', () => {
    expect(listMembersQuerySchema.parse({ status: '' }).status).toEqual([]);
  });

  it('an unknown status is refused, never ignored', () => {
    expect(
      listMembersQuerySchema.safeParse({ status: 'ACTIVE,RETIRED' }).success,
    ).toBe(false);
  });

  it('the limit arrives as text and is held to the maximum', () => {
    expect(listMembersQuerySchema.parse({ limit: '200' }).limit).toBe(
      MEMBER_LIST_MAXIMUM,
    );
    for (const limit of ['0', '201', '2.5', 'many']) {
      expect(listMembersQuerySchema.safeParse({ limit }).success).toBe(false);
    }
  });

  it('a unit is named by its identifier', () => {
    expect(
      listMembersQuerySchema.safeParse({ organisationId: 'unit-a' }).success,
    ).toBe(false);
  });
});
