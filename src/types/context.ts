/**
 * @file context.ts
 * @description Type definitions for the Extracted AST Context.
 * This acts as the shared schema between the AST Extractor, Prompt Builder, and other modules.
 */

export type DepCategory = 'model' | 'service' | 'config' | 'util' | 'library';

/**
 * A dependency imported into the file.
 */
export interface ImportedDep {
  /** The module path/name (e.g., 'mongoose', '../services/user.service') */
  source: string;
  /** Names of the imported symbols (e.g., ['User', 'Schema']) */
  specifiers: string[];
  /** True if the import starts with './' or '../' */
  isRelative: boolean;
  /** The inferred category of this dependency */
  category: DepCategory;
}

/**
 * An item exported from the file.
 */
export interface ExportedItem {
  /** The name of the exported function/variable/class */
  name: string;
  /** The type of the export */
  type: 'function' | 'class' | 'arrow' | 'variable' | 'default';
  /** True if it's an async function */
  isAsync: boolean;
  /** Parameter names (for generating the prompt) */
  params: string[];
  /** Line number where it is defined */
  line: number;
}

/**
 * An Express.js route endpoint detected in the file.
 */
export interface RouteEndpoint {
  /** HTTP method */
  method: 'get' | 'post' | 'put' | 'delete' | 'patch';
  /** Route path (e.g., '/users/:id') */
  path: string;
  /** The name of the function handling this route */
  handler: string;
}

/**
 * The consolidated result of AST extraction.
 */
export interface ExtractedContext {
  /** Absolute path of the analyzed file */
  filePath: string;
  /** Raw content of the file (to send to LLM) */
  fileContent: string;
  /** Language detected from file extension */
  language: 'js' | 'ts';
  /** Module system detected from syntax */
  moduleSystem: 'esm' | 'cjs';
  /** Detected exports */
  exports: ExportedItem[];
  /** Detected imports */
  imports: ImportedDep[];
  /** Detected Express routes */
  routes: RouteEndpoint[];
  /** Absolute path of the generated test file */
  testFilePath?: string;
  /** The relative import path string to import the source file from the test file */
  relativeImportPath?: string;
}
