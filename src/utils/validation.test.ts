import { describe, it, expect } from 'vitest';
import { validateNumberRange } from './validation';

describe('validateNumberRange', () => {
  it('returns null when no bounds are set', () => {
    expect(validateNumberRange(42, undefined, undefined)).toBeNull();
  });

  it('accepts values within bounds (inclusive)', () => {
    expect(validateNumberRange(0, 0, 100)).toBeNull();
    expect(validateNumberRange(100, 0, 100)).toBeNull();
    expect(validateNumberRange(50, 0, 100)).toBeNull();
  });

  it('rejects values below min', () => {
    expect(validateNumberRange(-1, 0, 100)).toBe('Value must be ≥ 0');
  });

  it('rejects values above max', () => {
    expect(validateNumberRange(101, 0, 100)).toBe('Value must be ≤ 100');
  });

  it('validates with only min set', () => {
    expect(validateNumberRange(5, 10, undefined)).toBe('Value must be ≥ 10');
    expect(validateNumberRange(15, 10, undefined)).toBeNull();
  });

  it('validates with only max set', () => {
    expect(validateNumberRange(15, undefined, 10)).toBe('Value must be ≤ 10');
    expect(validateNumberRange(5, undefined, 10)).toBeNull();
  });

  it('ignores non-finite bounds', () => {
    expect(validateNumberRange(5, NaN, Infinity)).toBeNull();
  });

  it('returns German messages when language is de', () => {
    expect(validateNumberRange(-1, 0, 100, 'de')).toBe('Wert muss ≥ 0 sein');
    expect(validateNumberRange(101, 0, 100, 'de')).toBe('Wert muss ≤ 100 sein');
  });
});
