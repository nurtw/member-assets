# Design System and Visual Identity

## NURTW Membership and Vehicle Verification System

**Document version:** 1.0
**Last revised:** 9 September 2026
**Authority:** Subordinate to `PRD.md`. Technical decisions remain in `ARCHITECTURE.md`.

---

## 1. Source of the identity

The palette is taken from the Union's existing physical membership card, supplied by the
owner on 9 September 2026. The card is the identity members already recognise; the System
should look like it belongs to the same organisation.

Observed on the card:

| Element | Treatment |
|---|---|
| Left and right vertical bands | Solid green, carrying "NURTW" and the validity year |
| Organisation name | Green, upper case, bold |
| "NATIONAL HEADQUARTERS, ABUJA" | Deep navy |
| "MOTTO:" label | Red |
| "UNITY & SAFETY" | Deep navy |
| "MEMBERSHIP CARD" banner | White on solid red |
| Union emblem | Red |
| Field area | White, with a faint map watermark |
| Coat of arms | Full colour, upper right |

## 2. Palette

**Determined: red, green, and white**, per the owner on 9 September 2026, consistent with
both the card and the Nigerian national colours.

| Token | Role | Starting value |
|---|---|---|
| `--nurtw-green` | Primary. Bands, headings, primary actions | `#008751` |
| `--nurtw-green-deep` | Hover and pressed states, dark surfaces | `#00603A` |
| `--nurtw-red` | Accent. Emblem, banner, destructive actions | `#C1121F` |
| `--nurtw-navy` | Secondary text, subheadings | `#1B2A6B` |
| `--nurtw-white` | Surfaces, reversed text | `#FFFFFF` |

**These values are provisional.** They are inferred from a photograph taken in daylight,
which shifts colour substantially — the card's greens read differently across the image
depending on shadow. They must be replaced by values sampled from the Union's official
artwork before anything is printed. Approving a printed card or sticker against a
photograph-derived palette risks a visible mismatch with existing stock.

**Action:** obtain the original card and sticker artwork, or a printed sample measured
under controlled lighting, before roadmap item 06.

## 3. Colour must never carry a verdict alone

This is the most consequential rule in this document, and it constrains the officer portal
directly.

**The problem.** Red and green are the brand. They are also the instinctive colours for
"fail" and "pass". The officer verification portal exists to answer one question at the
roadside — *is this sticker good?* — and if the interface is already green-and-red
throughout, a green panel no longer means "verified"; it just means "NURTW".

Compounding this: red and green is the worst possible pair for colour vision deficiency.
Roughly eight per cent of men have some form of red-green deficiency, and the officers
using this portal are a workforce that has never been screened for it. A verdict conveyed
by hue alone will be misread, in daylight, on a cheap phone screen, by someone standing
next to a running vehicle.

**The rules.**

1. **Brand colour is chrome, not signal.** Green and red identify the Union in headers,
   bands, and navigation. They do not, on their own, communicate a verification outcome.
2. **Every verdict carries three redundant cues**: an unambiguous word (`VERIFIED` /
   `NOT VERIFIED`), a distinct shape or icon, and only then colour. Any one of the three
   removed must still leave the result unmistakable.
3. **Verdict states use a dedicated, high-contrast treatment** — full-bleed result panel,
   large type, maximum contrast against the surface. They are visually distinct from
   ordinary branded chrome so that a result is never confused with decoration.
4. **Test in greyscale.** If a screenshot converted to greyscale no longer communicates the
   verdict, the screen is wrong. This is a required check for the officer portal and the
   public verification page.
5. **Never a bare coloured dot or a coloured row** as the sole indication of status in a
   list.

## 4. Contrast

Target **WCAG 2.2 AA** — 4.5:1 for body text, 3:1 for large text and interface components.

The officer portal and public verification page are used outdoors on handsets in bright
sunlight, which is materially worse than an office monitor. For those two surfaces, aim
beyond AA where it costs nothing: heavier weights, larger type, and darker surfaces for
verdict panels.

`--nurtw-green` on white gives roughly 4.6:1 — adequate for body text but with little
margin. White on `--nurtw-green` is the safer pairing for emphasis, and is also how the
card itself sets the banner.

## 5. Surfaces

| Surface | Character |
|---|---|
| Internal dashboard | Dense, information-first. Brand restrained to navigation and headers. Built for sustained daily use by administrative staff. |
| Officer verification portal | Large touch targets, minimal chrome, verdict dominant. One-handed operation, outdoors, at speed. |
| Public verification page | Reached only by scanning a physical sticker (PRD §23.13). Single result, no navigation, no search affordance whatsoever — it must not suggest that browsing is possible. |
| Card and sticker templates | Faithful to the printed artifacts. Governed by `template_version` (PRD §8, §10) so a redesign does not invalidate issued articles. |

## 6. Implementation

Tailwind CSS v4 with the `@theme` directive, tokens declared in
`apps/web/src/app/globals.css`. Components consume semantic tokens rather than raw hex
values, so that replacing the provisional palette with sampled values is a single-file
change.

Dark mode is deferred. The primary surfaces are a daylight roadside portal and an office
dashboard, and the card identity is inherently light. It can be added later without
rework because the tokens are already indirected.

## 7. Findings from the card artwork

Two observations from the supplied card bear on determinations already recorded. Neither
overturns a decision; both are noted so they are not rediscovered later.

### 7.1 The card carries a validity year

The right-hand green band prints **2026** vertically, at the same scale as the Union's own
name. The physical card therefore already asserts a validity year, which indicates annual
re-issuance is existing Union practice rather than a hypothetical.

PRD §23.5 determined **configurable validity per template**, which accommodates this
correctly — an annual period is simply one configuration. The determination stands and
needs no revision. What the card adds is a strong expectation that the Union will in fact
configure an annual cycle, so item 06 should treat annual renewal as the likely default
rather than an edge case, and the year must be renderable as a prominent element of the
template rather than a small print field.

### 7.2 The card is a national template bearing a State field

The header reads **NATIONAL HEADQUARTERS, ABUJA**, while the registration form and the
legacy company record are both Anambra State Council. The card additionally carries a
**State** field among Name, Address, Designation, State, Branch, and Unit.

This confirms rather than contradicts PRD §23.2: the card stock is national, and the State
field is what localises it to a council. Storing the card's State as an organisational
attribute distinct from the member's state of origin is correct, and the determination that
further state councils could be onboarded without schema change is supported by the artwork.

### 7.3 The motto is inconsistent in the source material

The emblem reads *"Motto: Safety & Unity"*; the header beneath it reads
*"MOTTO: UNITY & SAFETY"*. The field specification in `docs/` records *"Safety and Unity"*.

The card template must reproduce whichever wording appears on the official artwork, in each
position, exactly. This is not a discrepancy to resolve by choosing one — both orderings
appear on the same physical card, in different places, and a template that "corrects" one of
them would differ visibly from the article members already hold. Confirm against the
official artwork at item 06.

### 7.4 Card fields confirmed

Name, Address, Designation, State, Branch, Unit — matching PRD §8 exactly. Three signature
lines: President, General Secretary, Holder's Signature, matching PRD §23.7. The passport
photograph sits upper right, over a watermark of the emblem and a map of Nigeria.
