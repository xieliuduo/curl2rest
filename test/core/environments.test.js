import { describe, it, expect } from "vitest";
import {
  emptyState, addEnv, removeEnv, setVar, removeVar, setCurrent, currentVars,
} from "../../src/core/environments.js";

describe("emptyState", () => {
  it("初始为空:无环境、current 为空", () => {
    const s = emptyState();
    expect(s.current).toBe("");
    expect(s.envs).toEqual({});
  });
});

describe("addEnv", () => {
  it("新增环境;首个环境自动设为 current", () => {
    const s = addEnv(emptyState(), "dev");
    expect(s.envs.dev).toEqual({});
    expect(s.current).toBe("dev");
  });
  it("再加一个不改变 current", () => {
    let s = addEnv(emptyState(), "dev");
    s = addEnv(s, "prod");
    expect(Object.keys(s.envs)).toEqual(["dev", "prod"]);
    expect(s.current).toBe("dev");
  });
  it("同名环境不覆盖已有变量", () => {
    let s = addEnv(emptyState(), "dev");
    s = setVar(s, "dev", "host", "h");
    s = addEnv(s, "dev");
    expect(s.envs.dev.host).toBe("h");
  });
});

describe("removeEnv", () => {
  it("删除环境", () => {
    let s = addEnv(addEnv(emptyState(), "dev"), "prod");
    s = removeEnv(s, "prod");
    expect(Object.keys(s.envs)).toEqual(["dev"]);
  });
  it("删除当前环境时 current 转到剩余第一个", () => {
    let s = addEnv(addEnv(emptyState(), "dev"), "prod");
    s = removeEnv(s, "dev"); // 删的是 current
    expect(s.current).toBe("prod");
  });
  it("删光后 current 为空", () => {
    let s = addEnv(emptyState(), "dev");
    s = removeEnv(s, "dev");
    expect(s.current).toBe("");
    expect(s.envs).toEqual({});
  });
});

describe("setVar / removeVar", () => {
  it("设置变量键值", () => {
    let s = addEnv(emptyState(), "dev");
    s = setVar(s, "dev", "host", "https://x.com");
    expect(s.envs.dev.host).toBe("https://x.com");
  });
  it("删除变量键", () => {
    let s = setVar(addEnv(emptyState(), "dev"), "dev", "host", "h");
    s = removeVar(s, "dev", "host");
    expect(s.envs.dev.host).toBeUndefined();
  });
  it("不修改原状态(纯函数)", () => {
    const s0 = addEnv(emptyState(), "dev");
    setVar(s0, "dev", "host", "h");
    expect(s0.envs.dev.host).toBeUndefined();
  });
});

describe("setCurrent", () => {
  it("切换当前环境", () => {
    let s = addEnv(addEnv(emptyState(), "dev"), "prod");
    s = setCurrent(s, "prod");
    expect(s.current).toBe("prod");
  });
  it("切到不存在的环境时忽略", () => {
    let s = addEnv(emptyState(), "dev");
    s = setCurrent(s, "nope");
    expect(s.current).toBe("dev");
  });
});

describe("currentVars", () => {
  it("返回当前环境的变量 map", () => {
    let s = setVar(addEnv(emptyState(), "dev"), "dev", "host", "h");
    expect(currentVars(s)).toEqual({ host: "h" });
  });
  it("无当前环境时返回空对象", () => {
    expect(currentVars(emptyState())).toEqual({});
  });
});
