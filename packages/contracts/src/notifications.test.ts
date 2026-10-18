import { describe, expect, it } from 'vitest';

import {
  sendTestSmsSchema,
  smsTemplateKeySchema,
  updateSmsSettingsSchema,
  updateSmsTemplateSchema,
} from './notifications.js';

describe('text messages (item 45)', () => {
  it('needs a reason and at least one change to the settings', () => {
    expect(updateSmsSettingsSchema.safeParse({ enabled: true, reason: 'Approved' }).success).toBe(true);
    expect(updateSmsSettingsSchema.safeParse({ reason: 'Approved' }).success).toBe(false);
    expect(updateSmsSettingsSchema.safeParse({ enabled: true }).success).toBe(false);
  });

  it('takes a sender name of 3 to 11 letters, digits, or spaces', () => {
    for (const senderId of ['NURTW', 'NURTW Anam']) {
      expect(updateSmsSettingsSchema.safeParse({ senderId, reason: 'Approved' }).success).toBe(true);
    }
    for (const senderId of ['NU', 'NURTW-ANAMBRA', 'NURTW!']) {
      expect(updateSmsSettingsSchema.safeParse({ senderId, reason: 'Approved' }).success).toBe(false);
    }
  });

  it('refuses words a message cannot carry, saying why', () => {
    const result = updateSmsTemplateSchema.safeParse({
      body: 'NURTW: ₦{amount} received. NIN {nin}',
      reason: 'Union wording',
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      '{nin} is not something a message can carry. Use {amount}, {member}, {date}, {owed}.',
      '₦ cannot be sent in an ordinary SMS. Write naira as N.',
    ]);
    expect(
      updateSmsTemplateSchema.safeParse({ body: 'NURTW: {amount} received.', reason: 'Union wording' })
        .success,
    ).toBe(true);
  });

  it('names only the messages the System sends', () => {
    expect(smsTemplateKeySchema.safeParse('payment_received').success).toBe(true);
    expect(smsTemplateKeySchema.safeParse('anything_else').success).toBe(false);
  });

  it('sends a test only to a Nigerian mobile number', () => {
    expect(sendTestSmsSchema.safeParse({ phone: '0803 123 4567' }).success).toBe(true);
    expect(sendTestSmsSchema.safeParse({ phone: '12345' }).success).toBe(false);
  });
});
