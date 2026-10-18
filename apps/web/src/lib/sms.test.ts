import type { SmsMessageSummary } from "@nurtw/contracts";
import { SMS_TEMPLATE_DEFAULTS } from "@nurtw/domain";
import { describe, expect, it } from "vitest";

import { canResend, previewSms, smsStatusExplanation } from "./sms";

function message(overrides: Partial<SmsMessageSummary>): SmsMessageSummary {
  return {
    id: "m1",
    purpose: "PAYMENT_RECEIVED",
    status: "SENT",
    failure: null,
    recipientLastFour: "4567",
    text: "NURTW: N2,000 received.",
    createdAt: "2026-10-19T09:00:00.000Z",
    sentAt: "2026-10-19T09:00:05.000Z",
    deliveredAt: null,
    resendOf: null,
    ...overrides,
  };
}

describe("text messages on the screens", () => {
  it("previews the default words filled in, in one SMS", () => {
    const preview = previewSms(SMS_TEMPLATE_DEFAULTS.payment_received.body);
    expect(preview.text).toBe(
      "NURTW: N2,000 received for member AB12-CD34-5 on 19 Oct. Still to pay now: N5,000.",
    );
    expect(preview.parts).toBe(1);
    expect(preview.issues).toEqual([]);
  });

  it("says in words what is wrong with a template", () => {
    const preview = previewSms("NURTW: ₦{amount}, NIN {nin}");
    expect(preview.issues).toEqual([
      "{nin} is not something a message can carry. Use {amount}, {member}, {date}, {owed}.",
      "₦ cannot be sent in an ordinary SMS. Write naira as N.",
    ]);
  });

  it("explains every status", () => {
    expect(smsStatusExplanation(message({ status: "DELIVERED" }))).toBe(
      "Delivered to the phone.",
    );
    expect(
      smsStatusExplanation(
        message({ status: "UNSENDABLE", failure: "NO_NUMBER" }),
      ),
    ).toBe("Not sent: there is no telephone number on record.");
    expect(
      smsStatusExplanation(
        message({ status: "NOT_SENT", failure: "SWITCHED_OFF" }),
      ),
    ).toBe("Not sent: messages were switched off.");
    expect(
      smsStatusExplanation(
        message({ status: "QUEUED", failure: "UNAVAILABLE" }),
      ),
    ).toMatch(/tried again shortly/);
    expect(
      smsStatusExplanation(
        message({ status: "FAILED", failure: "NOT_DELIVERED" }),
      ),
    ).toBe("Sent, but the network could not deliver it.");
  });

  it("offers to resend a payment confirmation, not a test or one still going", () => {
    expect(canResend(message({}))).toBe(true);
    expect(canResend(message({ status: "NOT_SENT" }))).toBe(true);
    expect(canResend(message({ status: "QUEUED" }))).toBe(false);
    expect(canResend(message({ purpose: "TEST" }))).toBe(false);
  });
});
