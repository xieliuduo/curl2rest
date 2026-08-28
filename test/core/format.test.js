import { describe, it, expect } from "vitest";
import {
  parseHttp, toHttp, formatJsonBody, toReadableHttp,
  parseCurl, toCurl, detectFormat, parseRequest,
} from "../../src/core/format.js";
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

describe("formatJsonBody / toReadableHttp", () => {
  it("对象和数组按 2 空格缩进并换行", () => {
    expect(formatJsonBody('{"user":{"id":1,"roles":["admin","editor"]}}')).toBe([
      "{",
      '  "user": {',
      '    "id": 1,',
      '    "roles": [',
      '      "admin",',
      '      "editor"',
      "    ]",
      "  }",
      "}",
    ].join("\n"));
  });

  it("非 JSON 请求体保持原样", () => {
    const body = "name=sample&enabled=true";
    expect(formatJsonBody(body)).toBe(body);
  });

  it("保留字符串中的标点和大整数原始写法", () => {
    const body = '{"text":"a,b:{c}","id":900719925474099312345}';
    const out = formatJsonBody(body);
    expect(out).toContain('"text": "a,b:{c}"');
    expect(out).toContain('"id": 900719925474099312345');
  });

  it("生成适合编辑器阅读的 HTTP 文本", () => {
    const out = toReadableHttp({
      method: "POST",
      url: "https://example.com/c",
      headers: { "content-type": "application/json" },
      body: '{"a":1,"b":[2,3]}',
    });
    expect(out).toContain('\n\n{\n  "a": 1,\n  "b": [\n    2,\n    3\n  ]\n}');
  });
});

describe("detectFormat", () => {
  it("以 curl 开头识别为 curl", () => {
    expect(detectFormat("curl https://x.com")).toBe("curl");
    expect(detectFormat("  CURL -X GET https://x.com")).toBe("curl");
  });
  it("其他识别为 http", () => {
    expect(detectFormat("GET https://x.com HTTP/1.1")).toBe("http");
  });
});

describe("parseCurl", () => {
  it("解析基础 GET", () => {
    const r = parseCurl("curl https://example.com/a");
    expect(r.method).toBe("GET");
    expect(r.url).toBe("https://example.com/a");
    expect(r.body).toBeNull();
  });

  it("解析 -X、多个 -H、-d(有 body 默认为 POST)", () => {
    const cmd = `curl -X POST https://example.com/c \\
      -H "content-type: application/json" \\
      -H "authorization: Bearer t" \\
      -d '{"a":1}'`;
    const r = parseCurl(cmd);
    expect(r.method).toBe("POST");
    expect(r.url).toBe("https://example.com/c");
    expect(r.headers["content-type"]).toBe("application/json");
    expect(r.headers["authorization"]).toBe("Bearer t");
    expect(r.body).toBe('{"a":1}');
  });

  it("有 -d 但未指定 -X 时方法默认 POST", () => {
    const r = parseCurl(`curl https://x.com -d 'hi'`);
    expect(r.method).toBe("POST");
    expect(r.body).toBe("hi");
  });

  it("缺少 URL 抛 PARSE_CURL_NO_URL", () => {
    try { parseCurl("curl -X GET"); } catch (e) { expect(e.code).toBe("PARSE_CURL_NO_URL"); }
  });
});

describe("toCurl", () => {
  it("生成带 -X、-H、-d 的 curl", () => {
    const out = toCurl({
      method: "POST",
      url: "https://example.com/c",
      headers: { "content-type": "application/json" },
      body: '{"a":1}',
    });
    expect(out).toContain("curl -X POST 'https://example.com/c'");
    expect(out).toContain("-H 'content-type: application/json'");
    expect(out).toContain(`-d '{"a":1}'`);
  });
});

describe("parseRequest 往返一致", () => {
  const obj = {
    method: "POST", url: "https://example.com/c",
    headers: { "content-type": "application/json" }, body: '{"a":1}',
  };
  it("http 往返", () => {
    expect(parseRequest(toHttp(obj))).toEqual(obj);
  });
  it("curl 往返", () => {
    expect(parseRequest(toCurl(obj))).toEqual(obj);
  });
});
