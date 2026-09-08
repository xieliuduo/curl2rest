import { describe, it, expect } from "vitest";
import {
  stripRequestComments, parseHttp, toHttp, formatJsonBody, toReadableHttp,
  parseCurl, toCurl, detectFormat, parseRequest,
} from "../../src/core/format.js";
import { ParseError } from "../../src/core/errors.js";

describe("stripRequestComments", () => {
  it("移除可缩进的 # 单行注释", () => {
    expect(stripRequestComments([
      "# 请求说明",
      "  # 第二行说明",
      "GET https://example.com/a#detail HTTP/1.1",
    ].join("\n"))).toBe("GET https://example.com/a#detail HTTP/1.1");
  });

  it("移除独占行和行内的多行注释", () => {
    expect(stripRequestComments([
      "/*",
      " * 查询用户",
      " */",
      "GET /* method 与 URL 之间 */ https://example.com/users HTTP/1.1",
    ].join("\n"))).toBe("GET   https://example.com/users HTTP/1.1");
  });

  it("保留单双引号内的注释符号", () => {
    const text = [
      "POST https://example.com HTTP/1.1",
      "",
      `{"hash":"#keep","block":"/* keep */","single":"it's # ok"}`,
    ].join("\n");
    expect(stripRequestComments(text)).toBe(text);
  });

  it("不把 HTTP Accept 通配符误判为多行注释", () => {
    const text = [
      "GET https://example.com/users HTTP/1.1",
      "accept: application/json, text/plain, */*",
      "authorization: Bearer secret",
    ].join("\n");
    expect(stripRequestComments(text)).toBe(text);
  });
});

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

  it("允许使用环境变量模板作为 URL", () => {
    expect(parseHttp("GET {{host}}/users HTTP/1.1")).toEqual({
      method: "GET",
      url: "{{host}}/users",
      headers: {},
      body: null,
    });
  });

  it("发送前过滤首行、请求头和 JSON 请求体中的注释", () => {
    const request = parseHttp([
      "# 创建用户",
      "POST https://example.com/users HTTP/1.1",
      "/* 请求头 */",
      "content-type: application/json",
      "",
      "{",
      "  # 用户名",
      '  "name": "neo",',
      "  /* 是否启用 */",
      '  "enabled": true',
      "}",
    ].join("\n"));
    expect(request).toEqual({
      method: "POST",
      url: "https://example.com/users",
      headers: { "content-type": "application/json" },
      body: '{\n  "name": "neo",\n  "enabled": true\n}',
    });
  });

  it("保留 Accept 通配符后面的认证头和请求体", () => {
    const request = parseHttp([
      "POST https://example.com/users HTTP/1.1",
      "accept: application/json, text/plain, */*",
      "authorization: Bearer secret",
      "content-type: application/json",
      "",
      '{"name":"neo"}',
    ].join("\n"));
    expect(request).toEqual({
      method: "POST",
      url: "https://example.com/users",
      headers: {
        accept: "application/json, text/plain, */*",
        authorization: "Bearer secret",
        "content-type": "application/json",
      },
      body: '{"name":"neo"}',
    });
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
  it("忽略 curl 前面的注释", () => {
    expect(detectFormat("# 调试请求\ncurl https://x.com")).toBe("curl");
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

  it("允许 curl URL 使用环境变量模板", () => {
    expect(parseCurl("curl '{{host}}/users'")).toEqual({
      method: "GET",
      url: "{{host}}/users",
      headers: {},
      body: null,
    });
  });

  it("发送前过滤 curl 的单行和多行注释", () => {
    const request = parseCurl([
      "# 创建用户",
      "curl -X POST https://example.com/users \\",
      "  /* 请求头 */",
      "  -H 'content-type: application/json' \\",
      "  # 请求体",
      "  -d '{\"name\":\"neo\",\"tag\":\"#keep\"}'",
    ].join("\n"));
    expect(request).toEqual({
      method: "POST",
      url: "https://example.com/users",
      headers: { "content-type": "application/json" },
      body: '{"name":"neo","tag":"#keep"}',
    });
  });

  it("把 -b/--cookie 转成 Cookie 请求头", () => {
    expect(parseCurl(
      "curl https://example.com -b 'sid=123' --cookie 'token=abc'"
    )).toEqual({
      method: "GET",
      url: "https://example.com",
      headers: { Cookie: "sid=123; token=abc" },
      body: null,
    });
  });

  it("支持等号形式的常见长参数", () => {
    expect(parseCurl([
      "curl --request=POST",
      "--url=https://example.com/users",
      "--header='authorization: Bearer secret'",
      "--data-raw='{\"name\":\"neo\"}'",
    ].join(" "))).toEqual({
      method: "POST",
      url: "https://example.com/users",
      headers: { authorization: "Bearer secret" },
      body: '{"name":"neo"}',
    });
  });

  it("支持 shell 相邻引号片段中的单引号", () => {
    const request = parseCurl(
      `curl https://example.com -H 'x-name: O'\\''Reilly' --data-raw '{"name":"O'\\''Reilly"}'`
    );
    expect(request.headers["x-name"]).toBe("O'Reilly");
    expect(request.body).toBe(`{"name":"O'Reilly"}`);
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

  it("对 URL、请求头和 body 中的单引号进行 shell 安全转义", () => {
    const obj = {
      method: "POST",
      url: "https://example.com/search?q=O'Reilly",
      headers: { "x-name": "O'Reilly" },
      body: `{"name":"O'Reilly"}`,
    };
    expect(parseCurl(toCurl(obj))).toEqual(obj);
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

  it("浏览器复制的 curl 转 HTTP 后仍保留认证信息并可转回", () => {
    const curl = [
      "curl 'https://api.example.com/me' \\",
      "  -H 'accept: application/json, text/plain, */*' \\",
      "  -H 'authorization: Bearer secret' \\",
      "  -H 'content-type: application/json' \\",
      "  --data-raw '{\"name\":\"neo\"}'",
    ].join("\n");
    const original = parseCurl(curl);
    const http = toReadableHttp(original);
    const fromHttp = parseHttp(http);
    expect(fromHttp).toEqual({
      ...original,
      body: '{\n  "name": "neo"\n}',
    });
    expect(parseCurl(toCurl(fromHttp))).toEqual(fromHttp);
  });
});
