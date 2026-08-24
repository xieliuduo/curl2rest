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
