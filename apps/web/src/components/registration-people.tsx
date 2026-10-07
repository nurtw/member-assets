import type {
  RegistrationGuarantor,
  RegistrationNextOfKin,
} from "@nurtw/contracts";

import { Detail, DetailList } from "@/components/ui";

/**
 * A registration's next of kin and its guarantor, as a record shows them
 * (item 42; PRD revision 1.14).
 *
 * The form asks for a full name, a telephone number, and an address. It used
 * to ask for more, and a registration made before the change still holds what
 * it was given: those details are shown where there are any, and not as empty
 * lines where there are none. Nothing recorded is hidden, and nothing that is
 * no longer asked for looks as if it were missing.
 *
 * Used by the application's page and the member's record, so the two cannot
 * come to show a person differently.
 */

/** A detail that is no longer asked for: drawn only where one was recorded. */
function Earlier({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return value && value.trim().length > 0 ? (
    <Detail label={label} value={value} />
  ) : null;
}

export function NextOfKinDetails({
  person,
}: {
  person: RegistrationNextOfKin | null;
}) {
  if (!person) {
    return (
      <p className="text-sm text-faint-foreground">
        No next of kin is on this record.
      </p>
    );
  }
  return (
    <DetailList>
      <Detail label="Full name" value={person.fullName} />
      <Detail label="Telephone" value={person.phone} />
      <Detail label="Address" value={person.address} missing="Not given" />
      <Earlier label="Area" value={person.area} />
      <Earlier label="Town / City" value={person.townCity} />
      <Earlier label="Local government area" value={person.lga?.name} />
      <Earlier label="State of origin" value={person.stateOfOrigin} />
      <Earlier label="Occupation" value={person.occupation} />
    </DetailList>
  );
}

export function GuarantorDetails({
  person,
}: {
  person: RegistrationGuarantor | null;
}) {
  if (!person) {
    return (
      <p className="text-sm text-faint-foreground">
        No guarantor is on this record. One is not compulsory.
      </p>
    );
  }
  return (
    <DetailList>
      <Detail label="Full name" value={person.fullName} />
      <Detail label="Telephone" value={person.phone} />
      <Detail label="Address" value={person.address} />
      <Earlier label="Area" value={person.area} />
      <Earlier label="Town / City" value={person.townCity} />
      <Earlier
        label="Relationship to the member"
        value={person.relationshipToApplicant}
      />
      <Earlier label="Occupation" value={person.occupation} />
      <Earlier
        label="Collateral offered"
        value={
          person.hasCollateral === true
            ? "Yes"
            : person.hasCollateral === false
              ? "No"
              : null
        }
      />
      {person.hasCollateral === true ? (
        <div className="sm:col-span-2">
          <Earlier
            label="Collateral details"
            value={person.collateralDetails}
          />
        </div>
      ) : null}
    </DetailList>
  );
}
