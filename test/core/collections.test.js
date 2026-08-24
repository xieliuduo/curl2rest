import { describe, it, expect } from "vitest";
import {
  emptyState, addProject, renameProject, removeProject,
  addModule, renameModule, removeModule,
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
