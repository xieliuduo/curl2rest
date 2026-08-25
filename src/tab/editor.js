import { EditorView, basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";

/** 创建编辑器,返回 { getValue, setValue }。onChange 在文档内容变化时回调 */
export function createEditor(parent, initialText = "", onChange) {
  const extensions = [basicSetup];
  if (onChange) {
    extensions.push(
      EditorView.updateListener.of((u) => {
        if (u.docChanged) onChange();
      })
    );
  }
  const view = new EditorView({
    parent,
    state: EditorState.create({ doc: initialText, extensions }),
  });
  return {
    getValue: () => view.state.doc.toString(),
    setValue: (text) =>
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } }),
  };
}
