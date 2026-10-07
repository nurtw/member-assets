import { describe, expect, it } from 'vitest';

import {
  MEMBER_LIST_MAXIMUM,
  guarantorSchema,
  listMembersQuerySchema,
  nextOfKinSchema,
} from './membership.js';

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

describe('what the registration form asks for since revision 1.14', () => {
  const kin = { fullName: ' Ngozi Okeke ', phone: '0805 111 2222' };
  const guarantor = {
    fullName: 'Emeka Eze',
    phone: '+2348069998888',
    address: '2 Market Road, Onitsha',
  };

  it('a next of kin is a full name and a telephone number', () => {
    expect(nextOfKinSchema.parse(kin)).toEqual({
      fullName: 'Ngozi Okeke',
      phone: '+2348051112222',
    });
  });

  it('a next of kin may give an address, and need not', () => {
    expect(
      nextOfKinSchema.parse({ ...kin, address: '14 Zik Avenue, Awka' }).address,
    ).toBe('14 Zik Avenue, Awka');
    expect(nextOfKinSchema.safeParse({ ...kin, address: '' }).success).toBe(
      true,
    );
  });

  it('a surname and a first name are not a full name', () => {
    const result = nextOfKinSchema.safeParse({
      surname: 'Okeke',
      firstName: 'Ngozi',
      phone: kin.phone,
    });
    expect(result.success).toBe(false);
  });

  it('what is no longer asked for is dropped, not stored by accident', () => {
    const parsed = nextOfKinSchema.parse({
      ...kin,
      occupation: 'Trader',
      townCity: 'Awka',
    });
    expect(parsed).not.toHaveProperty('occupation');
    expect(parsed).not.toHaveProperty('townCity');
  });

  it('a guarantor is a full name, a telephone number, and an address', () => {
    expect(guarantorSchema.parse(guarantor)).toEqual(guarantor);
    for (const missing of ['fullName', 'phone', 'address'] as const) {
      const partial: Record<string, string> = { ...guarantor };
      delete partial[missing];
      expect(guarantorSchema.safeParse(partial).success).toBe(false);
    }
  });

  it('a guarantor is no longer asked about a relationship or collateral', () => {
    const parsed = guarantorSchema.parse({
      ...guarantor,
      relationshipToApplicant: 'Fellow operator',
      hasCollateral: true,
    });
    expect(parsed).not.toHaveProperty('relationshipToApplicant');
    expect(parsed).not.toHaveProperty('hasCollateral');
  });
});
