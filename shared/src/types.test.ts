import { describe, it, expect } from 'vitest';
import {
  coordinateToKey,
  keyToCoordinate,
  paintedCellsToSerialized,
  paintedCellsFromSerialized,
} from './types.js';

describe('coordinateToKey', () => {
  it('converts coordinate to string key', () => {
    expect(coordinateToKey({ x: 0, y: 0 })).toBe('0,0');
    expect(coordinateToKey({ x: 5, y: 10 })).toBe('5,10');
    expect(coordinateToKey({ x: 99, y: 99 })).toBe('99,99');
  });

  it('handles negative coordinates', () => {
    // Negative coords shouldn't happen in valid game state, but function should handle them
    expect(coordinateToKey({ x: -1, y: 0 })).toBe('-1,0');
    expect(coordinateToKey({ x: 0, y: -1 })).toBe('0,-1');
  });
});

describe('keyToCoordinate', () => {
  it('converts string key to coordinate', () => {
    expect(keyToCoordinate('0,0')).toEqual({ x: 0, y: 0 });
    expect(keyToCoordinate('5,10')).toEqual({ x: 5, y: 10 });
    expect(keyToCoordinate('99,99')).toEqual({ x: 99, y: 99 });
  });

  it('handles negative coordinates', () => {
    expect(keyToCoordinate('-1,0')).toEqual({ x: -1, y: 0 });
    expect(keyToCoordinate('0,-1')).toEqual({ x: 0, y: -1 });
  });

  it('throws for malformed key (no comma)', () => {
    expect(() => keyToCoordinate('00')).toThrow('Invalid coordinate key');
  });

  it('throws for malformed key (extra commas)', () => {
    expect(() => keyToCoordinate('0,0,0')).toThrow('Invalid coordinate key');
  });

  it('throws for non-numeric values', () => {
    expect(() => keyToCoordinate('a,b')).toThrow('Invalid coordinate key');
    expect(() => keyToCoordinate('0,b')).toThrow('Invalid coordinate key');
    expect(() => keyToCoordinate('a,0')).toThrow('Invalid coordinate key');
  });

  it('throws for empty string', () => {
    expect(() => keyToCoordinate('')).toThrow('Invalid coordinate key');
  });

  it('throws for floating point values', () => {
    expect(() => keyToCoordinate('1.5,2.5')).toThrow('Invalid coordinate key');
  });
});

describe('paintedCellsToSerialized', () => {
  it('converts empty set to empty array', () => {
    const set = new Set<string>();
    const result = paintedCellsToSerialized(set);
    expect(result).toEqual([]);
  });

  it('converts single cell', () => {
    const set = new Set(['0,0']);
    const result = paintedCellsToSerialized(set);
    expect(result).toEqual([[0, 0]]);
  });

  it('sorts by y first, then by x', () => {
    const set = new Set(['2,1', '0,0', '1,0', '0,1', '1,1', '2,0']);
    const result = paintedCellsToSerialized(set);
    expect(result).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
      [0, 1],
      [1, 1],
      [2, 1],
    ]);
  });

  it('handles larger coordinates', () => {
    const set = new Set(['50,100', '25,50']);
    const result = paintedCellsToSerialized(set);
    expect(result).toEqual([
      [25, 50],
      [50, 100],
    ]);
  });
});

describe('paintedCellsFromSerialized', () => {
  it('converts empty array to empty set', () => {
    const result = paintedCellsFromSerialized([]);
    expect(result.size).toBe(0);
  });

  it('converts single tuple', () => {
    const result = paintedCellsFromSerialized([[0, 0]]);
    expect(result.size).toBe(1);
    expect(result.has('0,0')).toBe(true);
  });

  it('converts multiple tuples', () => {
    const result = paintedCellsFromSerialized([
      [0, 0],
      [1, 0],
      [0, 1],
    ]);
    expect(result.size).toBe(3);
    expect(result.has('0,0')).toBe(true);
    expect(result.has('1,0')).toBe(true);
    expect(result.has('0,1')).toBe(true);
  });
});

describe('serialization round-trip', () => {
  it('preserves cells through round-trip', () => {
    const original = new Set(['0,0', '1,1', '2,2', '5,10', '10,5']);
    const serialized = paintedCellsToSerialized(original);
    const restored = paintedCellsFromSerialized(serialized);

    expect(restored.size).toBe(original.size);
    for (const key of original) {
      expect(restored.has(key)).toBe(true);
    }
  });

  it('round-trip with empty set', () => {
    const original = new Set<string>();
    const serialized = paintedCellsToSerialized(original);
    const restored = paintedCellsFromSerialized(serialized);

    expect(restored.size).toBe(0);
  });

  it('round-trip with all cells in small maze', () => {
    const original = new Set<string>();
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        original.add(`${x},${y}`);
      }
    }

    const serialized = paintedCellsToSerialized(original);
    const restored = paintedCellsFromSerialized(serialized);

    expect(restored.size).toBe(25);
    for (const key of original) {
      expect(restored.has(key)).toBe(true);
    }
  });

  it('serialization is deterministic', () => {
    const set = new Set(['5,5', '0,0', '3,2', '2,3', '1,1']);

    const result1 = paintedCellsToSerialized(set);
    const result2 = paintedCellsToSerialized(set);

    expect(result1).toEqual(result2);
  });
});
