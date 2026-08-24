import { describe, it, expect } from "vitest";
import {
  emptyState, addProject, renameProject, removeProject,
  addModule, renameModule, removeModule,
  addRequest, renameRequest, updateRequestNote, removeRequest, moveRequest,
  reorderProject, reorderModule, reorderRequest,
  exportState, importState,
} from "../../src/core/collections.js";

describe("emptyState", () => {
  it("初始为空:projects 为空数组", () => {
    const s = emptyState();
    expect(s).toEqual({ projects: [] });
  });
  it("每次返回全新对象(不共享引用)", () => {
    expect(emptyState()).not.toBe(emptyState());
  });
});

describe("addProject", () => {
  it("新增项目,带 id、空 modules", () => {
    const s = addProject(emptyState(), "电商后台");
    expect(s.projects).toHaveLength(1);
    expect(s.projects[0].name).toBe("电商后台");
    expect(s.projects[0].modules).toEqual([]);
    expect(typeof s.projects[0].id).toBe("string");
  });
  it("空名忽略", () => {
    const s = addProject(emptyState(), "  ");
    expect(s.projects).toHaveLength(0);
  });
  it("不修改原状态(纯函数)", () => {
    const s0 = emptyState();
    addProject(s0, "x");
    expect(s0.projects).toHaveLength(0);
  });
});

describe("renameProject", () => {
  it("按 id 改名", () => {
    let s = addProject(emptyState(), "旧名");
    const pid = s.projects[0].id;
    s = renameProject(s, pid, "新名");
    expect(s.projects[0].name).toBe("新名");
  });
  it("id 不存在时原样返回", () => {
    const s = addProject(emptyState(), "a");
    expect(renameProject(s, "nope", "x")).toEqual(s);
  });
});

describe("removeProject", () => {
  it("按 id 删除项目", () => {
    let s = addProject(addProject(emptyState(), "a"), "b");
    const pid = s.projects[0].id;
    s = removeProject(s, pid);
    expect(s.projects.map((p) => p.name)).toEqual(["b"]);
  });
});

describe("addModule", () => {
  it("在指定项目下新增模块", () => {
    let s = addProject(emptyState(), "p");
    const pid = s.projects[0].id;
    s = addModule(s, pid, "订单");
    expect(s.projects[0].modules).toHaveLength(1);
    expect(s.projects[0].modules[0].name).toBe("订单");
    expect(s.projects[0].modules[0].requests).toEqual([]);
  });
  it("项目不存在时原样返回", () => {
    const s = addProject(emptyState(), "p");
    expect(addModule(s, "nope", "m")).toEqual(s);
  });
  it("空名忽略", () => {
    let s = addProject(emptyState(), "p");
    const pid = s.projects[0].id;
    s = addModule(s, pid, "  ");
    expect(s.projects[0].modules).toHaveLength(0);
  });
});

describe("renameModule", () => {
  it("按 id 给模块改名", () => {
    let s = addProject(emptyState(), "p");
    const pid = s.projects[0].id;
    s = addModule(s, pid, "旧");
    const mid = s.projects[0].modules[0].id;
    s = renameModule(s, pid, mid, "新");
    expect(s.projects[0].modules[0].name).toBe("新");
  });
});

describe("removeModule", () => {
  it("按 id 删除模块", () => {
    let s = addProject(emptyState(), "p");
    const pid = s.projects[0].id;
    s = addModule(addModule(s, pid, "a"), pid, "b");
    const mid = s.projects[0].modules[0].id;
    s = removeModule(s, pid, mid);
    expect(s.projects[0].modules.map((m) => m.name)).toEqual(["b"]);
  });
});

// 便捷构造:返回 {state, pid, mid}
function withModule() {
  let s = addProject(emptyState(), "p");
  const pid = s.projects[0].id;
  s = addModule(s, pid, "m");
  const mid = s.projects[0].modules[0].id;
  return { s, pid, mid };
}
const REQ = { method: "GET", url: "https://x.com", headers: {}, body: "" };

describe("addRequest", () => {
  it("在模块下新增请求,补 id / 默认 name / 空 note", () => {
    const { s, pid, mid } = withModule();
    const s2 = addRequest(s, pid, mid, REQ);
    const r = s2.projects[0].modules[0].requests[0];
    expect(r.method).toBe("GET");
    expect(r.url).toBe("https://x.com");
    expect(r.name).toBe("GET https://x.com");
    expect(r.note).toBe("");
    expect(typeof r.id).toBe("string");
  });
  it("传入的 name 优先于默认名", () => {
    const { s, pid, mid } = withModule();
    const s2 = addRequest(s, pid, mid, { ...REQ, name: "查询用户" });
    expect(s2.projects[0].modules[0].requests[0].name).toBe("查询用户");
  });
  it("模块不存在时原样返回", () => {
    const { s, pid } = withModule();
    expect(addRequest(s, pid, "nope", REQ)).toEqual(s);
  });
  it("忽略传入的 id,始终生成新 id(防历史另存 id 冲突)", () => {
    const { s, pid, mid } = withModule();
    const source = { id: "history-123", at: 999, method: "GET", url: "https://x.com", headers: {}, body: "" };
    let s2 = addRequest(s, pid, mid, source);
    s2 = addRequest(s2, pid, mid, source); // 同一来源存两次
    const reqs = s2.projects[0].modules[0].requests;
    expect(reqs).toHaveLength(2);
    expect(reqs[0].id).not.toBe("history-123");
    expect(reqs[1].id).not.toBe("history-123");
    expect(reqs[0].id).not.toBe(reqs[1].id); // 两条 id 互不相同
  });
});

describe("renameRequest / updateRequestNote", () => {
  it("改名", () => {
    let { s, pid, mid } = withModule();
    s = addRequest(s, pid, mid, REQ);
    const rid = s.projects[0].modules[0].requests[0].id;
    s = renameRequest(s, pid, mid, rid, "新名");
    expect(s.projects[0].modules[0].requests[0].name).toBe("新名");
  });
  it("写备注", () => {
    let { s, pid, mid } = withModule();
    s = addRequest(s, pid, mid, REQ);
    const rid = s.projects[0].modules[0].requests[0].id;
    s = updateRequestNote(s, pid, mid, rid, "这是登录接口");
    expect(s.projects[0].modules[0].requests[0].note).toBe("这是登录接口");
  });
});

describe("removeRequest", () => {
  it("按 id 删除请求", () => {
    let { s, pid, mid } = withModule();
    s = addRequest(s, pid, mid, { ...REQ, name: "a" });
    s = addRequest(s, pid, mid, { ...REQ, name: "b" });
    const rid = s.projects[0].modules[0].requests[0].id;
    s = removeRequest(s, pid, mid, rid);
    expect(s.projects[0].modules[0].requests.map((r) => r.name)).toEqual(["b"]);
  });
});

describe("moveRequest", () => {
  it("把请求从一个模块移到另一个模块(可跨项目)", () => {
    let s = addProject(emptyState(), "p");
    const pid = s.projects[0].id;
    s = addModule(addModule(s, pid, "src"), pid, "dst");
    const srcMid = s.projects[0].modules[0].id;
    const dstMid = s.projects[0].modules[1].id;
    s = addRequest(s, pid, srcMid, { method: "GET", url: "https://a", headers: {}, body: "" });
    const rid = s.projects[0].modules[0].requests[0].id;

    s = moveRequest(s, pid, srcMid, pid, dstMid, rid);

    expect(s.projects[0].modules[0].requests).toHaveLength(0);
    expect(s.projects[0].modules[1].requests).toHaveLength(1);
    expect(s.projects[0].modules[1].requests[0].id).toBe(rid);
  });
  it("源请求不存在时原样返回", () => {
    let s = addProject(emptyState(), "p");
    const pid = s.projects[0].id;
    s = addModule(s, pid, "m");
    const mid = s.projects[0].modules[0].id;
    expect(moveRequest(s, pid, mid, pid, mid, "nope")).toEqual(s);
  });
});

describe("reorderProject", () => {
  it("下移把项目与后一个交换", () => {
    let s = addProject(addProject(emptyState(), "a"), "b");
    const pidA = s.projects[0].id;
    s = reorderProject(s, pidA, 1);
    expect(s.projects.map((p) => p.name)).toEqual(["b", "a"]);
  });
  it("首个上移越界,原样返回", () => {
    let s = addProject(addProject(emptyState(), "a"), "b");
    const pidA = s.projects[0].id;
    expect(reorderProject(s, pidA, -1)).toEqual(s);
  });
});

describe("reorderModule", () => {
  it("下移模块", () => {
    let s = addProject(emptyState(), "p");
    const pid = s.projects[0].id;
    s = addModule(addModule(s, pid, "a"), pid, "b");
    const midA = s.projects[0].modules[0].id;
    s = reorderModule(s, pid, midA, 1);
    expect(s.projects[0].modules.map((m) => m.name)).toEqual(["b", "a"]);
  });
});

describe("reorderRequest", () => {
  it("下移请求", () => {
    let s = addProject(emptyState(), "p");
    const pid = s.projects[0].id;
    s = addModule(s, pid, "m");
    const mid = s.projects[0].modules[0].id;
    s = addRequest(s, pid, mid, { method: "GET", url: "https://a", headers: {}, body: "", name: "a" });
    s = addRequest(s, pid, mid, { method: "GET", url: "https://b", headers: {}, body: "", name: "b" });
    const ridA = s.projects[0].modules[0].requests[0].id;
    s = reorderRequest(s, pid, mid, ridA, 1);
    expect(s.projects[0].modules[0].requests.map((r) => r.name)).toEqual(["b", "a"]);
  });
});

describe("exportState", () => {
  it("返回与状态等价的可序列化对象", () => {
    const s = addProject(emptyState(), "p");
    const out = exportState(s);
    expect(JSON.parse(JSON.stringify(out))).toEqual(s);
  });
});

describe("importState replace", () => {
  it("整棵替换现有数据", () => {
    const cur = addProject(emptyState(), "旧");
    const incoming = addProject(emptyState(), "新");
    const s = importState(cur, incoming, "replace");
    expect(s.projects.map((p) => p.name)).toEqual(["新"]);
  });
  it("结构非法(无 projects 数组)时原样返回", () => {
    const cur = addProject(emptyState(), "旧");
    expect(importState(cur, { foo: 1 }, "replace")).toEqual(cur);
  });
});

describe("importState merge", () => {
  it("同名项目合并模块,不同名追加项目", () => {
    let cur = addProject(emptyState(), "共享");
    const pid = cur.projects[0].id;
    cur = addModule(cur, pid, "已有模块");

    let incoming = addProject(emptyState(), "共享");
    const ipid = incoming.projects[0].id;
    incoming = addModule(incoming, ipid, "新模块");
    incoming = addProject(incoming, "独立项目");

    const s = importState(cur, incoming, "merge");
    const shared = s.projects.find((p) => p.name === "共享");
    expect(shared.modules.map((m) => m.name).sort()).toEqual(["已有模块", "新模块"]);
    expect(s.projects.map((p) => p.name)).toContain("独立项目");
  });

  it("同名项目同名模块:请求追加且不污染入参", () => {
    let cur = addProject(emptyState(), "共享");
    const pid = cur.projects[0].id;
    cur = addModule(cur, pid, "M");
    const mid = cur.projects[0].modules[0].id;
    cur = addRequest(cur, pid, mid, { method: "GET", url: "https://a", headers: {}, body: "", name: "a" });

    let incoming = addProject(emptyState(), "共享");
    const ipid = incoming.projects[0].id;
    incoming = addModule(incoming, ipid, "M");
    const imid = incoming.projects[0].modules[0].id;
    incoming = addRequest(incoming, ipid, imid, { method: "POST", url: "https://b", headers: {}, body: "", name: "b" });

    const before = JSON.stringify(cur);
    const s = importState(cur, incoming, "merge");

    // 同名模块的请求被追加
    const m = s.projects[0].modules.find((x) => x.name === "M");
    expect(m.requests.map((r) => r.name)).toEqual(["a", "b"]);
    // 入参未被污染(纯函数)
    expect(JSON.stringify(cur)).toBe(before);
  });
});
