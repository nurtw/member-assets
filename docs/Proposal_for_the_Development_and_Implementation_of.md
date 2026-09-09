# Proposal for the Development and Implementation of the NURTW Membership and Vehicle Verification System

## Membership, Vehicle Declaration, Card, Sticker, and Controlled Verification Platform

**Prepared for:** National Union of Road Transport Workers (NURTW)  
**Organization owner:** National Union of Road Transport Workers  
**Date:** ______________________________

---

## 1. Executive summary

The proposed **NURTW Membership and Vehicle Verification System** is a NURTW-owned platform for managing members, registered transport units, declared vehicles, membership cards, vehicle stickers, and controlled verification services.

The system will create a reliable relationship between a NURTW member, the member’s organizational assignment, and any vehicle declared under that member or transport unit. It will support verification by **vehicle plate number**, **sticker QR code identifier**, **membership number**, and other identifiers approved by NURTW.

NURTW will control the master data, user accounts, organizational structure, verification rules, card and sticker issuance, access permissions, and audit records. External organizations may query selected endpoints only after NURTW approves them, issues API credentials, and assigns explicit permissions.

The system is not a revenue-collection platform, vehicle-registration authority, enforcement authority, or substitute for any external ownership, licensing, roadworthiness, or statutory database. It should return only what NURTW has recorded and is authorized to disclose.

## 2. Ownership and scope

The platform belongs to and is operated for the benefit of **NURTW**. NURTW remains responsible for deciding which records exist, which data is authoritative within the union, which users may access the system, and which external organizations may consume verification services.

The platform scope is limited to NURTW operational records and services:

- NURTW member registration and approval.
- NURTW branch, unit, council, zone, and designation management.
- Membership card generation and lifecycle management.
- Vehicle declaration and association with a member or transport unit.
- NURTW vehicle sticker issuance and replacement.
- Plate-number and sticker-QR verification.
- Controlled API access for approved external organizations.
- Aggregated reporting, including declared vehicle totals.
- Audit trails, access monitoring, and abuse prevention.

The platform must not claim to establish facts that NURTW has not independently recorded or verified.

## 3. Problems the system should solve

NURTW’s paper-based membership cards, registration forms, vehicle records, and stickers can be difficult to search, update, verify, and audit. Common operational problems include:

- Difficulty confirming whether a person is an active NURTW member.
- Difficulty identifying the NURTW record associated with a plate number.
- Counterfeit or duplicated membership cards and stickers.
- Lost or replaced cards and stickers without a clear history.
- Inconsistent branch, unit, designation, and vehicle records.
- Uncontrolled sharing of member and vehicle information.
- Lack of a reliable way for approved outside organizations to verify limited facts.
- Excessive load or abuse when public or external systems repeatedly query verification services.
- No consistent distinction between a declared vehicle, an active sticker, and a verified current record.

The system should address these problems without turning NURTW’s internal records into a public directory.

## 4. Core operating principles

The platform should operate according to the following principles:

1. **NURTW owns the record.** External parties consume approved services; they do not control the source data.
2. **Declare first, verify second.** A vehicle must have an NURTW declaration or sticker record before the system can return a positive NURTW verification result.
3. **Minimum necessary disclosure.** An API response must contain only the fields required for the requesting organization’s approved purpose.
4. **Permission before access.** Every external API credential must have an organization, user or service owner, scopes, expiry policy, and audit trail.
5. **No implied legal conclusion.** A positive result means that a matching NURTW record exists under the stated criteria. It does not prove legal ownership, licensing, roadworthiness, or any fact outside NURTW’s records.
6. **Every sensitive action is auditable.** Creation, update, approval, issuance, suspension, replacement, lookup, export, and administrative override must be logged.
7. **Verification must remain available but protected.** Rate limiting, quotas, caching, request signing, and abuse detection must prevent scraping and denial-of-service patterns.
8. **History is preserved.** Old records are not silently overwritten or deleted when a card, sticker, branch, unit, or vehicle association changes.

## 5. System records and terminology

| Term | Meaning |
|---|---|
| Member | A person registered in the NURTW membership system. |
| Membership application | A submitted registration containing personal, next-of-kin, guarantor, and organizational information. |
| Active member | A member whose NURTW record has been approved and is not suspended, cancelled, or otherwise inactive. |
| Branch | An authorized NURTW branch associated with an organizational area. |
| Unit / Unity Body | The local NURTW organizational unit captured on the registration form and card. The exact relationship to branch must be configured by NURTW. |
| Designation | The member’s approved NURTW role or operational designation. |
| Declared vehicle | A vehicle recorded in the NURTW system with a plate number and relevant NURTW association details. Declaration does not by itself establish legal ownership. |
| Vehicle sticker | A NURTW-issued physical or digital identifier associated with a declared vehicle. |
| Sticker QR code ID | A unique opaque identifier encoded in the sticker’s QR code. It should not contain personal data. |
| Membership card | An NURTW-issued identity and membership credential containing the approved card fields. |
| Verification | A response indicating whether the submitted identifier matches an NURTW record under the requested verification rule. |
| External organization | Any approved organization outside NURTW that is permitted to query selected API endpoints. |
| Declared vehicle total | An aggregate count of vehicles matching an approved filter, without returning individual member or vehicle records. |

## 6. NURTW organizational hierarchy

The system should support the organizational structure needed to manage the registration form and card:

```text
NURTW
  ├── Organizational level / council
  │     ├── Branch
  │     │     ├── Unit / Unity Body
  │     │     └── Members
  │     └── Authorized officers
  ├── Membership records
  ├── Vehicle declarations
  ├── Membership cards
  ├── Vehicle stickers
  └── External API clients
```

The words **state**, **council**, **zone**, **branch**, and **unit** should be configured as NURTW organizational attributes. They must not be presented as evidence that the platform is owned or administered by an outside authority.

## 7. Membership registration module

The membership module should digitize the supplied NURTW membership, registration, and guarantorship form. It should capture the following groups of information:

| Group | Main data |
|---|---|
| Applicant | Surname, first name, middle name, residential address, area, town/city, residential local administrative area where used, state of origin, phone number, passport photograph, signature, and signing date where confirmed. |
| NURTW organizational assignment | Unity/body, unity address, town/city, local area, zone, branch, council or organizational level, and designation. |
| Next of kin | Name, address, area, town/city, local area, state of origin, phone number, occupation, signature, and signing date where confirmed. |
| Guarantor | Name, address, area, town/city, relationship to operator/applicant, phone number, occupation, signature, and collateral response where applicable. |
| Review and approval | Application number, submitted date, review status, reviewer, decision, decision date, rejection reason where applicable, and audit history. |

The system should separate sensitive registration data from card-display data. Next-of-kin, guarantor, signature, collateral, and phone details must not be exposed through ordinary verification responses.

## 8. Membership-card module

The supplied hardcopy card displays the following visible fields:

| Card field | System treatment |
|---|---|
| Name | Derived from the approved member record and formatted for card space. |
| Address | Derived from an approved card-display address, which may be shorter than the full residential address. |
| Designation | Selected from NURTW-controlled designation values. |
| State | Stored as the NURTW membership or organizational context. It must remain separate from state of origin. |
| Branch | Selected from the NURTW branch master list. |
| Unit | Linked to the member’s NURTW unit/unity body. |
| Passport photograph | Reused from the approved member profile with a card-sized crop. |
| President signature | Populated from an approved NURTW officer signature asset. |
| General Secretary signature | Populated from an approved NURTW officer signature asset. |
| Holder’s signature | Collected or reused according to NURTW policy. |
| Membership/card number | Generated by the NURTW system and made unique. |

A card issuance record should contain the card number, template version, status, issue date, expiry or renewal date if NURTW uses one, issuing user, approving officer, replacement relationship, and audit events.

Recommended card statuses include **Draft**, **Pending Approval**, **Issued**, **Active**, **Suspended**, **Lost**, **Replaced**, **Expired**, and **Cancelled**.

## 9. Vehicle declaration module

The vehicle module should record vehicles declared to NURTW. It must distinguish a declaration from a legal ownership claim.

### 9.1 Recommended vehicle fields

| Field | Explanation | Control |
|---|---|---|
| Plate number | The vehicle plate identifier used for lookup. | Text input with normalized storage and duplicate/conflict detection. |
| Plate type or category | Optional classification of the plate format. | Controlled select where NURTW has known categories. |
| Vehicle category | Car, bus, tricycle, motorcycle, truck, or another NURTW-approved category. | Controlled select. |
| Vehicle make and model | Descriptive vehicle information, if captured. | Text input or controlled select. |
| Vehicle color | Descriptive identifier. | Text input or controlled select. |
| Chassis/VIN | Highly sensitive identifier, if NURTW chooses to capture it. | Restricted text input; never expose by default through external APIs. |
| Declared by member | NURTW member associated with the declaration. | Searchable member selector. |
| Unit / branch | NURTW organizational location responsible for the record. | Controlled, linked selectors. |
| Declaration status | Pending, Active, Suspended, Retired, Disputed, or Archived. | Controlled status field. |
| Declaration date | Date the vehicle was entered into the NURTW system. | Date picker or server-generated timestamp. |
| Notes | Internal operational notes. | Restricted multi-line text area; never exposed through public verification. |

### 9.2 Declaration rules

A vehicle may be declared by an authorized NURTW user or by an approved workflow. The system should prevent accidental duplicate active declarations for the same normalized plate number unless NURTW explicitly permits multiple records with a conflict status.

A plate-number match should not automatically disclose the full member record. The system should first determine the requester’s permission scope and then return the smallest permitted response.

Where a vehicle is transferred, replaced, disputed, suspended, or retired, the system should preserve the historical association and make the current status explicit.

## 10. Vehicle sticker module

NURTW may issue a physical sticker containing a QR code. The QR code should contain an opaque sticker identifier or a signed verification reference rather than personal data.

### 10.1 Sticker fields

| Field | Purpose |
|---|---|
| `sticker_id` | Unique internal identifier. |
| `sticker_qr_id` | Public lookup identifier encoded in the QR code. |
| `vehicle_id` | Link to the declared vehicle record. |
| `plate_number` | Plate recorded at issuance; changes require a controlled process. |
| `sticker_status` | Draft, Issued, Active, Suspended, Lost, Replaced, Damaged, Expired, or Cancelled. |
| `issue_date` | Date issued. |
| `expiry_date` | Optional, if NURTW uses sticker validity periods. |
| `replacement_of_sticker_id` | Previous sticker relationship. |
| `template_version` | Sticker design and data version. |
| `issued_by_user_id` | NURTW user responsible for issuance. |

### 10.2 QR verification result

A limited QR verification response may include:

- Whether the QR code is recognized.
- Sticker status.
- Whether the sticker is associated with the submitted plate number, if both are supplied.
- Vehicle category, if approved for disclosure.
- NURTW branch or unit, if approved for disclosure.
- Validity or issue date, if approved for disclosure.
- A verification reference and response timestamp.

It should not include the member’s phone number, next-of-kin, guarantor, residential address, collateral information, chassis/VIN, or internal notes.

## 11. Verification channels

The platform should support separate verification experiences with different disclosure levels:

1. **NURTW internal dashboard:** Full access according to the staff user’s role.
2. **NURTW officer verification portal:** Fast plate and QR checks for authorized officers.
3. **Controlled external API:** Machine-to-machine access for approved organizations using scoped API tokens.
4. **Optional public verification page:** A highly limited result, if NURTW chooses to provide one. It should not expose a searchable public directory.
5. **Internal card/sticker issuance interface:** Used by authorized operators and approvers.

A successful verification should use precise wording such as:

> “A matching NURTW vehicle/sticker record was found under the requested verification criteria.”

It should not say that NURTW has certified legal ownership, roadworthiness, licensing, or any external statutory status unless NURTW has a separate lawful basis and an explicitly defined record for that claim.

## 12. External API model

External bodies may query NURTW endpoints only through an approved API client. The API must be designed as a controlled service, not as an unrestricted public data feed.

### 12.1 API client registration

Each external client should have:

- Legal or operational organization name.
- Named NURTW sponsor or approving officer.
- Technical contact.
- Business purpose.
- Approved environments, such as test and production.
- Token scopes.
- Allowed source IP ranges where practical.
- Expiry and renewal date.
- Per-minute, per-hour, and daily quotas.
- Data-retention agreement or operational rule.
- Status: Pending, Active, Suspended, Expired, or Revoked.

API tokens should be stored as hashes where possible. Secret values should be shown only once at creation or rotation. Tokens must never be placed in URLs, browser code, QR payloads, logs, or error messages.

### 12.2 Suggested scopes

| Scope | Permitted action |
|---|---|
| `vehicle:verify:plate` | Verify a normalized plate number and return the client’s approved minimal result. |
| `sticker:verify:qr` | Verify a sticker QR identifier and return the client’s approved minimal result. |
| `vehicle:verify:combined` | Verify a plate and QR identifier together to detect mismatches. |
| `member:verify:membership` | Confirm a membership number or card status without returning sensitive member data. |
| `aggregate:vehicles:read` | Fetch only approved aggregate declared-vehicle totals. |
| `organization:metadata:read` | Read approved branch, unit, or category labels needed to interpret a response. |
| `audit:client:read` | Read the client’s own request usage and audit summary, if NURTW permits it. |

Do not grant broad scopes such as `database:read` or `member:read:all` to external organizations.

### 12.3 Suggested endpoints

The exact version and URL prefix should be decided during implementation. A versioned structure could be:

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/v1/verification/vehicle/plate` | Verify a vehicle by plate number. |
| `POST` | `/api/v1/verification/sticker/qr` | Verify a NURTW sticker by QR identifier. |
| `POST` | `/api/v1/verification/vehicle/combined` | Compare a plate number and QR identifier. |
| `POST` | `/api/v1/verification/membership` | Verify a membership/card number with a minimal response. |
| `GET` | `/api/v1/aggregates/vehicles/declared` | Return approved declared-vehicle totals only. |
| `GET` | `/api/v1/client/usage` | Return the authenticated client’s quota and usage summary, if enabled. |
| `GET` | `/api/v1/health` | Return service health without revealing internal infrastructure details. |

Verification requests should use request bodies rather than placing sensitive or trackable identifiers in query strings. The aggregate endpoint may use query parameters for approved filters, but it must not accept arbitrary record-level filters.

### 12.4 Example plate-verification request

```http
POST /api/v1/verification/vehicle/plate
Authorization: Bearer <api-token>
Content-Type: application/json
X-Request-ID: 8f3e0d9e-7f5c-4e0c-a4b1-5b9a0fcb6b5e

{
  "plate_number": "ABC 123 XY"
}
```

### 12.5 Example minimal response

```json
{
  "request_id": "8f3e0d9e-7f5c-4e0c-a4b1-5b9a0fcb6b5e",
  "result": "MATCH_FOUND",
  "record_type": "NURTW_DECLARED_VEHICLE",
  "plate_number": "ABC 123 XY",
  "vehicle_category": "TRICYCLE",
  "sticker_status": "ACTIVE",
  "organizational_unit": "APPROVED_UNIT_LABEL",
  "verified_at": "2026-09-09T05:00:00Z",
  "data_as_of": "2026-09-09T04:59:58Z"
}
```

The actual response must be tailored to the client’s scopes. For a client with only `vehicle:verify:plate`, the response may omit the organizational unit and sticker status. The response must never reveal fields that are not included in the client’s approved disclosure profile.

### 12.6 Example QR request

```http
POST /api/v1/verification/sticker/qr
Authorization: Bearer <api-token>
Content-Type: application/json
X-Request-ID: 4c7dfc34-0f3c-4ed1-8dc4-8c7ee99d4dc2

{
  "sticker_qr_id": "nurtw-stk-7J4K9Q2M"
}
```

The QR identifier should be opaque. It should not encode the member’s name, phone number, address, guarantor details, or vehicle chassis number.

## 13. Aggregate declared-vehicle endpoint

NURTW should provide an endpoint that returns totals without returning individual vehicle or member records.

### 13.1 Endpoint

```http
GET /api/v1/aggregates/vehicles/declared
Authorization: Bearer <api-token>
```

### 13.2 Approved filters

Filters should be limited to predefined dimensions, such as:

- Organizational level.
- Branch identifier.
- Unit identifier.
- Vehicle category.
- Declaration status.
- Date range using approved reporting periods.

Do not allow arbitrary SQL-like filters, free-form field selection, or pagination over underlying vehicle records.

### 13.3 Example response

```json
{
  "result": "AGGREGATE_ONLY",
  "filters_applied": {
    "organizational_level": "APPROVED_LEVEL",
    "vehicle_category": "TRICYCLE",
    "declaration_status": "ACTIVE"
  },
  "totals": {
    "declared_vehicle_count": 1284
  },
  "data_as_of": "2026-09-09T04:59:58Z",
  "verified_at": "2026-09-09T05:00:00Z"
}
```

To reduce inference and re-identification risk, NURTW may suppress small totals. For example, a response may return `SUPPRESSED` instead of a count when the filtered result is below a configured minimum. The threshold must be defined by NURTW rather than assumed by API consumers.

## 14. Serious rate limiting and abuse prevention

Rate limiting is a security and availability requirement, not an optional optimization. The API should use several controls together.

### 14.1 Limit dimensions

Apply limits independently or jointly by:

- API client.
- Token.
- Organization.
- Source IP or trusted network range.
- Endpoint and scope.
- Plate or QR identifier pattern.
- Time window.
- Concurrent requests.
- Daily or monthly quota.

A client that is within its overall quota may still be blocked from repeatedly testing thousands of plate numbers or QR identifiers.

### 14.2 Initial limit profile for testing

The following values are a starting point, not a final policy:

| Client type | Verification rate | Aggregate rate | Burst | Daily quota |
|---|---:|---:|---:|---:|
| Unapproved / no token | Deny | Deny | 0 | 0 |
| Approved external client | 30 requests/minute | 2 requests/minute | 5 | NURTW-configured |
| Trusted operational client | 120 requests/minute | 5 requests/minute | 20 | NURTW-configured |
| NURTW internal service | Internal policy | Internal policy | Internal policy | Internal policy |

These limits must be configurable by NURTW administrators. A `429 Too Many Requests` response should include a `Retry-After` value where disclosure is safe.

### 14.3 Additional protections

- Require authentication for every external endpoint except an optional deliberately limited public verification page.
- Use short-lived access tokens or rotating credentials where operationally possible.
- Support token revocation without redeploying the service.
- Require a client-supplied request ID and generate a server request ID.
- Enforce maximum request-body size and strict JSON schemas.
- Reject malformed, repeated, or suspiciously random identifiers.
- Detect sequential plate enumeration and QR brute-force attempts.
- Add circuit breakers for clients with abnormal error rates.
- Cache safe verification results for short periods to reduce repeated database access, while respecting status-change requirements.
- Log rate-limit events, denied scopes, invalid tokens, and suspicious query patterns.
- Temporarily suspend or permanently revoke clients that scrape, share tokens, or attempt unauthorized access.
- Return generic not-found responses that do not disclose whether an identifier was close to a valid value.

## 15. Data disclosure profiles

NURTW should define disclosure profiles before issuing external credentials.

| Profile | Intended use | Example fields |
|---|---|---|
| Minimal verification | Confirm that an NURTW record matches. | Result, record type, verification timestamp, reference. |
| Operational verification | Support an approved operational process. | Minimal profile plus plate, vehicle category, sticker status, and approved branch/unit label. |
| Membership verification | Confirm a membership card or membership number. | Result, membership status, card status, designation if approved, verification timestamp. |
| Aggregate reporting | Report totals without individual records. | Count, approved filters, data-as-of time, suppression indicator where applicable. |
| Internal NURTW | Authorized staff access based on role. | Broader data, still subject to role permissions and audit logging. |

An external organization should never receive full membership registration, next-of-kin, guarantor, collateral, phone, residential address, signature, or internal-note data merely because it can verify a vehicle.

## 16. Roles and permissions

### NURTW internal roles

| Role | Main permissions |
|---|---|
| NURTW super administrator | System configuration, user and organization management, security settings, and emergency controls. |
| Membership administrator | Applications, member records, approval workflows, and member status. |
| Branch or unit administrator | Records within the assigned organizational scope. |
| Card administrator | Card templates, card issuance, replacement, and status management. |
| Sticker administrator | Sticker stock, QR identifiers, issuance, replacement, and status management. |
| Vehicle-record officer | Vehicle declarations and controlled updates within assigned scope. |
| Verification officer | Plate, QR, and membership verification without unnecessary editing rights. |
| Finance or operations officer | Operational reports and approved aggregate totals; no unrestricted personal-data access unless required. |
| Auditor | Read-only access to approved records and audit logs. |
| API administrator | External client approval, token rotation, scopes, quotas, and API audit review. |
| Security administrator | Threat monitoring, rate-limit rules, incident response, and access review. |

### External organization roles

External organizations should normally receive service credentials rather than broad interactive user accounts. If a portal account is needed, it must be bound to the organization, individual user, approved purpose, and API scopes.

No external organization should receive NURTW administrator privileges, record-editing privileges, card/sticker issuance privileges, or unrestricted database access.

## 17. Security, privacy, and audit requirements

The platform should include:

- Strong authentication for internal users.
- Multi-factor authentication for privileged roles.
- Role-based and scope-based access control.
- Encrypted transport for all connections.
- Encrypted storage for sensitive data and uploaded images.
- Secure password and token handling.
- Token hashing, rotation, expiry, and revocation.
- Immutable or tamper-evident audit events.
- Access logs containing client, token identity, endpoint, result class, timestamp, request ID, and response status.
- Separation between operational data and public verification data.
- Backup and restoration procedures.
- Administrative approval for high-risk actions.
- Dual control for sensitive exports, bulk status changes, and emergency overrides where appropriate.
- Monitoring for credential sharing, scraping, brute-force lookups, and unusual access locations.
- Data retention rules approved by NURTW.
- A documented incident-response process.

The system should not log full API tokens, passport images, signatures, guarantor details, or unnecessary personal data in ordinary application logs.

## 18. Audit trail requirements

The audit trail should preserve at least:

- Who created, viewed, changed, approved, suspended, replaced, or cancelled a record.
- The affected member, vehicle, card, sticker, or API client identifier.
- Before-and-after status values for material changes.
- Timestamp in a consistent server timezone.
- Source application, IP address, and request ID for API activity, subject to approved privacy controls.
- Reason for manual overrides, corrections, replacements, and suspensions.
- Token issuance, rotation, permission change, and revocation.
- Rate-limit violations and blocked requests.
- Data exports and aggregate reports generated.

Historical records should be corrected through versioned changes or correction events rather than silent overwrites.

## 19. Recommended system modules

1. NURTW organization and hierarchy module.
2. Membership application and approval module.
3. Member profile and status module.
4. Next-of-kin and guarantor module.
5. Membership-card design and issuance module.
6. Vehicle declaration module.
7. Sticker stock and QR-code module.
8. Plate and QR verification module.
9. External API client and token module.
10. Scope, disclosure-profile, and permission module.
11. Aggregate declared-vehicle reporting module.
12. Rate limiting and abuse-prevention module.
13. Audit trail and security-monitoring module.
14. Reports and operational dashboard module.
15. Backup, restoration, and configuration module.

## 20. Implementation phases

### Phase one — NURTW core records

- Organization hierarchy.
- Member registration and approval.
- Structured records from the paper membership form.
- Member status management.
- Branch, unit, designation, and organizational-level master data.
- Basic audit trail.

### Phase two — cards and vehicles

- Membership-card generation.
- Card number and issuance history.
- Vehicle declaration records.
- Plate normalization and duplicate detection.
- Sticker inventory and QR identifier generation.
- Sticker issuance, replacement, and status management.

### Phase three — internal verification

- NURTW verification dashboard.
- Officer verification workflow.
- Plate lookup.
- QR lookup.
- Combined plate-and-QR mismatch detection.
- Internal operational reports.

### Phase four — controlled external API

- External organization registration and approval.
- API tokens, scopes, disclosure profiles, and token rotation.
- Plate verification endpoint.
- Sticker QR verification endpoint.
- Membership verification endpoint.
- Aggregate declared-vehicle totals endpoint.
- Rate limiting, quotas, anomaly detection, and API audit logs.

### Phase five — operational hardening

- Mobile-friendly verification experience.
- Offline capture or deferred synchronization only if required by NURTW operations.
- Bulk card/sticker workflows with approval controls.
- Replacement and dispute workflows.
- Security testing and API abuse testing.
- Reporting improvements and service-level monitoring.

## 21. Expected benefits to NURTW

The system should provide NURTW with:

- A searchable and structured membership register.
- Better control over member, branch, unit, vehicle, card, and sticker records.
- Faster internal verification.
- Reduced dependence on paper-only records.
- Better detection of invalid, cancelled, replaced, or mismatched cards and stickers.
- Clear issuance and replacement history.
- Controlled information sharing with approved outside organizations.
- Aggregate reporting without exposing individual records.
- Stronger accountability for staff and API consumers.
- A foundation for future NURTW services without surrendering ownership of the data.

## 22. Important limitations

The platform must not represent a NURTW record as proof of any fact outside the system’s defined scope. In particular, a NURTW membership, vehicle declaration, card, or sticker does not automatically certify:

- Legal ownership of a vehicle.
- Validity of an external vehicle-registration document.
- Roadworthiness.
- Driver licensing.
- Insurance status.
- Chassis or VIN ownership.
- Criminal-record status.
- A person’s legal identity beyond the information NURTW has collected and approved.
- Authorization to operate in a particular location outside NURTW’s own rules.

Verification responses should state the exact result being verified and include a timestamp or data-as-of value.

## 23. Decisions NURTW must confirm before implementation

1. The official NURTW hierarchy and the relationship between council, state, zone, branch, and unit.
2. Whether the card’s **State** field represents membership location, organizational location, or another NURTW-defined value.
3. Whether **Unit** is exactly the same as the paper form’s **Unity Body**.
4. The official designation, branch, unit, vehicle-category, and status lists.
5. Whether membership cards and stickers expire or require periodic renewal.
6. The membership-number, card-number, and sticker-number formats.
7. The official card and sticker templates, including officer signature rules.
8. Whether a member may have multiple declared vehicles.
9. Whether a vehicle may be associated with multiple members or units, and how conflicts are handled.
10. Which external organization types may receive API access.
11. The disclosure profile for each external organization type.
12. Initial rate limits, daily quotas, small-count suppression thresholds, and token expiry periods.
13. Whether an optional public verification page is needed at all.
14. Which fields may be shown in plate and QR verification responses.
15. Data retention, correction, dispute, and record-archiving rules.
16. Whether NURTW will accept digital signatures and uploaded photographs as official records or use the system primarily to produce print-ready forms/cards.

## 24. Proposed internal field names

```text
organization.name
organization.level
organization.council_id
organization.branch_id
organization.unit_id
organization.zone_id

member.membership_number
member.status
member.surname
member.first_name
member.middle_name
member.phone
member.residential_address
member.area
member.town_city
member.residential_lga
member.state_of_origin
member.passport_photo_id
member.signature_id
member.designation_id

application.application_number
application.status
application.submitted_at
application.reviewed_by_user_id
application.reviewed_at
application.rejection_reason

vehicle.vehicle_id
vehicle.plate_number_normalized
vehicle.plate_number_display
vehicle.vehicle_category
vehicle.make
vehicle.model
vehicle.color
vehicle.chassis_vin_restricted
vehicle.declared_by_member_id
vehicle.branch_id
vehicle.unit_id
vehicle.status
vehicle.declared_at

sticker.sticker_id
sticker.sticker_qr_id
sticker.vehicle_id
sticker.status
sticker.issue_date
sticker.expiry_date
sticker.replacement_of_sticker_id
sticker.template_version

card.card_id
card.card_number
card.membership_number
card.status
card.issue_date
card.expiry_date
card.template_version
card.replacement_of_card_id

api_client.client_id
api_client.organization_name
api_client.status
api_client.scopes
api_client.disclosure_profile
api_client.allowed_ip_ranges
api_client.rate_limit_profile
api_client.daily_quota
api_client.token_expires_at

api_request.request_id
api_request.client_id
api_request.endpoint
api_request.scope
api_request.result_class
api_request.status_code
api_request.created_at
api_request.rate_limited
```

## 25. Conclusion

The proposed platform should be designed as a **NURTW-owned membership and vehicle verification system**, not as a levy, revenue, or vehicle-registration platform. NURTW should control the records, workflows, card and sticker issuance, user permissions, API clients, disclosure rules, and audit history.

Approved external organizations can be supported through narrow, versioned, authenticated endpoints for plate verification, sticker QR verification, membership verification, and aggregate declared-vehicle totals. Their access should be limited by scopes, disclosure profiles, quotas, rate limits, token lifecycle rules, and continuous audit monitoring.

The central system relationship is:

```text
NURTW MEMBER
    ↓
NURTW ORGANIZATIONAL ASSIGNMENT
    ↓
DECLARED VEHICLE
    ↓
NURTW CARD / VEHICLE STICKER
    ↓
CONTROLLED VERIFICATION API
```

A successful lookup should establish only that the submitted identifier matches an approved NURTW record under the requested rule. That narrow claim is the foundation for a useful system that protects NURTW’s ownership, member privacy, operational control, and long-term data integrity.

**Prepared by:** ______________________________  
**Organization:** ______________________________  
**Signature:** _________________________________  
**Date:** _____________________________________

---

## References

This proposal is based on the NURTW membership/registration/guarantorship form and the sample NURTW hardcopy membership card supplied for this project. No external source was used to define the proposed NURTW data model or API policy.
