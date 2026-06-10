import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import ts from 'typescript';
import type { EbcaContractDeclarationMetadata } from '@ebca/core/types/contracts';

interface WebsocketContractSourceComponentFile {
  readonly sourceFile: string | null;
}

export interface WebsocketContractSourceFileOptions {
  readonly components: readonly WebsocketContractSourceComponentFile[];
  readonly declarations: readonly EbcaContractDeclarationMetadata[];
}

export function readWebsocketContractSourceFiles(
  options: WebsocketContractSourceFileOptions,
): ts.SourceFile[] {
  const filePaths = [
    ...options.components.flatMap((component) =>
      component.sourceFile ? [component.sourceFile] : [],
    ),
    ...options.declarations.flatMap((declaration) =>
      declaration.sourceFile ? [declaration.sourceFile] : [],
    ),
  ];
  const seen = new Set<string>();
  const sourceFiles: ts.SourceFile[] = [];
  const compilerOptions = readCompilerOptions();
  for (const path of filePaths) {
    readContractSourceFileWithImports(path, seen, sourceFiles, compilerOptions);
  }
  return sourceFiles;
}

function readContractSourceFileWithImports(
  path: string,
  seen: Set<string>,
  sourceFiles: ts.SourceFile[],
  compilerOptions: ts.CompilerOptions,
): void {
  const filePath = resolve(path);
  if (seen.has(filePath) || !canReadContractSourceFile(filePath)) {
    return;
  }
  seen.add(filePath);
  const sourceFile = readSourceFile(filePath);
  sourceFiles.push(sourceFile);
  for (const moduleName of readImportedModuleNames(sourceFile)) {
    const importedFilePath = resolveImportedSourceFile(
      moduleName,
      filePath,
      compilerOptions,
    );
    if (!importedFilePath) {
      continue;
    }
    readContractSourceFileWithImports(
      importedFilePath,
      seen,
      sourceFiles,
      compilerOptions,
    );
  }
}

function readSourceFile(filePath: string): ts.SourceFile {
  return ts.createSourceFile(
    resolve(filePath),
    readFileSync(filePath, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
}

function readCompilerOptions(): ts.CompilerOptions {
  const configPath = ts.findConfigFile(
    process.cwd(),
    (path) => ts.sys.fileExists(path),
    'tsconfig.json',
  );
  if (!configPath) {
    return {};
  }
  const configFile = ts.readConfigFile(configPath, (path) =>
    ts.sys.readFile(path),
  );
  if (configFile.error || !configFile.config) {
    return {};
  }
  return ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    dirname(configPath),
  ).options;
}

function readImportedModuleNames(sourceFile: ts.SourceFile): string[] {
  return sourceFile.statements.flatMap((statement) => {
    if (!ts.isImportDeclaration(statement)) {
      return [];
    }
    const moduleSpecifier = statement.moduleSpecifier;
    if (!ts.isStringLiteral(moduleSpecifier)) {
      return [];
    }
    return [moduleSpecifier.text];
  });
}

function resolveImportedSourceFile(
  moduleName: string,
  containingFile: string,
  compilerOptions: ts.CompilerOptions,
): string | null {
  const resolved = ts.resolveModuleName(
    moduleName,
    containingFile,
    compilerOptions,
    ts.sys,
  ).resolvedModule?.resolvedFileName;
  if (!resolved || !canReadContractSourceFile(resolved)) {
    return null;
  }
  return resolved;
}

function canReadContractSourceFile(filePath: string): boolean {
  const normalizedPath = resolve(filePath).replace(/\\/g, '/');
  return (
    existsSync(normalizedPath) &&
    normalizedPath.endsWith('.ts') &&
    !normalizedPath.endsWith('.d.ts') &&
    !normalizedPath.includes('/dist/') &&
    !normalizedPath.includes('/node_modules/')
  );
}
