import { describe, it, expect } from "vitest";
import { addEntry } from "../../src/core/history.js";

describe("addEntry", () => {
  it("新条目插到最前", () => {
    const list = addEntry([], { url: "a" }, 50);
    expect(list[0].url).toBe("a");
  });
  it("超过上限时截断旧条目", () => {
    let list = [];
    for (let i = 0; i < 60; i++) list = addEntry(list, { url: String(i) }, 50);
    expect(list.length).toBe(50);
    expect(list[0].url).toBe("59"); // 最新在前
  });
});
