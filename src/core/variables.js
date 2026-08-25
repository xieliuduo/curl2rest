/** 把文本中的 {{key}} 替换为 vars[key];未定义的原样保留 */
export function substitute(text, vars) {
  if (!text) return text;
  return text.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (whole, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : whole
  );
}
