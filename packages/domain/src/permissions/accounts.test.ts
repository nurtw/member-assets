import { describe, expect, it } from 'vitest';

import {
  GRANT_ONLY_PERMISSIONS,
  SECOND_FACTOR_PERMISSIONS,
  escalations,
  isGrantOnly,
  needsSecondFactor,
  passwordProblems,
} from './accounts.js';

const account = { email: 'ada.obi@nurtw.test', fullName: 'Adaeze Obi' };

describe('permissions that need a second factor (Requirement 17.1)', () => {
  it('are those that change access, expose data to outsiders, or move money', () => {
    for (const permission of [
      'user.manage',
      'role.manage',
      'permission.grant',
      'permission.revoke',
      'api_client.manage',
      'api_token.manage',
      'payment.manage_settlement',
      'vehicle.declare',
    ]) {
      expect(needsSecondFactor(permission), permission).toBe(true);
    }
  });

  it('are not the everyday ones', () => {
    for (const permission of [
      'organisation.read',
      'member.create',
      'vehicle.record',
      'verification.perform',
      'card.issue',
      'user.read',
    ]) {
      expect(needsSecondFactor(permission), permission).toBe(false);
    }
  });

  it('include every permission that may never sit in a role', () => {
    for (const permission of GRANT_ONLY_PERMISSIONS) {
      expect(SECOND_FACTOR_PERMISSIONS).toContain(permission);
    }
  });
});

describe('permissions that may never sit in a role', () => {
  it('are vehicle.declare, the settlement account, and adding sticker stock', () => {
    expect(isGrantOnly('vehicle.declare')).toBe(true);
    expect(isGrantOnly('payment.manage_settlement')).toBe(true);
    expect(isGrantOnly('sticker.stock_intake')).toBe(true);
    expect(isGrantOnly('sticker.attach')).toBe(false);
    expect(isGrantOnly('vehicle.record')).toBe(false);
    expect(isGrantOnly('user.manage')).toBe(false);
  });
});

describe('nobody gives what they do not hold', () => {
  it('names what the giver lacks', () => {
    expect(
      escalations(
        ['member.read', 'vehicle.read'],
        ['member.read', 'vehicle.read', 'vehicle.update'],
      ),
    ).toEqual(['vehicle.update']);
  });

  it('is empty when the giver holds it all', () => {
    expect(
      escalations(['member.read', 'vehicle.read'], ['vehicle.read']),
    ).toEqual([]);
    expect(escalations([], [])).toEqual([]);
  });

  it('names each missing permission once', () => {
    expect(escalations([], ['card.issue', 'card.issue'])).toEqual([
      'card.issue',
    ]);
  });
});

describe('a password', () => {
  it('is accepted at twelve characters with no other demand', () => {
    expect(passwordProblems('correct horse battery', account)).toEqual([]);
    expect(passwordProblems('twelve-chars', account)).toEqual([]);
  });

  it('is refused when short, or far too long', () => {
    expect(passwordProblems('short', account)).toContain(
      'Use at least 12 characters.',
    );
    expect(passwordProblems('x'.repeat(201), account)).toContain(
      'Use at most 200 characters.',
    );
  });

  it('is refused when it is one character over and over', () => {
    expect(passwordProblems('aaaaaaaaaaaaaaaa', account)).toContain(
      'Use more than a few different characters.',
    );
    expect(passwordProblems('abababababababab', account)).toContain(
      'Use more than a few different characters.',
    );
  });

  it('is refused when it holds the email or the name', () => {
    expect(passwordProblems('ada.obi-is-my-login', account)).toContain(
      'Do not use your email address in it.',
    );
    expect(passwordProblems('Adaeze-loves-buses', account)).toContain(
      'Do not use your name in it.',
    );
    // A short name part is not checked: "Obi" is in too many words.
    expect(passwordProblems('mobile-phone-case', account)).toEqual([]);
  });
});
