/**
 * Personal pay links (PRD Requirement 27.8, revision 1.9; `QUESTIONS.md`
 * PAY-21 — item 31).
 *
 * An officer sends a vehicle's or a member's pay link to whoever pays its
 * dues. The page it opens is public, so it must never say what is owed or
 * paid: it offers the same thing for every subject of a kind, at the published
 * amount, whatever that subject's dues stand at. A payment made there is
 * credited like any other, oldest due first, and anything beyond what has
 * fallen due is held as credit (PAY-12, PAY-18).
 *
 * The code is not a credential. It unlocks no record and authorises nothing
 * but paying a published amount for one subject, so it is stored as it is,
 * and appears in a URL and a QR code by design. It is 128 random bits, so it
 * cannot be guessed, and an officer can replace it if it is misused.
 */

export const PAY_LINK_SUBJECTS = ['vehicle', 'member'] as const;
export type PayLinkSubject = (typeof PAY_LINK_SUBJECTS)[number];

/** What a link offers, by the kind of subject. Never by what the subject owes. */
export const PAY_LINK_FEE_TYPES: Readonly<
  Record<PayLinkSubject, readonly string[]>
> = {
  vehicle: ['LEVY'],
  member: ['MEMBERSHIP'],
};

export function payLinkOffers(
  subject: PayLinkSubject,
  feeTypeCode: string,
): boolean {
  return PAY_LINK_FEE_TYPES[subject].includes(feeTypeCode);
}

/** 16 random bytes as base64url, without padding: 22 characters. */
export const PAY_LINK_CODE_PATTERN = /^[A-Za-z0-9_-]{22}$/;

/** Anything else is answered as unknown before the database is asked. */
export function isPayLinkCode(value: string): boolean {
  return PAY_LINK_CODE_PATTERN.test(value);
}

/**
 * What the public page names the subject by, so the payer can see they are
 * paying for the right one. A vehicle by its plate, which is on the vehicle
 * for anyone to read. A member by first name and membership number: enough to
 * recognise, and nothing more of them is shown.
 */
export function payLinkLabel(
  subject:
    | { type: 'vehicle'; plateNumberDisplay: string }
    | { type: 'member'; firstName: string; membershipNumber: string | null },
): string {
  if (subject.type === 'vehicle') {
    return subject.plateNumberDisplay;
  }
  return subject.membershipNumber
    ? `${subject.firstName} · ${subject.membershipNumber}`
    : subject.firstName;
}
