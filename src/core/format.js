import { ParseError } from "./errors.js";

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

/** 解析 HTTP 报文格式 → RequestObject */
export function parseHttp(text) {
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
  if (!url || !/^https?:\/\//i.test(url)) {
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

/** 判断编辑器文本是 curl 还是 http 报文 */
export function detectFormat(text) {
  return /^\s*curl\b/i.test(text) ? "curl" : "http";
}

/** 把 curl 命令拆成 token,支持单/双引号与反斜杠续行 */
function tokenizeCurl(text) {
  const joined = text.replace(/\\\r?\n/g, " "); // 续行合并
  const tokens = [];
  const re = /'([^']*)'|"((?:[^"\\]|\\.)*)"|(\S+)/g;
  let m;
  while ((m = re.exec(joined)) !== null) {
    if (m[1] !== undefined) tokens.push(m[1]);
    else if (m[2] !== undefined) tokens.push(m[2].replace(/\\(.)/g, "$1"));
    else tokens.push(m[3]);
  }
  return tokens;
}

/** 解析 curl 命令 → RequestObject */
export function parseCurl(text) {
  const tokens = tokenizeCurl(text);
  if (tokens[0] && /^curl$/i.test(tokens[0])) tokens.shift();

  let method = null;
  let url = null;
  const headers = {};
  let body = null;

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === "-X" || t === "--request") {
      method = (tokens[++i] || "GET").toUpperCase();
    } else if (t === "-H" || t === "--header") {
      const h = tokens[++i] || "";
      const idx = h.indexOf(":");
      if (idx !== -1) headers[h.slice(0, idx).trim()] = h.slice(idx + 1).trim();
    } else if (t === "-d" || t === "--data" || t === "--data-raw" || t === "--data-binary") {
      body = tokens[++i] ?? "";
    } else if (t === "-u" || t === "--user") {
      const cred = tokens[++i] || "";
      headers["Authorization"] = "Basic " + btoa(cred);
    } else if (t === "--url") {
      url = tokens[++i];
    } else if (!t.startsWith("-") && /^https?:\/\//i.test(t)) {
      url = t;
    }
  }

  if (!url) throw new ParseError("PARSE_CURL_NO_URL", "curl 命令未找到 URL");
  if (!method) method = body != null ? "POST" : "GET";

  return { method, url, headers, body };
}

/** RequestObject → curl 命令文本 */
export function toCurl(obj) {
  const parts = [`curl -X ${obj.method} '${obj.url}'`];
  for (const [k, v] of Object.entries(obj.headers || {})) {
    parts.push(`-H '${k}: ${v}'`);
  }
  if (obj.body != null && String(obj.body).length) {
    parts.push(`-d '${obj.body}'`);
  }
  return parts.join(" \\\n  ");
}

/** 自动识别格式并解析 */
export function parseRequest(text) {
  return detectFormat(text) === "curl" ? parseCurl(text) : parseHttp(text);
}
