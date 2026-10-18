import { describe, expect, it } from 'vitest';

import {
  SMS_LONGEST_VALUES,
  SMS_PLACEHOLDERS,
  SMS_TEMPLATE_DEFAULTS,
  SMS_TEMPLATE_KEYS,
  checkSmsTemplate,
  nextSmsAttempt,
  nonSmsCharacters,
  renderSmsTemplate,
  smsDate,
  smsDeliveryOutcome,
  smsLastFour,
  smsNaira,
  smsParts,
  smsRecipient,
} from './sms.js';

describe('text messages (item 45)', () => {
  describe('where a message goes', () => {
    it('takes every way a Nigerian number is written to one international form', () => {
      for (const written of ['08031234567', '+234 803 123 4567', '234-803-123-4567', '+2348031234567']) {
        expect(smsRecipient(written), written).toBe('2348031234567');
      }
    });

    it('never guesses at a number it cannot read', () => {
      for (const written of [null, undefined, '', '12345', '0803123456789', 'not a number']) {
        expect(smsRecipient(written)).toBeNull();
      }
    });

    it('shows an officer the last four digits only', () => {
      expect(smsLastFour('2348031234567')).toBe('4567');
    });
  });

  describe('what a template may say', () => {
    it('accepts the defaults', () => {
      for (const key of SMS_TEMPLATE_KEYS) {
        expect(checkSmsTemplate(SMS_TEMPLATE_DEFAULTS[key].body), key).toEqual([]);
      }
    });

    it('offers no placeholder for anything sensitive', () => {
      expect([...SMS_PLACEHOLDERS].sort()).toEqual(['amount', 'date', 'member', 'owed']);
      for (const name of ['nin', 'phone', 'address', 'nextOfKin', 'guarantor', 'chassis', 'link']) {
        expect(checkSmsTemplate(`NURTW: {${name}}`)).toContainEqual({
          kind: 'UNKNOWN_PLACEHOLDER',
          name,
        });
      }
    });

    it('refuses the naira sign and anything else outside the SMS alphabet', () => {
      expect(checkSmsTemplate('NURTW: ₦{amount} received ✓')).toContainEqual({
        kind: 'NOT_SMS_ALPHABET',
        characters: ['₦', '✓'],
      });
      expect(nonSmsCharacters('N2,000 received. Thank you!')).toEqual([]);
    });

    it('refuses a template that could not fit in two messages once filled in', () => {
      const long = `NURTW: {amount} {owed} ${'x'.repeat(290)}`;
      expect(checkSmsTemplate(long)).toContainEqual({ kind: 'TOO_LONG', parts: 3 });
    });

    it('refuses an empty template', () => {
      expect(checkSmsTemplate('   ')).toEqual([{ kind: 'EMPTY' }]);
    });

    it('fills in the placeholders, and only those', () => {
      expect(
        renderSmsTemplate('{amount} for {member} on {date}; {owed} left. {other}', {
          amount: 'N2,000',
          member: 'ANS-1',
          date: '18 Oct',
          owed: 'N5,000',
        }),
      ).toBe('N2,000 for ANS-1 on 18 Oct; N5,000 left. {other}');
    });
  });

  describe('how a message is measured', () => {
    it('counts 160 to one message, then 153 a part', () => {
      expect(smsParts('a'.repeat(160))).toBe(1);
      expect(smsParts('a'.repeat(161))).toBe(2);
      expect(smsParts('a'.repeat(306))).toBe(2);
      expect(smsParts('a'.repeat(307))).toBe(3);
    });

    it('counts the extension characters twice', () => {
      expect(smsParts('€'.repeat(80))).toBe(1);
      expect(smsParts('€'.repeat(81))).toBe(2);
    });

    it('keeps a default, at its longest, in one message', () => {
      for (const key of SMS_TEMPLATE_KEYS) {
        const filled = renderSmsTemplate(SMS_TEMPLATE_DEFAULTS[key].body, SMS_LONGEST_VALUES);
        expect(smsParts(filled), key).toBe(1);
      }
    });
  });

  describe('money and days as a message writes them', () => {
    it('writes naira with N, grouped, kobo only when there are some', () => {
      expect(smsNaira(200_000)).toBe('N2,000');
      expect(smsNaira(3_000_000)).toBe('N30,000');
      expect(smsNaira(51_100)).toBe('N511');
      expect(smsNaira(200_050)).toBe('N2,000.50');
      expect(smsNaira(0)).toBe('N0');
      expect(smsNaira(123_456_789)).toBe('N1,234,567.89');
    });

    it('writes the day in Lagos', () => {
      // 23:30 UTC on the 18th is already the 19th in Lagos.
      expect(smsDate(new Date('2026-10-18T23:30:00Z'))).toBe('19 Oct');
      expect(smsDate(new Date('2026-10-18T10:00:00Z'))).toBe('18 Oct');
    });
  });

  describe('what a delivery report means', () => {
    it('reads delivered, whatever the case', () => {
      expect(smsDeliveryOutcome('DELIVERED')).toBe('DELIVERED');
      expect(smsDeliveryOutcome('Delivered')).toBe('DELIVERED');
    });

    it('reads each failure', () => {
      for (const status of ['Message Failed', 'Rejected', 'Expired', 'DND Active on Phone Number']) {
        expect(smsDeliveryOutcome(status), status).toBe('FAILED');
      }
    });

    it('treats anything else as still pending, never as delivered', () => {
      for (const status of ['Message Sent', 'Received', '', null, 'something new']) {
        expect(smsDeliveryOutcome(status)).toBe('PENDING');
      }
    });
  });

  describe('retrying', () => {
    it('waits longer each time, then gives up', () => {
      const now = new Date('2026-10-18T10:00:00Z');
      expect(nextSmsAttempt(1, now)?.toISOString()).toBe('2026-10-18T10:01:00.000Z');
      expect(nextSmsAttempt(2, now)?.toISOString()).toBe('2026-10-18T10:05:00.000Z');
      expect(nextSmsAttempt(4, now)?.toISOString()).toBe('2026-10-18T11:00:00.000Z');
      expect(nextSmsAttempt(5, now)).toBeNull();
    });
  });
});
