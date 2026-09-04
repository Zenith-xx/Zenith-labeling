import { describe, expect, it } from 'vitest';
import { clampImageRange } from './imageScope';

describe('clampImageRange', () => {
  it('clamps to list bounds', () => {
    expect(clampImageRange(1, 10, 100)).toEqual({ start: 1, end: 10 });
    expect(clampImageRange(0, 200, 50)).toEqual({ start: 1, end: 50 });
    expect(clampImageRange(60, 40, 50)).toEqual({ start: 40, end: 50 });
  });
});
