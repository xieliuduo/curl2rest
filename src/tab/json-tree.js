// 把任意 JSON 值渲染成可折叠的 DOM 树。
// 对象/数组节点可点击 ▸ 三角展开收起,hover 时出现「复制」按钮(复制该子树的 JSON)。

/** 创建复制按钮,点击把 text 写入剪贴板并短暂提示 */
function makeCopyBtn(text) {
  const btn = document.createElement("button");
  btn.className = "jt-copy";
  btn.textContent = "复制";
  btn.onclick = async (e) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(text);
    const old = btn.textContent;
    btn.textContent = "已复制";
    setTimeout(() => { btn.textContent = old; }, 1000);
  };
  return btn;
}

/** 渲染一个原始值(string/number/boolean/null) */
function renderPrimitive(value) {
  const span = document.createElement("span");
  if (value === null) { span.className = "jt-null"; span.textContent = "null"; }
  else if (typeof value === "string") { span.className = "jt-string"; span.textContent = JSON.stringify(value); }
  else if (typeof value === "number") { span.className = "jt-number"; span.textContent = String(value); }
  else if (typeof value === "boolean") { span.className = "jt-bool"; span.textContent = String(value); }
  else { span.textContent = String(value); }
  return span;
}

/** 递归渲染一个节点。keyLabel 为该节点在父级中的键名(顶层为 null) */
function renderNode(value, keyLabel) {
  const isObj = value && typeof value === "object";
  const row = document.createElement("div");
  row.className = "jt-node";

  const head = document.createElement("div");
  head.className = "jt-head";

  if (isObj) {
    const isArray = Array.isArray(value);
    const entries = isArray
      ? value.map((v, i) => [i, v])
      : Object.entries(value);

    const toggle = document.createElement("span");
    toggle.className = "jt-toggle";
    toggle.textContent = "▾";
    head.appendChild(toggle);

    if (keyLabel !== null) {
      const k = document.createElement("span");
      k.className = "jt-key";
      k.textContent = keyLabel + ": ";
      head.appendChild(k);
    }

    const brace = document.createElement("span");
    brace.className = "jt-punct";
    brace.textContent = isArray ? `[ ${entries.length} ]` : `{ ${entries.length} }`;
    head.appendChild(brace);

    head.appendChild(makeCopyBtn(JSON.stringify(value, null, 2)));

    const children = document.createElement("div");
    children.className = "jt-children";
    for (const [k, v] of entries) {
      children.appendChild(renderNode(v, String(k)));
    }

    let open = true;
    head.onclick = () => {
      open = !open;
      toggle.textContent = open ? "▾" : "▸";
      children.classList.toggle("hidden", !open);
    };

    row.appendChild(head);
    row.appendChild(children);
  } else {
    if (keyLabel !== null) {
      const k = document.createElement("span");
      k.className = "jt-key";
      k.textContent = keyLabel + ": ";
      head.appendChild(k);
    }
    head.appendChild(renderPrimitive(value));
    head.appendChild(makeCopyBtn(
      typeof value === "string" ? value : JSON.stringify(value)
    ));
    row.appendChild(head);
  }
  return row;
}

/** 把 JSON 值渲染进容器(先清空) */
export function renderJsonTree(container, value) {
  container.textContent = "";
  container.appendChild(renderNode(value, null));
}
