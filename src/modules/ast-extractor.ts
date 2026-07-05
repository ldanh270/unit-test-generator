import fs from 'fs/promises';
import path from 'path';
import * as parser from '@babel/parser';
import _traverse from '@babel/traverse';
import * as t from '@babel/types';
import {
  ExtractedContext,
  ExportedItem,
  ImportedDep,
  RouteEndpoint,
  DepCategory,
} from '../types/context.js';

// Handle Babel ESM interoperability
const traverse = (typeof _traverse === 'function' ? _traverse : (_traverse as any).default) as typeof _traverse;

/**
 * Detects the language based on file extension.
 */
function detectLanguage(filePath: string): 'js' | 'ts' {
  const ext = path.extname(filePath).toLowerCase();
  return ext === '.ts' || ext === '.tsx' ? 'ts' : 'js';
}

/**
 * Detects whether the code uses ESM (import/export) or CJS (require/module.exports).
 */
function detectModuleSystem(code: string): 'esm' | 'cjs' {
  // Simple heuristic: if it contains top-level import/export, it's ESM
  if (/^\s*(import|export)\s/m.test(code)) {
    return 'esm';
  }
  if (/require\s*\(/.test(code)) {
    return 'cjs';
  }
  return 'esm'; // fallback to modern ESM
}

/**
 * Parses source code into a Babel AST.
 */
function parseAST(code: string, language: 'js' | 'ts'): t.File {
  const plugins: parser.ParserPlugin[] = [];
  
  if (language === 'ts') {
    plugins.push('typescript', 'decorators-legacy');
  } else {
    plugins.push('jsx', 'optionalChaining', 'nullishCoalescingOperator');
  }

  return parser.parse(code, {
    sourceType: 'module',
    plugins,
    strictMode: false,
  });
}

/**
 * Categorizes a dependency path into predefined buckets.
 */
function detectCategory(source: string, isRelative: boolean): DepCategory {
  if (!isRelative) {
    if (source === 'mongoose' || source === 'sequelize' || source === 'prisma' || source === 'typeorm') {
      return 'model';
    }
    return 'library';
  }

  const lowerSource = source.toLowerCase();
  if (/model|schema|entity/.test(lowerSource)) return 'model';
  if (/service|repo|repository/.test(lowerSource)) return 'service';
  if (/config|env|setting/.test(lowerSource)) return 'config';
  
  return 'util';
}

/**
 * Extracts all imports and requires from the AST.
 */
function extractImports(ast: t.File): ImportedDep[] {
  const imports: ImportedDep[] = [];

  traverse(ast, {
    ImportDeclaration(path) {
      const source = path.node.source.value;
      const isRelative = source.startsWith('.');
      
      const specifiers: string[] = [];
      for (const spec of path.node.specifiers) {
        if (t.isImportDefaultSpecifier(spec) || t.isImportNamespaceSpecifier(spec) || t.isImportSpecifier(spec)) {
          specifiers.push(spec.local.name);
        }
      }

      imports.push({
        source,
        specifiers,
        isRelative,
        category: detectCategory(source, isRelative),
      });
    },

    CallExpression(path) {
      const callee = path.node.callee;
      if (t.isIdentifier(callee) && callee.name === 'require') {
        const arg = path.node.arguments[0];
        if (t.isStringLiteral(arg)) {
          const source = arg.value;
          const isRelative = source.startsWith('.');
          
          const specifiers: string[] = [];
          
          // Check if parent is VariableDeclarator: const { X, Y } = require('...')
          if (t.isVariableDeclarator(path.parent)) {
            const id = path.parent.id;
            if (t.isObjectPattern(id)) {
              for (const prop of id.properties) {
                if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
                  specifiers.push(prop.key.name);
                }
              }
            } else if (t.isIdentifier(id)) {
              specifiers.push(id.name);
            }
          }

          imports.push({
            source,
            specifiers,
            isRelative,
            category: detectCategory(source, isRelative),
          });
        }
      }
    }
  });

  return imports;
}

/**
 * Extracts all exported functions, classes, and variables from the AST.
 */
function extractExports(ast: t.File): ExportedItem[] {
  const exportsList: ExportedItem[] = [];

  function mapParams(params: any[]): string[] {
    return params.map(param => {
      if (t.isIdentifier(param)) return param.name;
      if (t.isAssignmentPattern(param) && t.isIdentifier(param.left)) return param.left.name;
      if (t.isRestElement(param) && t.isIdentifier(param.argument)) return `...${param.argument.name}`;
      return 'unknown';
    });
  }

  traverse(ast, {
    ExportNamedDeclaration(path) {
      const line = path.node.loc?.start.line || 1;
      const decl = path.node.declaration;

      if (t.isFunctionDeclaration(decl)) {
        exportsList.push({
          name: decl.id?.name || 'anonymous',
          type: 'function',
          isAsync: decl.async === true,
          params: mapParams(decl.params),
          line,
        });
      } else if (t.isVariableDeclaration(decl)) {
        for (const declarator of decl.declarations) {
          if (t.isIdentifier(declarator.id)) {
            const name = declarator.id.name;
            const init = declarator.init;
            
            if (t.isArrowFunctionExpression(init)) {
              exportsList.push({
                name,
                type: 'arrow',
                isAsync: init.async === true,
                params: mapParams(init.params),
                line,
              });
            } else if (t.isFunctionExpression(init)) {
              exportsList.push({
                name,
                type: 'function',
                isAsync: init.async === true,
                params: mapParams(init.params),
                line,
              });
            } else {
              exportsList.push({
                name,
                type: 'variable',
                isAsync: false,
                params: [],
                line,
              });
            }
          }
        }
      } else if (t.isClassDeclaration(decl)) {
        exportsList.push({
          name: decl.id?.name || 'anonymous',
          type: 'class',
          isAsync: false,
          params: [],
          line,
        });
      }
    },

    ExportDefaultDeclaration(path) {
      const line = path.node.loc?.start.line || 1;
      const decl = path.node.declaration;

      if (t.isFunctionDeclaration(decl)) {
        exportsList.push({
          name: decl.id?.name || 'default',
          type: 'default',
          isAsync: decl.async === true,
          params: mapParams(decl.params),
          line,
        });
      } else if (t.isArrowFunctionExpression(decl)) {
        exportsList.push({
          name: 'default',
          type: 'default',
          isAsync: decl.async === true,
          params: mapParams(decl.params),
          line,
        });
      } else if (t.isIdentifier(decl)) {
        exportsList.push({
          name: decl.name,
          type: 'default',
          isAsync: false,
          params: [],
          line,
        });
      }
    }
  });

  return exportsList;
}

/**
 * Extracts Express route endpoints from the AST.
 */
function extractRoutes(ast: t.File): RouteEndpoint[] {
  const routes: RouteEndpoint[] = [];
  const httpMethods = ['get', 'post', 'put', 'delete', 'patch'];

  traverse(ast, {
    CallExpression(path) {
      const callee = path.node.callee;
      
      if (t.isMemberExpression(callee) && t.isIdentifier(callee.property)) {
        const method = callee.property.name.toLowerCase();
        
        if (httpMethods.includes(method)) {
          const args = path.node.arguments;
          
          if (args.length > 0 && t.isStringLiteral(args[0])) {
            const routePath = args[0].value;
            
            // Find the handler name by looking for the first identifier from the end
            let handler = 'anonymous';
            for (let i = args.length - 1; i >= 1; i--) {
              if (t.isIdentifier(args[i])) {
                handler = (args[i] as t.Identifier).name;
                break;
              }
            }
            
            // Only add if we found a valid identifier as handler (skip inline functions for simplicity)
            if (handler !== 'anonymous') {
              routes.push({
                method: method as RouteEndpoint['method'],
                path: routePath,
                handler,
              });
            }
          }
        }
      }
    }
  });

  return routes;
}

/**
 * Main entry point: Reads a source file and extracts structured context via AST analysis.
 * @param filePath Absolute or relative path to the source file.
 * @returns Populated ExtractedContext object.
 */
export async function extractContext(filePath: string): Promise<ExtractedContext> {
  const absolutePath = path.resolve(filePath);
  
  let fileContent: string;
  try {
    fileContent = await fs.readFile(absolutePath, 'utf8');
  } catch (error: any) {
    throw new Error(`File not found or cannot be read: ${absolutePath}`);
  }

  const language = detectLanguage(absolutePath);
  const moduleSystem = detectModuleSystem(fileContent);
  
  let ast: t.File;
  try {
    ast = parseAST(fileContent, language);
  } catch (error: any) {
    throw new Error(`Cannot parse file ${absolutePath} - Is this valid JS/TS?\n${error.message}`);
  }

  const imports = extractImports(ast);
  const exports = extractExports(ast);
  const routes = extractRoutes(ast);

  return {
    filePath: absolutePath,
    fileContent,
    language,
    moduleSystem,
    exports,
    imports,
    routes,
  };
}
