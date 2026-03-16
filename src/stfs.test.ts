import { describe, expect, it } from 'vitest';
import { StfsPackage } from './stfs';

describe('StfsPackage.calculateTopLevel', () => {
  it('returns level 0 for small block counts', () => {
    expect(StfsPackage.calculateTopLevel(0)).toBe(0);
    expect(StfsPackage.calculateTopLevel(0xaa)).toBe(0);
  });

  it('returns level 1 for medium block counts', () => {
    expect(StfsPackage.calculateTopLevel(0xab)).toBe(1);
    expect(StfsPackage.calculateTopLevel(0x70e4)).toBe(1);
  });

  it('returns level 2 for large block counts', () => {
    expect(StfsPackage.calculateTopLevel(0x70e5)).toBe(2);
    expect(StfsPackage.calculateTopLevel(0x4af768)).toBe(2);
  });

  it('throws for invalid/unsupported counts', () => {
    expect(() => StfsPackage.calculateTopLevel(0x4af769)).toThrow('Invalid STFS alloc block count');
  });
});
