import { describe, it, expect } from "vitest";
import { ParseError, describeError } from "../../src/core/errors.js";

describe("describeError", () => {
  it("已知错误码返回友好的三段文案", () => {
    const d = describeError("NET_FAILED");
    expect(d.title).toBe("无法连接到服务器");
    expect(d.reason).toBeTruthy();
    expect(d.suggestion).toBeTruthy();
  });

  it("未知错误码回退到 UNKNOWN 文案", () => {
    const d = describeError("SOMETHING_WEIRD");
    expect(d.title).toBe("出了点意外,请求没成功");
  });

  it("ParseError 携带 code", () => {
    const e = new ParseError("PARSE_NO_URL", "no url");
    expect(e.code).toBe("PARSE_NO_URL");
    expect(e.name).toBe("ParseError");
  });
});
