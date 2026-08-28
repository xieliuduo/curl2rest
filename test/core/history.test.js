import { describe, it, expect } from "vitest";
import {
  addEntry, requestFingerprint, normalizeHistory, createEntry, updateEntry, removeEntry,
} from "../../src/core/history.js";

describe("addEntry", () => {
  it("新条目插到最前", () => {
    const list = addEntry([], { url: "a" }, 50);
    expect(list[0].url).toBe("a");
  });
  it("默认最多保留 30 条", () => {
    let list = [];
    for (let i = 0; i < 60; i++) list = addEntry(list, { url: String(i) });
    expect(list.length).toBe(30);
    expect(list[0].url).toBe("59"); // 最新在前
  });
  it("相同请求内容只保留最新一条", () => {
    const old = {
      id: "old", at: 1, name: "旧名称",
      method: "POST", url: "https://x.com",
      headers: { "content-type": "application/json" },
      body: '{"a":1}',
    };
    const latest = { ...old, id: "latest", at: 2, name: "新名称" };
    const out = addEntry([old], latest);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("latest");
    expect(out[0].name).toBe("新名称");
  });
});

describe("requestFingerprint", () => {
  it("忽略 header 大小写、顺序和 JSON 缩进差异", () => {
    const a = {
      method: "post", url: "https://x.com",
      headers: { Authorization: "token", "Content-Type": "application/json" },
      body: '{"user":{"id":1}}',
    };
    const b = {
      method: "POST", url: "https://x.com",
      headers: { "content-type": "application/json", authorization: "token" },
      body: '{\n  "user": {\n    "id": 1\n  }\n}',
    };
    expect(requestFingerprint(a)).toBe(requestFingerprint(b));
  });

  it("URL 或请求体不同不会去重", () => {
    const base = { method: "POST", url: "https://x.com", headers: {}, body: '{"a":1}' };
    expect(requestFingerprint(base)).not.toBe(
      requestFingerprint({ ...base, body: '{"a":2}' })
    );
    expect(requestFingerprint(base)).not.toBe(
      requestFingerprint({ ...base, url: "https://y.com" })
    );
  });
});

describe("normalizeHistory", () => {
  it("已有历史也按最新优先去重并限制为 30 条", () => {
    const list = Array.from({ length: 35 }, (_, i) => ({
      id: String(i),
      method: "GET",
      url: `https://x.com/${i}`,
      headers: {},
      body: null,
    }));
    list.splice(1, 0, { ...list[0], id: "duplicate-old" });
    const out = normalizeHistory(list);
    expect(out).toHaveLength(30);
    expect(out[0].id).toBe("0");
    expect(out.some((item) => item.id === "duplicate-old")).toBe(false);
  });
});

describe("createEntry", () => {
  const req = { method: "GET", url: "https://x.com", headers: {}, body: null };

  it("无请求库关联时使用 METHOD URL 作为名称", () => {
    const entry = createEntry(req, {}, 123);
    expect(entry.name).toBe("GET https://x.com");
    expect(entry.at).toBe(123);
  });

  it("有关联时使用请求库名称并保留路径与引用", () => {
    const collectionRef = { pid: "p1", mid: "m1", rid: "r1" };
    const entry = createEntry(req, {
      name: "查询用户",
      collectionPath: "用户中心 / 用户查询",
      collectionRef,
    }, 123);
    expect(entry.name).toBe("查询用户");
    expect(entry.collectionPath).toBe("用户中心 / 用户查询");
    expect(entry.collectionRef).toEqual(collectionRef);
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
