import { describe, it, expect } from 'vitest';
import { isValidUuid } from '../../src/utils/uuid';

describe('isValidUuid', () => {
  it('accepts valid UUIDs', () => {
    expect(isValidUuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    expect(isValidUuid('550E8400-E29B-41D4-A716-446655440000')).toBe(true); // uppercase
  });

  it('rejects invalid UUIDs', () => {
    expect(isValidUuid('550e8400-e29b-41d4-a716')).toBe(false); // too short
    expect(isValidUuid('not-a-uuid')).toBe(false);
    expect(isValidUuid(123)).toBe(false); // not a string
    expect(isValidUuid(null)).toBe(false);
    expect(isValidUuid(undefined)).toBe(false);
  });

  it('rejects malformed UUIDs', () => {
    expect(isValidUuid('550e8400-e29b-41d4-a716-44665544000g')).toBe(false); // invalid char
    expect(isValidUuid('550e8400 e29b-41d4-a716-446655440000')).toBe(false); // space
  });
});
