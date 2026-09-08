import { ParseError } from "./errors.js";

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

/** URL 可直接写 http(s),也可使用环境变量模板(如 {{host}}/api) */
function isRequestUrl(value) {
  return /^https?:\/\//i.test(value || "") || /\{\{[^{}]+\}\}/.test(value || "");
}

/**
 * 移除请求编辑器中的注释:
 * - 可带缩进的 # 单行注释
 * - /* ... *\/ 多行注释
 * 引号内的 #、/*、*\/ 保持原样,避免破坏 URL、JSON 字符串与 curl 参数。
 */
export function stripRequestComments(source) {
  const text = String(source ?? "");
  const ranges = [];
  let quote = "";
  let escaped = false;
  let lineStart = 0;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === quote) {
        quote = "";
      }
      if (ch === "\n") lineStart = i + 1;
      continue;
    }

    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }

    // 只把行首(允许缩进)的 # 识别为注释,不影响 URL fragment 和正文中的 #。
    if (ch === "#" && text.slice(lineStart, i).trim() === "") {
      const newline = text.indexOf("\n", i);
      const end = newline === -1 ? text.length : newline + 1;
      ranges.push({ start: lineStart, end, replacement: "" });
      i = end - 1;
      lineStart = end;
      continue;
    }

    // 仅把位于行首或空白后的 /* 视为注释起点。
    // HTTP 头中常见的 Accept: */*、application/* 等不能被当成注释。
    const blockCommentBoundary = i === 0 || /\s/.test(text[i - 1]);
    if (ch === "/" && text[i + 1] === "*" && blockCommentBoundary) {
      const close = text.indexOf("*/", i + 2);
      // 未闭合的 /* 更可能是请求值的一部分，保守起见保持原样。
      if (close === -1) continue;
      const commentEnd = close === -1 ? text.length : close + 2;
      const newline = text.indexOf("\n", commentEnd);
      const lineEnd = newline === -1 ? text.length : newline;
      const standalone =
        text.slice(lineStart, i).trim() === "" &&
        text.slice(commentEnd, lineEnd).trim() === "";

      if (standalone) {
        const end = newline === -1 ? text.length : newline + 1;
        ranges.push({ start: lineStart, end, replacement: "" });
        i = end - 1;
        lineStart = end;
      } else {
        ranges.push({ start: i, end: commentEnd, replacement: " " });
        const lastNewline = text.lastIndexOf("\n", commentEnd - 1);
        if (lastNewline >= i) lineStart = lastNewline + 1;
        i = commentEnd - 1;
      }
      continue;
    }

    if (ch === "\n") lineStart = i + 1;
  }

  if (!ranges.length) return text;
  let result = "";
  let cursor = 0;
  for (const range of ranges) {
    result += text.slice(cursor, range.start) + range.replacement;
    cursor = range.end;
  }
  return result + text.slice(cursor);
}

/** 解析 HTTP 报文格式 → RequestObject */
export function parseHttp(text) {
  text = stripRequestComments(text);
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const firstLine = (lines.shift() ?? "").trim();
  if (!firstLine) throw new ParseError("PARSE_FIRST_LINE", "请求首行为空");

  // 首行可能是 "METHOD URL HTTP/1.1" 或省略方法的 "URL"
  const parts = firstLine.split(/\s+/);
  let method, url;
  if (METHODS.includes(parts[0].toUpperCase())) {
    method = parts[0].toUpperCase();
    url = parts[1];
  } else {
    method = "GET";
    url = parts[0];
  }
  if (!url || !isRequestUrl(url)) {
    throw new ParseError("PARSE_NO_URL", "首行未找到有效 URL");
  }

  // 头部:直到空行
  const headers = {};
  let i = 0;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") { i++; break; }
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim();
    if (key) headers[key] = val;
  }

  // 剩余为 body
  const rest = lines.slice(i).join("\n").trim();
  const body = rest.length ? rest : null;

  return { method, url, headers, body };
}

/** RequestObject → HTTP 报文文本 */
export function toHttp(obj) {
  const head = `${obj.method} ${obj.url} HTTP/1.1`;
  const headerLines = Object.entries(obj.headers || {}).map(([k, v]) => `${k}: ${v}`);
  let out = [head, ...headerLines].join("\n");
  if (obj.body != null && String(obj.body).length) out += `\n\n${obj.body}`;
  return out;
}

/**
 * JSON 请求体美化。先用 JSON.parse 校验,再直接格式化原始字符,
 * 避免 JSON.stringify 改变大整数精度、重复键或数字写法。
 * 非 JSON 内容保持原样。
 */
export function formatJsonBody(body) {
  if (body == null) return body;
  const source = String(body);
  const text = source.trim();
  if (!text) return source;
  try {
    JSON.parse(text);
  } catch {
    return source;
  }

  let out = "";
  let indent = 0;
  let inString = false;
  let escaped = false;
  const spaces = () => "  ".repeat(indent);
  const nextNonSpace = (from) => {
    for (let i = from; i < text.length; i++) {
      if (!/\s/.test(text[i])) return text[i];
    }
    return "";
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      out += ch;
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') {
      inString = true;
      out += ch;
    } else if (ch === "{" || ch === "[") {
      out += ch;
      const close = ch === "{" ? "}" : "]";
      if (nextNonSpace(i + 1) !== close) {
        indent++;
        out += "\n" + spaces();
      }
    } else if (ch === "}" || ch === "]") {
      const open = ch === "}" ? "{" : "[";
      if (out.endsWith(open)) {
        out += ch;
      } else {
        indent--;
        out += "\n" + spaces() + ch;
      }
    } else if (ch === ",") {
      out += ",\n" + spaces();
    } else if (ch === ":") {
      out += ": ";
    } else if (!/\s/.test(ch)) {
      out += ch;
    }
  }
  return out;
}

/** RequestObject → 适合编辑器阅读的 HTTP 文本(JSON body 自动缩进) */
export function toReadableHttp(obj) {
  return toHttp({ ...obj, body: formatJsonBody(obj.body) });
}

/** 判断编辑器文本是 curl 还是 http 报文 */
export function detectFormat(text) {
  return /^\s*curl\b/i.test(stripRequestComments(text)) ? "curl" : "http";
}

function decodeAnsiEscape(ch) {
  const escapes = {
    a: "\x07",
    b: "\b",
    e: "\x1b",
    f: "\f",
    n: "\n",
    r: "\r",
    t: "\t",
    v: "\v",
    "\\": "\\",
    "'": "'",
    '"': '"',
  };
  return Object.prototype.hasOwnProperty.call(escapes, ch) ? escapes[ch] : `\\${ch}`;
}

/** 把 curl 命令拆成 shell token,支持引号拼接、转义与反斜杠续行 */
function tokenizeCurl(text) {
  const tokens = [];
  let token = "";
  let quote = "";
  let started = false;

  const push = () => {
    if (!started) return;
    tokens.push(token);
    token = "";
    started = false;
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (!quote && /\s/.test(ch)) {
      push();
      continue;
    }

    if (!quote && ch === "$" && text[i + 1] === "'") {
      quote = "ansi";
      started = true;
      i++;
      continue;
    }

    if (!quote && (ch === "'" || ch === '"')) {
      quote = ch;
      started = true;
      continue;
    }

    if (quote === "'" && ch === "'") {
      quote = "";
      continue;
    }

    if (quote === '"' && ch === '"') {
      quote = "";
      continue;
    }

    if (quote === "ansi" && ch === "'") {
      quote = "";
      continue;
    }

    if (ch === "\\" && quote !== "'") {
      const next = text[i + 1];
      if (next === "\r" && text[i + 2] === "\n") {
        i += 2;
        continue;
      }
      if (next === "\n") {
        i++;
        continue;
      }
      if (next === undefined) {
        token += "\\";
        started = true;
        continue;
      }
      if (quote === "ansi") {
        token += decodeAnsiEscape(next);
        started = true;
        i++;
        continue;
      }
      if (quote === '"' && !['$', '"', "\\", "\n", "\r"].includes(next)) {
        token += "\\";
        started = true;
        continue;
      }
      token += next;
      started = true;
      i++;
      continue;
    }

    token += ch;
    started = true;
  }
  push();
  return tokens;
}

function splitLongOption(token) {
  if (!token.startsWith("--")) return { option: token, value: undefined };
  const idx = token.indexOf("=");
  if (idx === -1) return { option: token, value: undefined };
  return { option: token.slice(0, idx), value: token.slice(idx + 1) };
}

function findHeaderKey(headers, name) {
  const lower = name.toLowerCase();
  return Object.keys(headers).find((key) => key.toLowerCase() === lower);
}

function setHeader(headers, name, value) {
  const existing = findHeaderKey(headers, name);
  headers[existing || name] = value;
}

function appendHeader(headers, name, value, separator) {
  const existing = findHeaderKey(headers, name);
  if (!existing) {
    headers[name] = value;
    return;
  }
  headers[existing] = headers[existing]
    ? `${headers[existing]}${separator}${value}`
    : value;
}

function encodeBasicCredentials(credentials) {
  const bytes = new TextEncoder().encode(credentials);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** 解析 curl 命令 → RequestObject */
export function parseCurl(text) {
  text = stripRequestComments(text);
  const tokens = tokenizeCurl(text);
  if (tokens[0] && /^curl$/i.test(tokens[0])) tokens.shift();

  let method = null;
  let url = null;
  const headers = {};
  let body = null;

  for (let i = 0; i < tokens.length; i++) {
    const { option: t, value: inlineValue } = splitLongOption(tokens[i]);
    const nextValue = () => inlineValue !== undefined ? inlineValue : (tokens[++i] ?? "");

    if (t === "-X" || t === "--request") {
      method = (nextValue() || "GET").toUpperCase();
    } else if (t === "-H" || t === "--header") {
      const h = nextValue();
      const idx = h.indexOf(":");
      if (idx !== -1) setHeader(
        headers,
        h.slice(0, idx).trim(),
        h.slice(idx + 1).trim()
      );
    } else if (
      t === "-d" || t === "--data" || t === "--data-ascii" ||
      t === "--data-raw" || t === "--data-binary" || t === "--data-urlencode"
    ) {
      const value = nextValue();
      body = body == null ? value : `${body}&${value}`;
    } else if (t === "--json") {
      const value = nextValue();
      body = body == null ? value : `${body}&${value}`;
      if (!findHeaderKey(headers, "Content-Type")) {
        headers["Content-Type"] = "application/json";
      }
      if (!findHeaderKey(headers, "Accept")) {
        headers.Accept = "application/json";
      }
    } else if (t === "-u" || t === "--user") {
      const cred = nextValue();
      setHeader(headers, "Authorization", "Basic " + encodeBasicCredentials(cred));
    } else if (t === "--oauth2-bearer") {
      setHeader(headers, "Authorization", `Bearer ${nextValue()}`);
    } else if (t === "-b" || t === "--cookie") {
      const cookie = nextValue();
      if (cookie && !cookie.startsWith("@")) {
        appendHeader(headers, "Cookie", cookie, "; ");
      }
    } else if (t === "-A" || t === "--user-agent") {
      setHeader(headers, "User-Agent", nextValue());
    } else if (t === "-e" || t === "--referer") {
      setHeader(headers, "Referer", nextValue());
    } else if (t === "--url") {
      url = nextValue();
    } else if (t === "-I" || t === "--head") {
      method = "HEAD";
    } else if (!t.startsWith("-") && isRequestUrl(t)) {
      url = t;
    }
  }

  if (!url) throw new ParseError("PARSE_CURL_NO_URL", "curl 命令未找到 URL");
  if (!method) method = body != null ? "POST" : "GET";

  return { method, url, headers, body };
}

/** 用 POSIX shell 单引号安全包裹 curl 参数 */
function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

/** RequestObject → curl 命令文本 */
export function toCurl(obj) {
  const parts = [`curl -X ${String(obj.method || "GET").toUpperCase()} ${shellQuote(obj.url)}`];
  for (const [k, v] of Object.entries(obj.headers || {})) {
    parts.push(`-H ${shellQuote(`${k}: ${v}`)}`);
  }
  if (obj.body != null && String(obj.body).length) {
    parts.push(`-d ${shellQuote(obj.body)}`);
  }
  return parts.join(" \\\n  ");
}

/** 自动识别格式并解析 */
export function parseRequest(text) {
  return detectFormat(text) === "curl" ? parseCurl(text) : parseHttp(text);
}
