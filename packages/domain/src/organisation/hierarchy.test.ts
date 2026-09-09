import { describe, expect, it } from 'vitest';

import {
  InvalidHierarchyError,
  ORGANISATION_LEVELS,
  assertMoveIsAcyclic,
  assertValidPlacement,
  canContain,
  childLevelOf,
  childPath,
  idFromPath,
  isMoveAcyclic,
  isOrganisationLevel,
  levelDepth,
  outermostScopes,
  parentLevelOf,
  parentPathOf,
  rewriteDescendantPath,
} from './hierarchy.js';
import { InvalidOrganisationPathError } from '../permissions/organisation-scope.js';

describe('levels', () => {
  it('runs council to unit, outermost first (PRD §23.1)', () => {
    expect(ORGANISATION_LEVELS).toEqual(['COUNCIL', 'ZONE', 'BRANCH', 'UNIT']);
  });

  it('reports depth beneath the root', () => {
    expect(levelDepth('COUNCIL')).toBe(0);
    expect(levelDepth('UNIT')).toBe(3);
  });

  it('recognises only the four levels', () => {
    expect(isOrganisationLevel('BRANCH')).toBe(true);
    expect(isOrganisationLevel('REGION')).toBe(false);
    expect(isOrganisationLevel('branch')).toBe(false);
  });

  it('walks child and parent levels, terminating at both ends', () => {
    expect(childLevelOf('COUNCIL')).toBe('ZONE');
    expect(childLevelOf('UNIT')).toBeNull();
    expect(parentLevelOf('UNIT')).toBe('BRANCH');
    expect(parentLevelOf('COUNCIL')).toBeNull();
  });
});

describe('placement', () => {
  it('accepts each level directly beneath its own parent', () => {
    expect(canContain(null, 'COUNCIL')).toBe(true);
    expect(canContain('COUNCIL', 'ZONE')).toBe(true);
    expect(canContain('ZONE', 'BRANCH')).toBe(true);
    expect(canContain('BRANCH', 'UNIT')).toBe(true);
  });

  it('refuses a level skipped over, not merely a level inverted', () => {
    // The rule is exact, not "somewhere above". A unit beneath a council would
    // make the level field decorative.
    expect(canContain('COUNCIL', 'UNIT')).toBe(false);
    expect(canContain('COUNCIL', 'BRANCH')).toBe(false);
    expect(canContain('ZONE', 'UNIT')).toBe(false);
  });

  it('refuses an inverted placement', () => {
    expect(canContain('UNIT', 'BRANCH')).toBe(false);
    expect(canContain('ZONE', 'COUNCIL')).toBe(false);
  });

  it('refuses a level beneath itself', () => {
    for (const level of ORGANISATION_LEVELS) {
      expect(canContain(level, level)).toBe(false);
    }
  });

  it('permits only a council at the root', () => {
    expect(canContain(null, 'ZONE')).toBe(false);
    expect(canContain(null, 'BRANCH')).toBe(false);
    expect(canContain(null, 'UNIT')).toBe(false);
  });

  it('names the required parent when it throws', () => {
    expect(() => assertValidPlacement('COUNCIL', 'UNIT')).toThrow(
      InvalidHierarchyError,
    );
    expect(() => assertValidPlacement('COUNCIL', 'UNIT')).toThrow(
      /must sit directly beneath a BRANCH/,
    );
    expect(() => assertValidPlacement('ZONE', 'COUNCIL')).toThrow(
      /root node/,
    );
  });

  it('accepts a valid placement silently', () => {
    expect(() => assertValidPlacement('BRANCH', 'UNIT')).not.toThrow();
  });
});

describe('childPath', () => {
  it('places a root node as /<id>/', () => {
    expect(childPath(null, 'council-1')).toBe('/council-1/');
  });

  it('appends beneath a parent, keeping both separators', () => {
    expect(childPath('/council-1/', 'zone-2')).toBe('/council-1/zone-2/');
    expect(childPath('/council-1/zone-2/', 'branch-3')).toBe(
      '/council-1/zone-2/branch-3/',
    );
  });

  it('refuses an id containing the separator, which would forge ancestry', () => {
    expect(() => childPath('/council-1/', 'a/b')).toThrow(
      InvalidOrganisationPathError,
    );
    expect(() => childPath('/council-1/', '')).toThrow(
      InvalidOrganisationPathError,
    );
  });

  it('refuses a malformed parent path', () => {
    expect(() => childPath('council-1', 'zone-2')).toThrow(
      InvalidOrganisationPathError,
    );
  });
});

describe('path decomposition', () => {
  it('reads the node id from the last segment', () => {
    expect(idFromPath('/council-1/zone-2/')).toBe('zone-2');
    expect(idFromPath('/council-1/')).toBe('council-1');
  });

  it('has no id at the root', () => {
    expect(() => idFromPath('/')).toThrow(InvalidOrganisationPathError);
  });

  it('reads the parent path, terminating at the root', () => {
    expect(parentPathOf('/c/z/b/')).toBe('/c/z/');
    expect(parentPathOf('/c/z/')).toBe('/c/');
    expect(parentPathOf('/c/')).toBeNull();
  });

  it('round-trips against childPath', () => {
    const path = childPath('/c/z/', 'b');
    expect(parentPathOf(path)).toBe('/c/z/');
    expect(idFromPath(path)).toBe('b');
  });
});

describe('move legality', () => {
  it('permits a move to an unrelated parent', () => {
    expect(isMoveAcyclic('/c/z1/b1/', '/c/z2/')).toBe(true);
  });

  it('permits a move to the root', () => {
    expect(isMoveAcyclic('/c/', null)).toBe(true);
  });

  it('refuses a move onto itself', () => {
    expect(isMoveAcyclic('/c/z1/', '/c/z1/')).toBe(false);
  });

  it('refuses a move into its own descendant', () => {
    // Would detach the subtree from every root: each node's prefix would name a
    // node inside the same subtree.
    expect(isMoveAcyclic('/c/z1/', '/c/z1/b1/')).toBe(false);
    expect(isMoveAcyclic('/c/', '/c/z1/b1/u1/')).toBe(false);
  });

  it('permits a move beneath a sibling whose id shares a prefix', () => {
    // The trailing separator is what keeps /c/z1/ from appearing to contain
    // /c/z10/. Without it this move would be wrongly refused.
    expect(isMoveAcyclic('/c/z1/', '/c/z10/')).toBe(true);
  });

  it('throws with an explanation', () => {
    expect(() => assertMoveIsAcyclic('/c/z1/', '/c/z1/b1/')).toThrow(
      InvalidHierarchyError,
    );
    expect(() => assertMoveIsAcyclic('/c/z1/', '/c/z2/')).not.toThrow();
  });
});

describe('rewriteDescendantPath', () => {
  it('swaps the ancestor prefix and preserves the subtree shape', () => {
    expect(
      rewriteDescendantPath('/c/z1/b1/', '/c/z2/b1/', '/c/z1/b1/u1/'),
    ).toBe('/c/z2/b1/u1/');
  });

  it('rewrites the moved node itself', () => {
    expect(rewriteDescendantPath('/c/z1/b1/', '/c/z2/b1/', '/c/z1/b1/')).toBe(
      '/c/z2/b1/',
    );
  });

  it('preserves depth below the moved node', () => {
    const deep = '/c/z1/b1/u1/';
    const rewritten = rewriteDescendantPath('/c/z1/', '/c2/z1/', deep);
    expect(rewritten).toBe('/c2/z1/b1/u1/');
    expect(rewritten.split('/').filter(Boolean)).toHaveLength(4);
  });

  it('refuses to rewrite a path outside the moved subtree', () => {
    // Guards against a rewrite query whose predicate is wider than the subtree.
    expect(() =>
      rewriteDescendantPath('/c/z1/', '/c/z2/', '/c/z3/b1/'),
    ).toThrow(InvalidHierarchyError);
  });

  it('refuses a sibling whose id shares a prefix with the moved node', () => {
    expect(() =>
      rewriteDescendantPath('/c/z1/', '/c/z2/', '/c/z10/b1/'),
    ).toThrow(InvalidHierarchyError);
  });
});

describe('outermostScopes', () => {
  it('drops a scope already covered by an ancestor scope', () => {
    expect(outermostScopes(['/c/', '/c/z1/', '/c/z1/b1/'])).toEqual(['/c/']);
  });

  it('keeps unrelated scopes', () => {
    expect(outermostScopes(['/c/z1/', '/c/z2/'])).toEqual(['/c/z1/', '/c/z2/']);
  });

  it('collapses duplicates without dropping the scope entirely', () => {
    // Two identical scopes each "contain" the other; a naive filter returns [].
    expect(outermostScopes(['/c/z1/', '/c/z1/'])).toEqual(['/c/z1/']);
  });

  it('reduces to the root when the root is held', () => {
    expect(outermostScopes(['/c/z1/', '/'])).toEqual(['/']);
  });

  it('returns nothing for no scopes', () => {
    expect(outermostScopes([])).toEqual([]);
  });
});
