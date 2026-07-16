import { describe, it, expect } from 'vitest';
import { derivePatterns } from './idPatterns';

describe('derivePatterns', () => {
  it('returns empty array for empty input', () => {
    expect(derivePatterns([])).toEqual([]);
  });

  it('keeps a bare adapter name with no dots as-is', () => {
    expect(derivePatterns(['adaptername'])).toEqual(['adaptername']);
  });

  it('turns adapter.instance into adapter.instance.*', () => {
    expect(derivePatterns(['hm-rpc.0'])).toEqual(['hm-rpc.0.*']);
  });

  it('collapses deep IDs to the adapter.instance.* subtree', () => {
    expect(derivePatterns(['hm-rpc.0.MEQ123.1.STATE'])).toEqual(['hm-rpc.0.*']);
  });

  it('dedupes multiple IDs from the same namespace', () => {
    expect(derivePatterns(['hm-rpc.0.a.b', 'hm-rpc.0.c.d'])).toEqual(['hm-rpc.0.*']);
  });

  it('returns one pattern per distinct namespace, sorted', () => {
    expect(derivePatterns(['javascript.0.foo', 'hm-rpc.0.bar', 'alias.0.baz'])).toEqual([
      'alias.0.*',
      'hm-rpc.0.*',
      'javascript.0.*',
    ]);
  });
});
