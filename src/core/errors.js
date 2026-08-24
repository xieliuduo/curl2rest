export class ParseError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ParseError";
    this.code = code;
  }
}

// 错误码 → 面向小白用户的三段文案:发生了什么 / 可能原因 / 建议操作
export const ERROR_MESSAGES = {
  PARSE_FIRST_LINE: {
    title: "看不懂你输入的请求格式",
    reason: "请求的第一行不符合规范",
    suggestion: "首行应形如 `POST https://example.com HTTP/1.1`,或粘贴一条 curl 命令",
  },
  PARSE_NO_URL: {
    title: "没找到有效的网址",
    reason: "请求里缺少 URL 或 URL 格式不对",
    suggestion: "确认 URL 以 http:// 或 https:// 开头",
  },
  PARSE_CURL_NO_URL: {
    title: "curl 命令里没找到网址",
    reason: "这条 curl 命令缺少要请求的 URL",
    suggestion: "确认 curl 后面带了一个 http(s) 网址",
  },
  NET_FAILED: {
    title: "无法连接到服务器",
    reason: "网址写错了,或该服务器暂时无法访问",
    suggestion: "检查网址是否正确、网络是否正常、服务器是否在线",
  },
  NET_DNS: {
    title: "找不到这个网址对应的服务器",
    reason: "域名可能拼写错误或不存在",
    suggestion: "确认域名拼写正确",
  },
  NET_TIMEOUT: {
    title: "服务器太久没响应",
    reason: "请求超过了等待时间",
    suggestion: "稍后重试,或确认服务器是否正常",
  },
  NET_CORS: {
    title: "浏览器拦截了这次请求",
    reason: "这是权限问题",
    suggestion: "可把这个情况反馈给开发者",
  },
  UNKNOWN: {
    title: "出了点意外,请求没成功",
    reason: "遇到了预期之外的问题",
    suggestion: "请查看技术详情,或稍后重试",
  },
};

export function describeError(code) {
  return ERROR_MESSAGES[code] || ERROR_MESSAGES.UNKNOWN;
}
