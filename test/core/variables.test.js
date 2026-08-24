import { describe, it, expect } from "vitest";
import { substitute } from "../../src/core/variables.js";

describe("substitute", () => {
  it("替换 {{key}} 为对应值", () => {
    expect(substitute("GET {{host}}/a", { host: "https://x.com" }))
      .toBe("GET https://x.com/a");
  });
  it("多个变量与重复变量都替换", () => {
    expect(substitute("{{a}}-{{b}}-{{a}}", { a: "1", b: "2" })).toBe("1-2-1");
  });
  it("未定义的变量原样保留", () => {
    expect(substitute("{{x}}", {})).toBe("{{x}}");
  });
  it("允许键名带空格", () => {
    expect(substitute("{{ host }}", { host: "h" })).toBe("h");
  });
});
