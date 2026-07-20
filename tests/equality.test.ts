import { describe, expect, it } from "vitest";
import { deepEqual } from "../src/core/equality";

describe("deepEqual", () => {
  it("primitives", () => {
    expect(deepEqual(1, 1)).toBe(true);
    expect(deepEqual("a", "a")).toBe(true);
    expect(deepEqual(1, 2)).toBe(false);
    expect(deepEqual(1, "1")).toBe(false);
    expect(deepEqual(null, null)).toBe(true);
    expect(deepEqual(undefined, undefined)).toBe(true);
    expect(deepEqual(null, undefined)).toBe(false);
    expect(deepEqual(Number.NaN, Number.NaN)).toBe(true);
    expect(deepEqual(0, -0)).toBe(true);
  });

  it("objects and arrays", () => {
    expect(deepEqual({ a: 1, b: [1, 2] }, { a: 1, b: [1, 2] })).toBe(true);
    expect(deepEqual({ a: 1 }, { a: 1, b: undefined })).toBe(false);
    expect(deepEqual([1, [2, 3]], [1, [2, 3]])).toBe(true);
    expect(deepEqual([1, 2], [2, 1])).toBe(false);
    expect(deepEqual([], {})).toBe(false);
    expect(deepEqual({ a: { b: { c: 1 } } }, { a: { b: { c: 2 } } })).toBe(false);
  });

  it("dates", () => {
    expect(deepEqual(new Date(100), new Date(100))).toBe(true);
    expect(deepEqual(new Date(100), new Date(200))).toBe(false);
    expect(deepEqual(new Date(100), {})).toBe(false);
  });

  it("nested undefined vs missing key", () => {
    expect(deepEqual({ a: undefined }, {})).toBe(false);
    expect(deepEqual({ a: undefined }, { a: undefined })).toBe(true);
  });
});
