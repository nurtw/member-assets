import { describe, expect, it } from 'vitest';

import {
  invitationExpiresAt,
  invitationStanding,
  isInvitationCode,
} from './invitation.js';

const created = new Date('2026-10-05T10:00:00.000Z');
const expires = invitationExpiresAt(created, 14);

describe('invitationExpiresAt', () => {
  it('is the given number of whole days on', () => {
    expect(expires.toISOString()).toBe('2026-10-19T10:00:00.000Z');
  });
});

describe('invitationStanding', () => {
  const open = { expiresAt: expires, usedAt: null, withdrawnAt: null };

  it('is open until it expires', () => {
    expect(invitationStanding(open, new Date('2026-10-19T09:59:59.999Z'))).toBe(
      'OPEN',
    );
    expect(invitationStanding(open, expires)).toBe('EXPIRED');
  });

  it('stays used for good, once an application arrives', () => {
    const used = { ...open, usedAt: new Date('2026-10-06T00:00:00.000Z') };
    expect(invitationStanding(used, new Date('2027-01-01T00:00:00.000Z'))).toBe(
      'USED',
    );
  });

  it('reads withdrawn, even after it would have expired', () => {
    const withdrawn = {
      ...open,
      withdrawnAt: new Date('2026-10-07T00:00:00.000Z'),
    };
    expect(invitationStanding(withdrawn, created)).toBe('WITHDRAWN');
    expect(
      invitationStanding(withdrawn, new Date('2027-01-01T00:00:00.000Z')),
    ).toBe('WITHDRAWN');
  });
});

describe('isInvitationCode', () => {
  it('takes the 22-character base64url shape and nothing else', () => {
    expect(isInvitationCode('abcdefghijklmnopqrstuv')).toBe(true);
    expect(isInvitationCode('AB-_cdefghijklmnopqrs9')).toBe(true);
    expect(isInvitationCode('abcdefghijklmnopqrstu')).toBe(false);
    expect(isInvitationCode('abcdefghijklmnopqrstuvw')).toBe(false);
    expect(isInvitationCode('abcdefghijklmnopqrst/v')).toBe(false);
    expect(isInvitationCode('')).toBe(false);
  });
});
