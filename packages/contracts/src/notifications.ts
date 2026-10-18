/**
 * Text messages to members (PRD Requirement 27.14, revision 1.18; roadmap
 * item 45). The rules a template must keep live in `@nurtw/domain`; these are
 * the shapes of the routes that send, list, and configure messages.
 */

import {
  SMS_PLACEHOLDERS,
  SMS_TEMPLATE_KEYS,
  checkSmsTemplate,
  smsRecipient,
  type SmsTemplateIssue,
} from '@nurtw/domain';
import { z } from 'zod';

const reason = z
  .string()
  .trim()
  .min(4, 'A reason is required for this change.')
  .max(1000);

/** The two routes a provider offers; `dnd` reaches numbers on the do-not-disturb list. */
export const SMS_CHANNELS = ['dnd', 'generic'] as const;
export type SmsChannel = (typeof SMS_CHANNELS)[number];

/** A sender name as networks accept one: 3 to 11 letters, digits, or spaces. */
export const smsSenderIdSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9 ]{3,11}$/, 'A sender name is 3 to 11 letters, digits, or spaces.');

/** `PUT /notifications/sms/settings`. Each change is audited with its reason. */
export const updateSmsSettingsSchema = z
  .object({
    enabled: z.boolean().optional(),
    senderId: smsSenderIdSchema.optional(),
    channel: z.enum(SMS_CHANNELS).optional(),
    reason,
  })
  .refine(
    (value) =>
      value.enabled !== undefined ||
      value.senderId !== undefined ||
      value.channel !== undefined,
    { message: 'Change at least one of the switch, the sender name, or the route.' },
  );
export type UpdateSmsSettingsInput = z.infer<typeof updateSmsSettingsSchema>;

/** Says what is wrong with a template, in words. */
export function describeSmsTemplateIssue(issue: SmsTemplateIssue): string {
  switch (issue.kind) {
    case 'EMPTY':
      return 'A message cannot be empty.';
    case 'UNKNOWN_PLACEHOLDER':
      return `{${issue.name}} is not something a message can carry. Use ${SMS_PLACEHOLDERS.map((name) => `{${name}}`).join(', ')}.`;
    case 'NOT_SMS_ALPHABET':
      return `${issue.characters.join(' ')} cannot be sent in an ordinary SMS. Write naira as N.`;
    case 'TOO_LONG':
      return `Filled in, this could take ${issue.parts} SMS. Keep it to two.`;
  }
}

/** `PUT /notifications/sms/templates/:key`. A change is a new version. */
export const updateSmsTemplateSchema = z.object({
  body: z
    .string()
    .trim()
    .max(612)
    .superRefine((body, context) => {
      for (const issue of checkSmsTemplate(body)) {
        context.addIssue({ code: 'custom', message: describeSmsTemplateIssue(issue) });
      }
    }),
  reason,
});
export type UpdateSmsTemplateInput = z.infer<typeof updateSmsTemplateSchema>;

export const smsTemplateKeySchema = z.enum(SMS_TEMPLATE_KEYS);

/** `POST /notifications/sms/test`: one message to a number typed in. */
export const sendTestSmsSchema = z.object({
  phone: z
    .string()
    .trim()
    .min(1, 'Type a telephone number.')
    .max(24)
    .refine((phone) => smsRecipient(phone) !== null, 'A Nigerian mobile number, like 0803 123 4567.'),
});
export type SendTestSmsInput = z.infer<typeof sendTestSmsSchema>;

export type SmsStatus =
  | 'QUEUED'
  | 'SENDING'
  | 'SENT'
  | 'DELIVERED'
  | 'FAILED'
  | 'UNSENDABLE'
  | 'NOT_SENT'
  | 'EXPIRED';

/** One message, as an officer sees it. Never the whole number. */
export interface SmsMessageSummary {
  id: string;
  purpose: 'PAYMENT_RECEIVED' | 'TEST';
  status: SmsStatus;
  /** Why it was not sent or not delivered, as a short code. */
  failure: string | null;
  /** The last four digits of the number it went to. */
  recipientLastFour: string | null;
  /** What was sent; `null` until the message is made up. */
  text: string | null;
  createdAt: string;
  sentAt: string | null;
  deliveredAt: string | null;
  /** The message this one sends again, if it does. */
  resendOf: string | null;
}

/** `GET /members/:id/messages`. */
export interface MemberSmsMessages {
  messages: SmsMessageSummary[];
  /** Whether messages are switched on, so a screen offers to resend only then. */
  sending: boolean;
}

export interface SmsTemplateState {
  key: (typeof SMS_TEMPLATE_KEYS)[number];
  label: string;
  body: string;
  /** 0 for the words the System started with. */
  version: number;
  updatedAt: string | null;
}

/** `GET /notifications/sms`: the switch, the provider, and the words. */
export interface SmsSettingsState {
  enabled: boolean;
  senderId: string;
  channel: SmsChannel;
  /** Whether each part of the provider's configuration is present; never its value. */
  provider: {
    apiKey: boolean;
    baseUrl: boolean;
    webhookSecret: boolean;
  };
  templates: SmsTemplateState[];
}
