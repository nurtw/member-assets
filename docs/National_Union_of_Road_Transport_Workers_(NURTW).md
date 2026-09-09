# National Union of Road Transport Workers (NURTW)
## Membership / Registration / Guarantorship Form — Field Specification

> **Source:** Photograph of the NURTW Anambra State Council “Membership/Registration/Guarantorship Form.”
>
> **Purpose:** This document extracts the visible fields from the paper form and proposes digital form controls for later implementation. Text marked **[unclear]** should be verified against a clearer scan or the original paper form before production use.

## Form header and metadata

The printed header identifies the organization as the **National Union of Road Transport Workers**, **Anambra State Council**, and includes registration/contact information. It also displays a **passport photo** area. These are primarily document metadata and presentation elements rather than applicant-entered fields.

| Item | Meaning / explanation | Recommended control |
|---|---|---|
| Organization | National Union of Road Transport Workers (NURTW) | Read-only text / branding |
| Council | Anambra State Council | Read-only text or preselected organization context |
| Registration number | Printed registration identifier, visible as “Reg. No. 0054” | Read-only text |
| Motto | “Safety and Unity” (appears in the header) | Read-only text |
| Passport photo | Identification photograph of the operator/applicant | Image upload with camera option; accept JPG/PNG; show crop/preview; validate file size and dimensions |

## Section A — Personal

### A1. Name

| ID | Printed field | Explanation | Recommended control |
|---|---|---|---|
| A1.1 | Surname | Applicant’s family name / last name | Single-line text input; required |
| A1.2 | First name | Applicant’s given name | Single-line text input; required |
| A1.3 | Middle name | Applicant’s additional given name(s); may be absent | Single-line text input; optional |

### A2. Residential address

| ID | Printed field | Explanation | Recommended control |
|---|---|---|---|
| A2.1 | Residential Address | Applicant’s current home address | Multi-line text area, or structured address fields; required |
| A2.2 | Area | Neighborhood, district, village, or locality within the address | Single-line text input; required if locally used |
| A2.3 | Town/City | Town or city where the applicant lives | Searchable select or single-line text input |
| A2.4 | Local Govt. Area (LGA) | Local Government Area of residence | Select/dropdown populated with Nigerian LGAs; preferably filtered by state |
| A2.5 | State of Origin | Nigerian state associated with the applicant’s origin | Select/dropdown of Nigerian states; do not infer this from residential state |

### A3. Operator contact

| ID | Printed field | Explanation | Recommended control |
|---|---|---|---|
| A3.1 | Tel. No. of Operator | Applicant/operator telephone number | Tel input with Nigerian number validation; required |

### A4. Operator signature

| ID | Printed field | Explanation | Recommended control |
|---|---|---|---|
| A4.1 | Signature of operator | Applicant’s acknowledgment/authentication | Signature pad, drawn signature, or uploaded signature image; required where legally/administratively needed |
| A4.2 | Date of signing **[unclear / inferred]** | A date line appears below the operator signature and is likely a signing date; the printed label is not fully legible | Date picker; default to current date but allow correction; verify label before implementation |

## Section B — Unity Body

> The section heading is visibly **“SECTION B (Unity Body)”**. “Unity Body” may refer to the applicant’s union unit, branch, or local organizational body. Confirm the intended meaning with the union before designing validation rules.

| ID | Printed field | Explanation | Recommended control |
|---|---|---|---|
| B1 | Name of Unity | Name of the applicant’s unity/body/unit within the union | Single-line text input or searchable select if a controlled list exists; required |
| B2 | Address of Unity | Physical address of the unity/body | Multi-line text area or structured address fields |
| B3 | Town/City | Town or city where the unity/body is located | Searchable select or single-line text input |
| B4 | Local Gov. Area | LGA where the unity/body is located | Select/dropdown of Nigerian LGAs |
| B5 | Zone | Union zone or administrative zone | Select/dropdown if zones are known; otherwise single-line text input |

## Section C — Next of Kin

### C1. Name

| ID | Printed field | Explanation | Recommended control |
|---|---|---|---|
| C1.1 | Surname | Next of kin’s family name / last name | Single-line text input; required |
| C1.2 | First name | Next of kin’s given name | Single-line text input; required |
| C1.3 | Middle name | Next of kin’s additional given name(s); may be absent | Single-line text input; optional |

### C2. Address

| ID | Printed field | Explanation | Recommended control |
|---|---|---|---|
| C2.1 | Address | Next of kin’s residential or contact address | Multi-line text area; required |
| C2.2 | Area | Neighborhood, district, village, or locality | Single-line text input |
| C2.3 | Town/City | Next of kin’s town or city | Searchable select or single-line text input |
| C2.4 | Local Govt. Area | LGA of the next of kin’s address | Select/dropdown of Nigerian LGAs |
| C2.5 | State of Origin | State of origin of the next of kin | Select/dropdown of Nigerian states |

### C3. Contact and occupation

| ID | Printed field | Explanation | Recommended control |
|---|---|---|---|
| C3.1 | Tel. No. of Next of Kin | Telephone number for contacting the next of kin | Tel input with Nigerian number validation; required |
| C3.2 | Occupation of next of kin | Next of kin’s job, trade, or profession | Single-line text input, optionally with occupation suggestions |

### C4. Signature

| ID | Printed field | Explanation | Recommended control |
|---|---|---|---|
| C4.1 | Sign of next of kin | Next of kin’s signature or acknowledgment | Signature pad or uploaded signature image; required if the paper workflow requires it |
| C4.2 | Date of signing **[unclear / inferred]** | A date line appears below the next-of-kin signature; the printed label is not fully legible | Date picker; verify label before implementation |

## Section D — Guarantor

### D1. Name

| ID | Printed field | Explanation | Recommended control |
|---|---|---|---|
| D1.1 | Surname | Guarantor’s family name / last name | Single-line text input; required |
| D1.2 | First name | Guarantor’s given name | Single-line text input; required |
| D1.3 | Middle name | Guarantor’s additional given name(s); may be absent | Single-line text input; optional |

### D2. Address

| ID | Printed field | Explanation | Recommended control |
|---|---|---|---|
| D2.1 | Address | Guarantor’s residential or contact address | Multi-line text area; required |
| D2.2 | Area | Neighborhood, district, village, or locality | Single-line text input |
| D2.3 | Town/City | Guarantor’s town or city | Searchable select or single-line text input |

### D3. Relationship and contact

| ID | Printed field | Explanation | Recommended control |
|---|---|---|---|
| D3.1 | Relationship with Operator / Applicant | How the guarantor knows or is connected to the operator/applicant | Select/dropdown with “Other” option and conditional text input; required |
| D3.2 | Tel. No. of Guarantor | Guarantor’s telephone number | Tel input with Nigerian number validation; required |
| D3.3 | Occupation of Guarantor | Guarantor’s job, trade, or profession | Single-line text input, optionally with occupation suggestions |

### D4. Signature and security question

| ID | Printed field | Explanation | Recommended control |
|---|---|---|---|
| D4.1 | Signature of Guarantor | Guarantor’s signature confirming the guarantee | Signature pad or uploaded signature image; required |
| D4.2 | Do you have any collateral to secure the tricycle/motorcycle for one year? | Yes/no question about whether collateral is available to secure the tricycle or motorcycle for one year. The photographed wording appears to say “Tr-Motorcycle”; verify the exact phrase. | Required radio buttons: **Yes** / **No**. If **Yes**, reveal conditional collateral-details fields (see below). |
| D4.3 | Collateral details **[not printed on the form]** | Additional information needed if the answer is Yes; the paper form does not visibly provide a separate details field | Conditional multi-line text area; optionally add collateral type, description, estimated value, ownership evidence, and document upload |

## Recommended control and data rules

### Control conventions

- Use **text inputs** for names, occupations, areas, unity names, and relationship details that are not constrained by a reliable controlled vocabulary.
- Use **telephone inputs** with country-aware formatting and validation. The likely default country is Nigeria (`+234`), but users should be able to enter a local Nigerian format if the operational process requires it.
- Use **select controls** for states and LGAs. If the state is selected first, filter the LGA list to the selected state rather than presenting one very long list.
- Use **radio buttons** for the collateral Yes/No question because there are exactly two visible, mutually exclusive options.
- Use **date pickers** for signing dates if the inferred date fields are confirmed.
- Use **signature controls** only if digital signatures are accepted by the organization. Otherwise provide a printable signature area and support later scanning.
- Use **file upload controls** for the passport photo and any collateral evidence. Include file-type, size, preview, and replacement controls.

### Suggested validation

| Field group | Validation suggestion |
|---|---|
| Names | Trim leading/trailing spaces; preserve apostrophes and hyphens; avoid overly restrictive character rules |
| Phone numbers | Validate as Nigerian numbers while storing a normalized international format where possible |
| Residential, unity, next-of-kin, and guarantor addresses | Require enough information to contact the person; do not treat “Area” as a substitute for a complete address |
| State and LGA | Ensure the LGA belongs to the selected state when both are captured as structured values |
| Passport photo | Require a readable face image; allow JPG/PNG; show a preview before submission |
| Signatures | Require an explicit signature or an approved alternative workflow; record who signed and when |
| Guarantor | Prevent accidental reuse of the applicant’s details unless the organization explicitly allows it; require the relationship and phone number |
| Collateral | If “Yes,” require collateral details and, if applicable, supporting evidence; if “No,” do not show irrelevant fields |

## Suggested digital section order

1. **Applicant/personal details:** name, residential address, phone, passport photo, operator signature, and confirmed signing date.
2. **Unity body details:** unity name, address, town/city, LGA, and zone.
3. **Next-of-kin details:** name, address, phone, occupation, signature, and confirmed signing date.
4. **Guarantor details:** name, address, relationship, phone, occupation, signature, collateral question, and conditional collateral details.
5. **Review and submission:** display all entered information, uploaded images, and signatures for correction before final submission.

## Items requiring confirmation before implementation

1. Confirm the exact label beneath **Signature of operator**; it appears to be a date field but is not fully legible.
2. Confirm the exact label beneath **Sign of next of kin**; it also appears to be a date field.
3. Confirm whether **“Unity Body”** means a fixed organizational unit, a branch, or a free-text description.
4. Obtain the authoritative lists of **unities/bodies, zones, towns, and LGAs** if these should be controlled selections.
5. Confirm the exact wording of the collateral question and whether the intended vehicle is a **tricycle, motorcycle, or “tricycle/motorcycle.”**
6. Confirm whether digital signatures and digital passport-photo uploads are accepted, or whether the system should generate a print-ready form for wet signatures.
7. Confirm whether the guarantor’s address includes a printed **Local Government Area** field. It is not clearly visible in Section D, so it has not been included as a definite field above.
8. Confirm whether there are identifiers not visible in the photograph, such as application number, date of registration, membership number, or staff verification fields.

## Proposed internal field naming

For later implementation, use stable names such as:

```text
applicant.surname
applicant.first_name
applicant.middle_name
applicant.residential_address
applicant.area
applicant.town_city
applicant.residential_lga
applicant.state_of_origin
applicant.phone
applicant.passport_photo
applicant.signature
applicant.signature_date

unity.name
unity.address
unity.town_city
unity.lga
unity.zone

next_of_kin.surname
next_of_kin.first_name
next_of_kin.middle_name
next_of_kin.address
next_of_kin.area
next_of_kin.town_city
next_of_kin.lga
next_of_kin.state_of_origin
next_of_kin.phone
next_of_kin.occupation
next_of_kin.signature
next_of_kin.signature_date

guarantor.surname
guarantor.first_name
guarantor.middle_name
guarantor.address
guarantor.area
guarantor.town_city
guarantor.relationship_to_applicant
guarantor.phone
guarantor.occupation
guarantor.signature
guarantor.has_collateral
guarantor.collateral_details
```

**Note:** This is a transcription and implementation analysis from a single photographed form. It should be checked against a sharper original before being used as an official schema or production form.
