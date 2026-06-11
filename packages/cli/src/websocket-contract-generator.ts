import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { getEbcaContractDeclarations } from '@ebca/core/decorators/ebca-contract.decorator';
import { getEbcaQueries } from '@ebca/core/decorators/ebca-query.decorator';
import type {
  EbcaRuntimeComponentDescriptor,
  EbcaRuntimeEntityDescriptor,
  EbcaRuntimeSnapshot,
} from './runtime-inspector';
import {
  readWebsocketContractAst,
  type WebsocketContractComponentShape,
  type WebsocketContractProperty,
} from './websocket-contract-ast';
import {
  normalizeWebsocketQueryContract,
  renderWebsocketQueryContract,
  type WebsocketQueryContract,
} from './websocket-query-contract-renderer';

export interface WebsocketContractGenerationOptions {
  readonly outputPath?: string;
}

export interface WebsocketContractGenerationStats {
  readonly entityCount: number;
  readonly componentCount: number;
  readonly projectedComponentCount: number;
  readonly inboundComponentCount: number;
  readonly queryCount: number;
  readonly contractTypeCount: number;
  readonly byteLength: number;
}

export interface WebsocketContractGenerationResult {
  readonly code: string;
  readonly outputPath: string | null;
  readonly stats: WebsocketContractGenerationStats;
}

interface ContractComponent {
  readonly descriptor: EbcaRuntimeComponentDescriptor;
  readonly shape: WebsocketContractComponentShape;
}

export function generateWebsocketContract(
  snapshot: EbcaRuntimeSnapshot,
  options: WebsocketContractGenerationOptions = {},
): WebsocketContractGenerationResult {
  const entities = [...snapshot.entities].sort(compareByClassName);
  const exposedComponents = snapshot.components
    .filter((component) => component.websocket || component.inbound)
    .sort(compareByClassName);
  const ast = readWebsocketContractAst({
    components: exposedComponents.map((component) => ({
      className: component.className,
      isCommand: component.isCommand,
      sourceFile: component.sourceFile,
    })),
    declarations: getEbcaContractDeclarations(),
    gate: 'ws',
  });
  const shapeByClassName = new Map(
    ast.components.map((shape) => [shape.className, shape]),
  );
  const components = exposedComponents.map((descriptor) => ({
    descriptor,
    shape: shapeByClassName.get(descriptor.className) ?? {
      className: descriptor.className,
      properties: [],
    },
  }));
  const projectedComponents = components.filter(
    (component) => component.descriptor.websocket,
  );
  const inboundComponents = components.filter(
    (component) => component.descriptor.inbound,
  );
  const queries = getEbcaQueries()
    .filter((query) => query.options.gates.includes('ws'))
    .map(normalizeWebsocketQueryContract)
    .sort((left, right) =>
      compareText(left.metadata.options.name, right.metadata.options.name),
    );
  const code = renderWebsocketContract({
    entities,
    components,
    projectedComponents,
    inboundComponents,
    typeDeclarations: ast.contractTypeDeclarations.map(
      (declaration) => declaration.text,
    ),
    queries,
  });
  const outputPath = options.outputPath ? resolve(options.outputPath) : null;
  if (outputPath) {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, code);
  }
  return {
    code,
    outputPath,
    stats: {
      entityCount: entities.length,
      componentCount: components.length,
      projectedComponentCount: projectedComponents.length,
      inboundComponentCount: inboundComponents.length,
      queryCount: queries.length,
      contractTypeCount: ast.contractTypeDeclarations.length,
      byteLength: Buffer.byteLength(code),
    },
  };
}

function renderWebsocketContract(input: {
  readonly entities: readonly EbcaRuntimeEntityDescriptor[];
  readonly components: readonly ContractComponent[];
  readonly projectedComponents: readonly ContractComponent[];
  readonly inboundComponents: readonly ContractComponent[];
  readonly typeDeclarations: readonly string[];
  readonly queries: readonly WebsocketQueryContract[];
}): string {
  return [
    'export type WebsocketJsonValue =',
    '  | string',
    '  | number',
    '  | boolean',
    '  | null',
    '  | WebsocketJsonValue[]',
    '  | { [key: string]: WebsocketJsonValue };',
    '',
    'export type WebsocketJsonObject = {',
    '  [key: string]: WebsocketJsonValue',
    '};',
    '',
    'export type CommandFailureDetailValue = WebsocketJsonValue;',
    '',
    'export type CommandFailureDetails = WebsocketJsonObject;',
    '',
    'export enum CommandComponentStatus {',
    '  PENDING = "pending",',
    '  SUCCEEDED = "succeeded",',
    '  REJECTED = "rejected",',
    '}',
    '',
    'export enum CommandComponentSource {',
    '  SYSTEM = "system",',
    '  WEBSOCKET = "websocket",',
    '  REST = "rest",',
    '}',
    '',
    ...input.typeDeclarations.flatMap((declaration) => [declaration, '']),
    ...input.entities.flatMap(renderEntityClass),
    ...renderNameConst(
      'WEBSOCKET_PROJECTED_ENTITY_NAMES',
      input.entities.map((entity) => ({
        key: entityToConstantName(entity.className),
        value: entity.name,
      })),
    ),
    'export type WebsocketProjectedEntityName =',
    '  (typeof WEBSOCKET_PROJECTED_ENTITY_NAMES)[keyof typeof WEBSOCKET_PROJECTED_ENTITY_NAMES];',
    '',
    'export interface WebsocketEntityContract<',
    '  TEntityName extends WebsocketProjectedEntityName = WebsocketProjectedEntityName,',
    '> {',
    '  readonly entityName: TEntityName;',
    '}',
    '',
    'export type WebsocketProjectedEntityTarget =',
    '  | WebsocketProjectedEntityName',
    '  | WebsocketEntityContract;',
    '',
    'export function getWebsocketEntityName(',
    '  entity: WebsocketProjectedEntityTarget,',
    '): WebsocketProjectedEntityName {',
    '  return typeof entity === "string" ? entity : entity.entityName;',
    '}',
    '',
    'const websocketProjectedEntityNameValues: readonly string[] = Object.values(',
    '  WEBSOCKET_PROJECTED_ENTITY_NAMES,',
    ');',
    '',
    'export function isWebsocketProjectedEntityName(',
    '  value: string,',
    '): value is WebsocketProjectedEntityName {',
    '  return websocketProjectedEntityNameValues.some((name) => name === value);',
    '}',
    '',
    ...input.components.flatMap(renderComponentClass),
    ...renderNameConst(
      'WEBSOCKET_PROJECTED_COMPONENT_NAMES',
      input.projectedComponents.map((component) =>
        componentToNameEntry(component.descriptor),
      ),
    ),
    'export type WebsocketProjectedComponentName =',
    '  (typeof WEBSOCKET_PROJECTED_COMPONENT_NAMES)[keyof typeof WEBSOCKET_PROJECTED_COMPONENT_NAMES];',
    '',
    ...renderNameConst(
      'WEBSOCKET_INBOUND_COMPONENT_NAMES',
      input.inboundComponents.map((component) =>
        componentToNameEntry(component.descriptor),
      ),
    ),
    'export type WebsocketInboundComponentName =',
    '  (typeof WEBSOCKET_INBOUND_COMPONENT_NAMES)[keyof typeof WEBSOCKET_INBOUND_COMPONENT_NAMES];',
    '',
    'export type WebsocketComponentName =',
    '  | WebsocketProjectedComponentName',
    '  | WebsocketInboundComponentName;',
    '',
    'export interface WebsocketComponentContract<',
    '  TComponentName extends WebsocketComponentName = WebsocketComponentName,',
    '> {',
    '  readonly componentName: TComponentName;',
    '}',
    '',
    'export type WebsocketProjectedComponentContract<',
    '  TComponentName extends WebsocketProjectedComponentName = WebsocketProjectedComponentName,',
    '> = WebsocketComponentContract<TComponentName>;',
    '',
    'export type WebsocketInboundComponentContract<',
    '  TComponentName extends WebsocketInboundComponentName = WebsocketInboundComponentName,',
    '> = WebsocketComponentContract<TComponentName>;',
    '',
    'export function getWebsocketComponentName<',
    '  TComponentName extends WebsocketComponentName,',
    '>(',
    '  component: WebsocketComponentContract<TComponentName>,',
    '): TComponentName {',
    '  return component.componentName;',
    '}',
    '',
    'export function getWebsocketProjectedComponentNames(',
    '  components: readonly WebsocketProjectedComponentContract[],',
    '): WebsocketProjectedComponentName[] {',
    '  return components.map((component) => component.componentName);',
    '}',
    '',
    'export function getWebsocketComponentNames(',
    '  components: readonly WebsocketComponentContract[],',
    '): WebsocketComponentName[] {',
    '  return components.map((component) => component.componentName);',
    '}',
    '',
    'export interface WebsocketComponentPayloadByName {',
    ...input.components.map(
      (component) =>
        `  readonly ${quoteProperty(component.descriptor.name)}: ${component.descriptor.className};`,
    ),
    '}',
    '',
    'export type WebsocketComponentPayloadOf<',
    '  TComponentName extends WebsocketComponentName,',
    '> = TComponentName extends keyof WebsocketComponentPayloadByName',
    '  ? WebsocketComponentPayloadByName[TComponentName]',
    '  : never;',
    '',
    'const websocketProjectedComponentNameValues: readonly string[] = Object.values(',
    '  WEBSOCKET_PROJECTED_COMPONENT_NAMES,',
    ');',
    '',
    'const websocketInboundComponentNameValues: readonly string[] = Object.values(',
    '  WEBSOCKET_INBOUND_COMPONENT_NAMES,',
    ');',
    '',
    'export function isWebsocketProjectedComponentName(',
    '  value: string,',
    '): value is WebsocketProjectedComponentName {',
    '  return websocketProjectedComponentNameValues.some((name) => name === value);',
    '}',
    '',
    'export function isWebsocketInboundComponentName(',
    '  value: string,',
    '): value is WebsocketInboundComponentName {',
    '  return websocketInboundComponentNameValues.some((name) => name === value);',
    '}',
    '',
    'export function isWebsocketComponentName(',
    '  value: string,',
    '): value is WebsocketComponentName {',
    '  return (',
    '    isWebsocketProjectedComponentName(value) ||',
    '    isWebsocketInboundComponentName(value)',
    '  );',
    '}',
    '',
    ...renderWebsocketQueryContract(input.queries),
  ].join('\n');
}

function renderEntityClass(entity: EbcaRuntimeEntityDescriptor): string[] {
  return [
    `export class ${entity.className} {`,
    `  static readonly entityName = ${JSON.stringify(entity.name)} as const;`,
    '}',
    '',
  ];
}

function renderComponentClass(component: ContractComponent): string[] {
  return [
    `export class ${component.descriptor.className} {`,
    `  static readonly componentName = ${JSON.stringify(component.descriptor.name)} as const;`,
    ...component.shape.properties.map(renderProperty),
    '}',
    '',
  ];
}

function renderProperty(property: WebsocketContractProperty): string {
  return `  declare readonly ${property.name}: ${property.type};`;
}

function renderNameConst(
  name: string,
  entries: readonly { readonly key: string; readonly value: string }[],
): string[] {
  return [
    `export const ${name} = {`,
    ...entries.map(
      (entry) => `  ${entry.key}: ${JSON.stringify(entry.value)},`,
    ),
    '} as const;',
    '',
  ];
}

function componentToNameEntry(component: EbcaRuntimeComponentDescriptor): {
  readonly key: string;
  readonly value: string;
} {
  return {
    key: componentNameToConstantName(component.className),
    value: component.name,
  };
}

function quoteProperty(value: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value)
    ? value
    : JSON.stringify(value);
}

function componentNameToConstantName(componentName: string): string {
  return toConstantName(componentName.replace(/Component$/, ''));
}

function entityToConstantName(entityName: string): string {
  return toConstantName(entityName.replace(/Entity$/, ''));
}

function toConstantName(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

function compareByClassName<T extends { readonly className: string }>(
  left: T,
  right: T,
): number {
  return compareText(left.className, right.className);
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right);
}
