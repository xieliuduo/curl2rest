import { EditorView, basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";

/** 创建编辑器,返回 { getValue, setValue } */
export function createEditor(parent, initialText = "") {
  const view = new EditorView({
    parent,
    state: EditorState.create({ doc: initialText, extensions: [basicSetup] }),
  });
  return {
    getValue: () => view.state.doc.toString(),
    setValue: (text) =>
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } }),
  };
}
