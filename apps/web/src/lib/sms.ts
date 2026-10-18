import {
  describeSmsTemplateIssue,
  type SmsMessageSummary,
} from "@nurtw/contracts";
import {
  checkSmsTemplate,
  renderSmsTemplate,
  smsParts,
  type SmsValues,
} from "@nurtw/domain";

/**
 * Text messages on the screens (item 45). Pure, so the words are tested
 * apart from the pages.
 */

/** What a preview fills a template with: plausible, and plainly an example. */
export const SMS_SAMPLE_VALUES: SmsValues = {
  amount: "N2,000",
  member: "AB12-CD34-5",
  date: "19 Oct",
  owed: "N5,000",
};

/** A template as it would read, how many SMS it takes, and what is wrong with it. */
export function previewSms(body: string): {
  text: string;
  parts: number;
  issues: string[];
} {
  const text = renderSmsTemplate(body, SMS_SAMPLE_VALUES);
  return {
    text,
    parts: smsParts(text),
    issues: checkSmsTemplate(body).map(describeSmsTemplateIssue),
  };
}

/** What happened to a message, in words an officer at the park can repeat. */
export function smsStatusExplanation(
  message: Pick<SmsMessageSummary, "status" | "failure">,
): string {
  switch (message.status) {
    case "QUEUED":
      return message.failure === "UNAVAILABLE"
        ? "Waiting: the SMS service could not be reached, and it will be tried again shortly."
        : "Waiting to be sent.";
    case "SENDING":
      return "Being sent now.";
    case "SENT":
      return "Sent. The network has not yet reported delivery.";
    case "DELIVERED":
      return "Delivered to the phone.";
    case "FAILED":
      switch (message.failure) {
        case "REFUSED":
          return "Not sent: the SMS service refused it.";
        case "UNAVAILABLE":
          return "Not sent: the SMS service could not be reached after several tries.";
        case "NOT_DELIVERED":
          return "Sent, but the network could not deliver it.";
        default:
          return "Not sent.";
      }
    case "UNSENDABLE":
      return message.failure === "NO_NUMBER"
        ? "Not sent: there is no telephone number on record."
        : "Not sent: the number on record is not a Nigerian mobile number.";
    case "NOT_SENT":
      return "Not sent: messages were switched off.";
    case "EXPIRED":
      return "Not sent within a day, so not sent at all.";
  }
}

/** A sent message that can be asked for again. */
export function canResend(message: SmsMessageSummary): boolean {
  return (
    message.purpose === "PAYMENT_RECEIVED" &&
    message.status !== "QUEUED" &&
    message.status !== "SENDING"
  );
}
