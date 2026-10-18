## Item
49 — dues-reminders-and-park-list

## Source
The owner's direction of 18 October 2026 (`QUESTIONS.md` PAY-22): "A few days before a due
date, members who owe get a … reminder, and collectors see a list of who owes at their
park." By SMS, with no calls for now (GOV-23). GOV-22 (timing and wording) is open. Needs
items 45 and 46.

## Goal
A member who will owe a due gets one SMS a set number of days before it falls. A collector
opens a list of the members at their park who owe, and how much.

## Approach
1. **Who owes, and when, is item 22's** (`DuesService`). There is no second rule: the levy
   falls on the 1st, and the membership fee on its anniversary (Requirement 27.13).
2. **The reminder.** A daily run picks members with a due falling in N days
   (`sms.reminder_days_before`) that their held credit will not cover, and queues one
   message each through item 45's outbox:
   - once per member and due, so a second run the same day queues nothing;
   - only within the quiet-hours setting, and only while `sms.reminders_enabled` is on;
   - never under test, where suites call the run themselves, as with the held-credit sweep.

   For example: "NURTW: your dues of N7,000 fall on 1 Nov. Pay your park collector, or
   transfer to 0123456789 (bank)." The account appears only where the member has one.
3. **The park's list.** For a holder of `collection.record`, within their park: name,
   membership number, and what is owed now, largest first, with a count. **No telephone,
   address, or photograph:** a photograph link on every row would add up to a gallery. No
   search beyond the park, and no export. A row opens Collect for that member (item 47).
4. **Dues for many members at once.** `DuesService` reads one member at a time. The list
   and the run need one read for a park, or they will be slow at any real size.
5. **On Home**, a collector's tile: how many at their park owe.

## Files likely touched
`apps/api/src/notifications/`, `apps/api/src/collection/`,
`apps/api/src/payments/dues.service.ts`, `apps/web/src/app/(app)/overview/`, the collector
screens.

## Out of scope
Voice calls (GOV-23). Further reminders once a due has fallen, which the direction does not
ask for.

## To settle before building (GOV-22)
- How many days before a due, and between which hours.
- The wording, and the languages.

## Definition of done
- [ ] One reminder per member per due, N days before, and none where credit covers it.
- [ ] A second run sends nothing more. Nothing is sent while off, or in quiet hours.
- [ ] The park's list shows only the collector's park, with no contact details or
      photographs.
- [ ] Every test passes; clicked through.
