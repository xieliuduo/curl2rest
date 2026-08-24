import { describe, it, expect } from "vitest";
import { parseHttp, toHttp } from "../../src/core/format.js";
import { ParseError } from "../../src/core/errors.js";

describe("parseHttp", () => {
  it("解析方法、URL、头部、body", () => {
    const text = [
      "POST https://example.com/comments HTTP/1.1",
      "content-type: application/json",
      "",
      '{"name":"sample"}',
    ].join("\n");
    const r = parseHttp(text);
    expect(r.method).toBe("POST");
    expect(r.url).toBe("https://example.com/comments");
    expect(r.headers["content-type"]).toBe("application/json");
    expect(r.body).toBe('{"name":"sample"}');
  });

  it("无 body 时 body 为 null", () => {
    const r = parseHttp("GET https://example.com/a HTTP/1.1");
    expect(r.method).toBe("GET");
    expect(r.body).toBeNull();
  });

  it("省略方法时默认 GET", () => {
    const r = parseHttp("https://example.com/a");
    expect(r.method).toBe("GET");
    expect(r.url).toBe("https://example.com/a");
  });

  it("首行缺少 URL 抛 PARSE_NO_URL", () => {
    expect(() => parseHttp("POST")).toThrow(ParseError);
    try { parseHttp("POST"); } catch (e) { expect(e.code).toBe("PARSE_NO_URL"); }
  });
});

describe("toHttp", () => {
  it("从 RequestObject 生成 HTTP 报文", () => {
    const out = toHttp({
      method: "POST",
      url: "https://example.com/c",
      headers: { "content-type": "application/json" },
      body: '{"a":1}',
    });
    expect(out).toBe(
      'POST https://example.com/c HTTP/1.1\ncontent-type: application/json\n\n{"a":1}'
    );
  });

  it("无 body 不产生空行", () => {
    const out = toHttp({ method: "GET", url: "https://x.com", headers: {}, body: null });
    expect(out).toBe("GET https://x.com HTTP/1.1");
  });
});
