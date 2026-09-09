import { describe, expect, it } from 'vitest';

import {
  InvalidOrganisationPathError,
  anyScopeContains,
  buildOrganisationPath,
  scopeContains,
} from './organisation-scope.js';

describe('buildOrganisationPath', () => {
  it('builds a separator-delimited path, outermost first', () => {
    expect(buildOrganisationPath(['council', 'zone', 'branch'])).toBe(
      '/council/zone/branch/',
    );
  });

  it('returns the root for an empty ancestry', () => {
    expect(buildOrganisationPath([])).toBe('/');
  });

  it('rejects an id containing the separator', () => {
    // Such an id would forge an extra level and silently widen a scope.
    expect(() => buildOrganisationPath(['council/zone'])).toThrow(
      InvalidOrganisationPathError,
    );
  });

  it('rejects an empty id', () => {
    expect(() => buildOrganisationPath(['council', ''])).toThrow(
      InvalidOrganisationPathError,
    );
  });
});

describe('scopeContains', () => {
  it('contains itself', () => {
    expect(scopeContains('/a/b/', '/a/b/')).toBe(true);
  });

  it('contains descendants', () => {
    expect(scopeContains('/a/b/', '/a/b/c/')).toBe(true);
    expect(scopeContains('/a/b/', '/a/b/c/d/')).toBe(true);
  });

  it('does not contain ancestors', () => {
    expect(scopeContains('/a/b/', '/a/')).toBe(false);
  });

  it('does not contain siblings sharing an id prefix', () => {
    // The trailing separator is the whole defence here.
    expect(scopeContains('/a/branch-1/', '/a/branch-10/')).toBe(false);
  });

  it('root contains everything', () => {
    expect(scopeContains('/', '/a/b/c/')).toBe(true);
    expect(scopeContains('/', '/')).toBe(true);
  });

  it('rejects a malformed path rather than guessing', () => {
    // Silently normalising would risk normalising into a wider scope.
    expect(() => scopeContains('a/b/', '/a/b/')).toThrow(
      InvalidOrganisationPathError,
    );
    expect(() => scopeContains('/a/b', '/a/b/')).toThrow(
      InvalidOrganisationPathError,
    );
  });
});

describe('anyScopeContains', () => {
  it('is false for no scopes', () => {
    expect(anyScopeContains([], '/a/')).toBe(false);
  });

  it('is true when any scope matches', () => {
    expect(anyScopeContains(['/x/', '/a/b/'], '/a/b/c/')).toBe(true);
  });
});
