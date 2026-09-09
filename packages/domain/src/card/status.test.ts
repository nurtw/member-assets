import { describe, expect, it } from 'vitest';

import {
  CARD_STATUSES,
  InvalidCardTransitionError,
  LIVE_CARD_STATUSES,
  REPLACEABLE_CARD_STATUSES,
  assertCardTransition,
  canTransitionCard,
  expiryDateFor,
  isCardFinal,
  isCardIssued,
  isCardLive,
  isCardReplaceable,
  isCardVerifiable,
  type CardStatus,
} from './status.js';

/**
 * The legal transitions, written out independently of the implementation.
 *
 * Not imported from the module under test: an exhaustive check against the
 * table it is testing compares the implementation with itself and passes
 * whatever it says.
 */
const LEGAL: readonly [CardStatus, CardStatus][] = [
  ['DRAFT', 'PENDING_APPROVAL'],
  ['DRAFT', 'CANCELLED'],
  ['PENDING_APPROVAL', 'DRAFT'],
  ['PENDING_APPROVAL', 'ISSUED'],
  ['PENDING_APPROVAL', 'CANCELLED'],
  ['ISSUED', 'ACTIVE'],
  ['ISSUED', 'LOST'],
  ['ISSUED', 'REPLACED'],
  ['ISSUED', 'CANCELLED'],
  ['ACTIVE', 'SUSPENDED'],
  ['ACTIVE', 'LOST'],
  ['ACTIVE', 'EXPIRED'],
  ['ACTIVE', 'REPLACED'],
  ['ACTIVE', 'CANCELLED'],
  ['SUSPENDED', 'ACTIVE'],
  ['SUSPENDED', 'LOST'],
  ['SUSPENDED', 'EXPIRED'],
  ['SUSPENDED', 'REPLACED'],
  ['SUSPENDED', 'CANCELLED'],
  ['LOST', 'REPLACED'],
  ['LOST', 'CANCELLED'],
  ['EXPIRED', 'REPLACED'],
  ['EXPIRED', 'CANCELLED'],
];

function isLegal(from: CardStatus, to: CardStatus): boolean {
  return LEGAL.some(([a, b]) => a === from && b === to);
}

describe('CARD_STATUSES', () => {
  it('is the nine states of PRD §8', () => {
    expect([...CARD_STATUSES]).toEqual([
      'DRAFT',
      'PENDING_APPROVAL',
      'ISSUED',
      'ACTIVE',
      'SUSPENDED',
      'LOST',
      'REPLACED',
      'EXPIRED',
      'CANCELLED',
    ]);
  });

  it('has no DAMAGED state — that belongs to stickers', () => {
    expect(CARD_STATUSES).not.toContain('DAMAGED');
  });
});

describe('canTransitionCard', () => {
  it('admits every legal transition and refuses every other pair', () => {
    for (const from of CARD_STATUSES) {
      for (const to of CARD_STATUSES) {
        expect(
          canTransitionCard(from, to),
          `${from} -> ${to}`,
        ).toBe(isLegal(from, to));
      }
    }
  });

  it('refuses every self-transition', () => {
    for (const status of CARD_STATUSES) {
      expect(canTransitionCard(status, status), status).toBe(false);
    }
  });

  it('never returns a lost card to a valid state', () => {
    expect(canTransitionCard('LOST', 'ACTIVE')).toBe(false);
    expect(canTransitionCard('LOST', 'ISSUED')).toBe(false);
    expect(canTransitionCard('LOST', 'SUSPENDED')).toBe(false);
  });

  it('never reactivates an expired card in place', () => {
    expect(canTransitionCard('EXPIRED', 'ACTIVE')).toBe(false);
  });

  it('never resurrects a terminal card', () => {
    for (const terminal of ['REPLACED', 'CANCELLED'] as const) {
      for (const to of CARD_STATUSES) {
        expect(canTransitionCard(terminal, to), `${terminal} -> ${to}`).toBe(
          false,
        );
      }
    }
  });

  it('does not let a draft skip approval', () => {
    expect(canTransitionCard('DRAFT', 'ISSUED')).toBe(false);
    expect(canTransitionCard('DRAFT', 'ACTIVE')).toBe(false);
  });
});

describe('assertCardTransition', () => {
  it('passes silently on a legal transition', () => {
    expect(() => assertCardTransition('DRAFT', 'PENDING_APPROVAL')).not.toThrow();
  });

  it('names the permitted destinations when refusing', () => {
    expect(() => assertCardTransition('DRAFT', 'ACTIVE')).toThrow(
      /Permitted: PENDING_APPROVAL, CANCELLED/,
    );
  });

  it('says a terminal card is final rather than listing nothing', () => {
    expect(() => assertCardTransition('REPLACED', 'ACTIVE')).toThrow(
      /is final/,
    );
  });

  it('throws InvalidCardTransitionError', () => {
    expect(() => assertCardTransition('CANCELLED', 'ACTIVE')).toThrow(
      InvalidCardTransitionError,
    );
  });
});

describe('isCardFinal', () => {
  it('is true for exactly REPLACED and CANCELLED', () => {
    const final = CARD_STATUSES.filter((status) => isCardFinal(status));
    expect([...final]).toEqual(['REPLACED', 'CANCELLED']);
  });
});

describe('the live set', () => {
  it('is ISSUED and ACTIVE', () => {
    expect([...LIVE_CARD_STATUSES]).toEqual(['ISSUED', 'ACTIVE']);
  });

  it('excludes every status describing a card that must not authorise anybody', () => {
    for (const status of ['LOST', 'REPLACED', 'EXPIRED', 'CANCELLED'] as const) {
      expect(isCardLive(status), status).toBe(false);
    }
  });

  it('includes a printed but undelivered card, which can still go missing', () => {
    expect(isCardLive('ISSUED')).toBe(true);
  });
});

describe('isCardVerifiable', () => {
  it('is ACTIVE alone', () => {
    const verifiable = CARD_STATUSES.filter((status) => isCardVerifiable(status));
    expect([...verifiable]).toEqual(['ACTIVE']);
  });

  it('is narrower than the live set: an issued card has not been handed over', () => {
    expect(isCardLive('ISSUED')).toBe(true);
    expect(isCardVerifiable('ISSUED')).toBe(false);
  });
});

describe('isCardReplaceable', () => {
  it('covers the states in which a physical card exists', () => {
    expect([...REPLACEABLE_CARD_STATUSES]).toEqual([
      'ISSUED',
      'ACTIVE',
      'SUSPENDED',
      'LOST',
      'EXPIRED',
    ]);
  });

  it('refuses to replace something that was never printed', () => {
    expect(isCardReplaceable('DRAFT')).toBe(false);
    expect(isCardReplaceable('PENDING_APPROVAL')).toBe(false);
  });

  it('refuses to replace a cancelled card, which would re-credential its holder', () => {
    expect(isCardReplaceable('CANCELLED')).toBe(false);
  });

  it('refuses to replace an already-replaced card', () => {
    expect(isCardReplaceable('REPLACED')).toBe(false);
  });

  it('permits replacement from every state the transition table allows REPLACED from', () => {
    for (const status of CARD_STATUSES) {
      expect(isCardReplaceable(status), status).toBe(
        canTransitionCard(status, 'REPLACED'),
      );
    }
  });
});

describe('isCardIssued', () => {
  it('is false exactly for the two states that carry no card number', () => {
    const unissued = CARD_STATUSES.filter((status) => !isCardIssued(status));
    expect([...unissued]).toEqual(['DRAFT', 'PENDING_APPROVAL']);
  });

  it('stays true once issued, however the card later ended up', () => {
    for (const status of ['LOST', 'REPLACED', 'EXPIRED', 'CANCELLED'] as const) {
      expect(isCardIssued(status), status).toBe(true);
    }
  });
});

describe('expiryDateFor', () => {
  const issued = new Date(Date.UTC(2026, 8, 9, 10, 30, 0));

  it('returns null where the template carries no validity', () => {
    // PRD §23.5 — "may be none", and none is the live configuration until the
    // Union answers CARD-04.
    expect(expiryDateFor(issued, null)).toBeNull();
  });

  it('adds whole months', () => {
    expect(expiryDateFor(issued, 12)?.toISOString()).toBe(
      '2027-09-09T10:30:00.000Z',
    );
    expect(expiryDateFor(issued, 6)?.toISOString()).toBe(
      '2027-03-09T10:30:00.000Z',
    );
  });

  it('preserves the time of day', () => {
    const expiry = expiryDateFor(issued, 1);
    expect(expiry?.getUTCHours()).toBe(10);
    expect(expiry?.getUTCMinutes()).toBe(30);
  });

  it('clamps to the last day of a shorter month rather than overflowing', () => {
    // The trap `setMonth` falls into: 31 January + 1 month becomes 3 March.
    const january31 = new Date(Date.UTC(2026, 0, 31));
    expect(expiryDateFor(january31, 1)?.toISOString()).toBe(
      '2026-02-28T00:00:00.000Z',
    );
  });

  it('lands on 28 February for a leap day in a common year', () => {
    const leapDay = new Date(Date.UTC(2028, 1, 29));
    expect(expiryDateFor(leapDay, 12)?.toISOString()).toBe(
      '2029-02-28T00:00:00.000Z',
    );
  });

  it('keeps a leap day when the target year has one', () => {
    const leapDay = new Date(Date.UTC(2028, 1, 29));
    expect(expiryDateFor(leapDay, 48)?.toISOString()).toBe(
      '2032-02-29T00:00:00.000Z',
    );
  });

  it('crosses a year boundary', () => {
    const december = new Date(Date.UTC(2026, 11, 15));
    expect(expiryDateFor(december, 3)?.toISOString()).toBe(
      '2027-03-15T00:00:00.000Z',
    );
  });

  it('refuses a validity that is not a positive whole number of months', () => {
    for (const invalid of [0, -1, 1.5, Number.NaN]) {
      expect(() => expiryDateFor(issued, invalid), String(invalid)).toThrow(
        InvalidCardTransitionError,
      );
    }
  });
});
