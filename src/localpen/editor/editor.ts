import { createMonacoEditor } from './monaco-editor';

export const createEditor = async (options: any) => {
  if (!options) throw new Error();
  return createMonacoEditor(options);
};
