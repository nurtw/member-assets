import { describe, expect, it } from 'vitest';

import { FIELDS_LOCKED_TO_ONE_EDIT, importedEditRight } from './imported-edit.js';

const base = {
  imported: true,
  senior: false,
  canUpdate: true,
  canRecord: false,
  editUsed: false,
};

describe('importedEditRight', () => {
  it('lets a senior edit an imported vehicle at any time', () => {
    expect(importedEditRight({ ...base, senior: true })).toBe('ANYTIME');
    expect(importedEditRight({ ...base, senior: true, editUsed: true })).toBe('ANYTIME');
  });

  it('gives a record officer and an enumerator one edit of an imported vehicle', () => {
    expect(importedEditRight(base)).toBe('ONCE');
    expect(importedEditRight({ ...base, canUpdate: false, canRecord: true })).toBe('ONCE');
  });

  it('locks an imported vehicle once the edit is used', () => {
    expect(importedEditRight({ ...base, editUsed: true })).toBe('NONE');
    expect(
      importedEditRight({ ...base, canUpdate: false, canRecord: true, editUsed: true }),
    ).toBe('NONE');
  });

  it('gives nothing to someone who may neither amend nor record vehicles', () => {
    expect(importedEditRight({ ...base, canUpdate: false })).toBe('NONE');
    expect(importedEditRight({ ...base, senior: true, canUpdate: false })).toBe('NONE');
  });

  it('leaves a vehicle recorded through the System as it was', () => {
    expect(importedEditRight({ ...base, imported: false })).toBe('ANYTIME');
    expect(importedEditRight({ ...base, imported: false, editUsed: true })).toBe('ANYTIME');
  });

  it('gives an enumerator nothing on a vehicle recorded through the System', () => {
    expect(
      importedEditRight({ ...base, imported: false, canUpdate: false, canRecord: true }),
    ).toBe('NONE');
  });

  it('keeps the plate, the placement, and the link out of one edit', () => {
    expect([...FIELDS_LOCKED_TO_ONE_EDIT]).toEqual([
      'plateNumberDisplay',
      'organisationId',
      'declaredByMemberId',
    ]);
  });
});
