import { describe, it, expect } from "vitest";
import { emptyState } from "../../src/core/collections.js";

describe("emptyState", () => {
  it("初始为空:projects 为空数组", () => {
    const s = emptyState();
    expect(s).toEqual({ projects: [] });
  });
  it("每次返回全新对象(不共享引用)", () => {
    expect(emptyState()).not.toBe(emptyState());
  });
});
