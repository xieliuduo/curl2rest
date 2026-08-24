import { describe, it, expect } from "vitest";
import { addEntry, updateEntry, removeEntry } from "../../src/core/history.js";

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

describe("updateEntry", () => {
  const list = [
    { id: "1", url: "a", name: "旧名", note: "" },
    { id: "2", url: "b", name: "b", note: "" },
  ];
  it("按 id 更新指定字段(改名/备注)", () => {
    const out = updateEntry(list, "1", { name: "新名", note: "备注内容" });
    expect(out[0].name).toBe("新名");
    expect(out[0].note).toBe("备注内容");
    expect(out[1]).toEqual(list[1]); // 其他条目不变
  });
  it("id 不存在时原样返回", () => {
    expect(updateEntry(list, "999", { name: "x" })).toEqual(list);
  });
  it("不修改原数组(纯函数)", () => {
    updateEntry(list, "1", { name: "z" });
    expect(list[0].name).toBe("旧名");
  });
});

describe("removeEntry", () => {
  it("按 id 删除条目", () => {
    const list = [{ id: "1" }, { id: "2" }];
    const out = removeEntry(list, "1");
    expect(out).toEqual([{ id: "2" }]);
  });
});
