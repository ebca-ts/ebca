import { resolve } from 'node:path';
import ts from 'typescript';
import type {
  EbcaContractDeclarationKind,
  EbcaContractDeclarationMetadata,
} from '@ebca/core/types/contracts';
import { readWebsocketContractSourceFiles } from './websocket-contract-source-files';

export interface WebsocketContractSourceComponent {
  readonly className: string;
  readonly isCommand: boolean;
  readonly sourceFile: string | null;
}

export interface WebsocketContractAstOptions {
  readonly components: readonly WebsocketContractSourceComponent[];
  readonly declarations: readonly EbcaContractDeclarationMetadata[];
  readonly gate: 'ws' | 'gql';
  readonly jsonObjectTypeName?: string;
  readonly jsonValueTypeName?: string;
}

export interface WebsocketContractProperty {
  readonly name: string;
  readonly type: string;
}

export interface WebsocketContractComponentShape {
  readonly className: string;
  readonly properties: readonly WebsocketContractProperty[];
}

export interface WebsocketContractTypeDeclaration {
  readonly kind: 'enum' | 'interface' | 'type';
  readonly name: string;
  readonly text: string;
}

export interface WebsocketContractAstResult {
  readonly components: readonly WebsocketContractComponentShape[];
  readonly contractTypeDeclarations: readonly WebsocketContractTypeDeclaration[];
}

interface TypeResolutionContext {
  readonly declarations: ReadonlyMap<string, WebsocketContractTypeDeclaration>;
  readonly allowedDeclarationKinds: ReadonlyMap<
    string,
    EbcaContractDeclarationKind
  >;
  readonly jsonValueTypeName: string;
  readonly safeGlobalTypeNames: ReadonlySet<string>;
  readonly usedContractTypeNames: Set<string>;
}

const baseSafeGlobalTypeNames = new Set([
  'Array',
  'CommandComponentSource',
  'CommandComponentStatus',
  'CommandFailureDetailValue',
  'CommandFailureDetails',
  'Date',
  'Exclude',
  'Extract',
  'NonNullable',
  'Omit',
  'Partial',
  'Pick',
  'Readonly',
  'ReadonlyArray',
  'Record',
  'Required',
  'ReturnType',
]);

export function readWebsocketContractAst(
  options: WebsocketContractAstOptions,
): WebsocketContractAstResult {
  const contractDeclarations = options.declarations.filter((declaration) =>
    declaration.gates.includes(options.gate),
  );
  const sourceFiles = readWebsocketContractSourceFiles({
    components: options.components,
    declarations: contractDeclarations,
  });
  const declarations = readExportedTypeDeclarations(sourceFiles);
  const jsonObjectTypeName =
    options.jsonObjectTypeName ?? 'WebsocketJsonObject';
  const jsonValueTypeName = options.jsonValueTypeName ?? 'WebsocketJsonValue';
  const context: TypeResolutionContext = {
    declarations,
    allowedDeclarationKinds: new Map(
      contractDeclarations.map((declaration) => [
        declaration.name,
        declaration.kind,
      ]),
    ),
    jsonValueTypeName,
    safeGlobalTypeNames: new Set([
      ...baseSafeGlobalTypeNames,
      jsonObjectTypeName,
      jsonValueTypeName,
    ]),
    usedContractTypeNames: new Set(),
  };
  const sourceByPath = new Map(
    sourceFiles.map((sourceFile) => [sourceFile.fileName, sourceFile]),
  );
  return {
    components: options.components.map((component) =>
      readComponentShape(component, sourceByPath, context),
    ),
    contractTypeDeclarations: Array.from(context.usedContractTypeNames)
      .sort(compareText)
      .map((typeName) => context.declarations.get(typeName))
      .filter(
        (declaration): declaration is WebsocketContractTypeDeclaration =>
          declaration !== undefined,
      ),
  };
}

function readExportedTypeDeclarations(
  sourceFiles: readonly ts.SourceFile[],
): Map<string, WebsocketContractTypeDeclaration> {
  const declarations = new Map<string, WebsocketContractTypeDeclaration>();
  for (const sourceFile of sourceFiles) {
    for (const statement of sourceFile.statements) {
      const declaration = readExportedTypeDeclaration(statement, sourceFile);
      if (declaration) {
        declarations.set(declaration.name, declaration);
      }
    }
  }
  return declarations;
}

function readExportedTypeDeclaration(
  statement: ts.Statement,
  sourceFile: ts.SourceFile,
): WebsocketContractTypeDeclaration | null {
  if (!hasExportModifier(statement)) {
    return null;
  }
  if (ts.isEnumDeclaration(statement)) {
    return {
      kind: 'enum',
      name: statement.name.text,
      text: normalizePayloadType(statement.getText(sourceFile)),
    };
  }
  if (ts.isInterfaceDeclaration(statement)) {
    return {
      kind: 'interface',
      name: statement.name.text,
      text: normalizePayloadType(statement.getText(sourceFile)),
    };
  }
  if (ts.isTypeAliasDeclaration(statement)) {
    return {
      kind: 'type',
      name: statement.name.text,
      text: normalizePayloadType(statement.getText(sourceFile)),
    };
  }
  return null;
}

function hasExportModifier(statement: ts.Statement): boolean {
  const modifiers = ts.canHaveModifiers(statement)
    ? ts.getModifiers(statement)
    : undefined;
  return (
    modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
    ) ?? false
  );
}

function readComponentShape(
  component: WebsocketContractSourceComponent,
  sourceByPath: ReadonlyMap<string, ts.SourceFile>,
  context: TypeResolutionContext,
): WebsocketContractComponentShape {
  const sourceFile = component.sourceFile
    ? sourceByPath.get(resolve(component.sourceFile))
    : undefined;
  const classDeclaration = sourceFile
    ? findClassDeclaration(sourceFile, component.className)
    : null;
  if (!sourceFile || !classDeclaration) {
    return {
      className: component.className,
      properties: [],
    };
  }
  return {
    className: component.className,
    properties: readClassProperties(
      classDeclaration,
      sourceFile,
      component.isCommand,
      context,
    ),
  };
}

function findClassDeclaration(
  sourceFile: ts.SourceFile,
  className: string,
): ts.ClassDeclaration | null {
  let result: ts.ClassDeclaration | null = null;
  const visit = (node: ts.Node): void => {
    if (result) {
      return;
    }
    if (ts.isClassDeclaration(node) && node.name?.text === className) {
      result = node;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return result;
}

function readClassProperties(
  declaration: ts.ClassDeclaration,
  sourceFile: ts.SourceFile,
  isCommand: boolean,
  context: TypeResolutionContext,
): WebsocketContractProperty[] {
  const properties = new Map<string, WebsocketContractProperty>();
  const commandTypeArguments = readBaseCommandTypeArguments(declaration);
  if (isCommand || commandTypeArguments) {
    properties.set('failureDetails', {
      name: 'failureDetails',
      type: `${resolvePayloadType(commandTypeArguments?.[1]?.getText(sourceFile) ?? 'CommandFailureDetails', context)} | null`,
    });
    properties.set('reason', {
      name: 'reason',
      type: `${resolvePayloadType(commandTypeArguments?.[0]?.getText(sourceFile) ?? 'string', context)} | null`,
    });
    properties.set('status', {
      name: 'status',
      type: 'CommandComponentStatus',
    });
    properties.set('commandSource', {
      name: 'commandSource',
      type: 'CommandComponentSource',
    });
  }
  for (const member of declaration.members) {
    if (ts.isPropertyDeclaration(member) && ts.isIdentifier(member.name)) {
      properties.set(member.name.text, {
        name: member.name.text,
        type: resolvePayloadType(member.type?.getText(sourceFile), context),
      });
      continue;
    }
    if (!ts.isConstructorDeclaration(member)) {
      continue;
    }
    for (const parameter of member.parameters) {
      if (
        !ts.isIdentifier(parameter.name) ||
        !hasParameterProperty(parameter)
      ) {
        continue;
      }
      properties.set(parameter.name.text, {
        name: parameter.name.text,
        type: resolvePayloadType(parameter.type?.getText(sourceFile), context),
      });
    }
  }
  return Array.from(properties.values()).sort((left, right) =>
    compareText(left.name, right.name),
  );
}

function readBaseCommandTypeArguments(
  declaration: ts.ClassDeclaration,
): readonly ts.TypeNode[] | null {
  for (const heritageClause of declaration.heritageClauses ?? []) {
    for (const heritageType of heritageClause.types) {
      if (isBaseCommandExpression(heritageType.expression)) {
        return Array.from(heritageType.typeArguments ?? []);
      }
    }
  }
  return null;
}

function isBaseCommandExpression(expression: ts.Expression): boolean {
  return (
    (ts.isIdentifier(expression) &&
      expression.text === 'BaseCommandComponent') ||
    (ts.isPropertyAccessExpression(expression) &&
      expression.name.text === 'BaseCommandComponent')
  );
}

function hasParameterProperty(parameter: ts.ParameterDeclaration): boolean {
  return (
    parameter.modifiers?.some(
      (modifier) =>
        modifier.kind === ts.SyntaxKind.PublicKeyword ||
        modifier.kind === ts.SyntaxKind.ProtectedKeyword ||
        modifier.kind === ts.SyntaxKind.PrivateKeyword ||
        modifier.kind === ts.SyntaxKind.ReadonlyKeyword,
    ) ?? false
  );
}

function resolvePayloadType(
  typeText: string | undefined,
  context: TypeResolutionContext,
): string {
  if (!typeText) {
    return context.jsonValueTypeName;
  }
  const normalizedType = normalizePayloadType(typeText);
  for (const typeName of readReferencedTypeNames(normalizedType)) {
    if (context.safeGlobalTypeNames.has(typeName)) {
      continue;
    }
    const declaration = context.declarations.get(typeName);
    if (
      declaration &&
      canUseContractDeclaration(typeName, declaration, context) &&
      collectContractTypeDeclaration(typeName, context, new Set())
    ) {
      continue;
    }
    return normalizedType.endsWith('[]')
      ? `${context.jsonValueTypeName}[]`
      : context.jsonValueTypeName;
  }
  return normalizedType;
}

function collectContractTypeDeclaration(
  typeName: string,
  context: TypeResolutionContext,
  resolvingTypeNames: Set<string>,
): boolean {
  if (context.usedContractTypeNames.has(typeName)) {
    return true;
  }
  if (resolvingTypeNames.has(typeName)) {
    return true;
  }
  const declaration = context.declarations.get(typeName);
  if (
    !declaration ||
    !canUseContractDeclaration(typeName, declaration, context)
  ) {
    return false;
  }
  resolvingTypeNames.add(typeName);
  if (declaration.kind !== 'enum') {
    for (const referencedTypeName of readReferencedTypeNames(
      declaration.text,
    )) {
      if (referencedTypeName === typeName) {
        continue;
      }
      if (context.safeGlobalTypeNames.has(referencedTypeName)) {
        continue;
      }
      const referencedDeclaration =
        context.declarations.get(referencedTypeName);
      if (
        !referencedDeclaration ||
        !canUseContractDeclaration(
          referencedTypeName,
          referencedDeclaration,
          context,
        ) ||
        !collectContractTypeDeclaration(
          referencedTypeName,
          context,
          resolvingTypeNames,
        )
      ) {
        resolvingTypeNames.delete(typeName);
        return false;
      }
    }
  }
  resolvingTypeNames.delete(typeName);
  context.usedContractTypeNames.add(typeName);
  return true;
}

function canUseContractDeclaration(
  typeName: string,
  declaration: WebsocketContractTypeDeclaration,
  context: TypeResolutionContext,
): boolean {
  const allowedKind = context.allowedDeclarationKinds.get(typeName);
  if (!allowedKind) {
    return false;
  }
  if (allowedKind === 'enum') {
    return declaration.kind === 'enum';
  }
  return declaration.kind === 'type' || declaration.kind === 'interface';
}

function normalizePayloadType(typeText: string): string {
  return dedupePrimitiveUnionLines(typeText.replace(/\bDate\b/g, 'string'));
}

function dedupePrimitiveUnionLines(typeText: string): string {
  const seenPrimitiveLines = new Set<string>();
  return typeText
    .split('\n')
    .filter((line) => {
      const primitiveMatch = line
        .trim()
        .match(/^\|\s+(string|number|boolean|null)$/);
      if (!primitiveMatch) {
        return true;
      }
      if (seenPrimitiveLines.has(primitiveMatch[1])) {
        return false;
      }
      seenPrimitiveLines.add(primitiveMatch[1]);
      return true;
    })
    .join('\n');
}

function readReferencedTypeNames(typeText: string): string[] {
  return Array.from(
    stripEnumMemberAccess(stripStringLiterals(typeText)).matchAll(
      /\b[A-Z][A-Za-z0-9_]*\b/g,
    ),
    (match) => match[0],
  );
}

function stripEnumMemberAccess(typeText: string): string {
  return typeText.replace(
    /\b([A-Z][A-Za-z0-9_]*)\.[A-Za-z_][A-Za-z0-9_]*/g,
    '$1',
  );
}

function stripStringLiterals(typeText: string): string {
  return typeText.replace(/(["'`])(?:\\.|(?!\1).)*\1/g, '');
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right);
}
