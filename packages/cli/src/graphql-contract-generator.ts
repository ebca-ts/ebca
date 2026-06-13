import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { getEbcaContractDeclarations } from '@ebca/core/decorators/ebca-contract.decorator';
import { getEbcaQueries } from '@ebca/core/decorators/ebca-query.decorator';
import { EbcaEventType } from '@ebca/core/ebca.helpers';
import type {
  EbcaRuntimeComponentDescriptor,
  EbcaRuntimeEntityDescriptor,
  EbcaRuntimeSnapshot,
} from './runtime-inspector';
import {
  normalizeGraphqlQueryContract,
  renderGraphqlQueryContract,
  type GraphqlQueryContract,
} from './graphql-query-contract-renderer';
import {
  readWebsocketContractAst,
  type WebsocketContractComponentShape,
  type WebsocketContractProperty,
} from './websocket-contract-ast';

export interface GraphqlContractGenerationOptions {
  readonly outputPath?: string;
}

export interface GraphqlContractGenerationStats {
  readonly entityCount: number;
  readonly componentCount: number;
  readonly projectedComponentCount: number;
  readonly inboundComponentCount: number;
  readonly queryCount: number;
  readonly contractTypeCount: number;
  readonly byteLength: number;
}

export interface GraphqlContractGenerationResult {
  readonly code: string;
  readonly outputPath: string | null;
  readonly stats: GraphqlContractGenerationStats;
}

interface ContractComponent {
  readonly descriptor: EbcaRuntimeComponentDescriptor;
  readonly shape: WebsocketContractComponentShape;
}

export function generateGraphqlContract(
  snapshot: EbcaRuntimeSnapshot,
  options: GraphqlContractGenerationOptions = {},
): GraphqlContractGenerationResult {
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
    gate: 'gql',
    jsonObjectTypeName: 'GraphqlJsonObject',
    jsonValueTypeName: 'GraphqlJsonValue',
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
  const requestableComponents = projectedComponents.filter(
    (component) =>
      component.descriptor.websocketLifecycleKinds === null ||
      component.descriptor.websocketLifecycleKinds.includes(
        EbcaEventType.COMPONENT_UPDATED,
      ),
  );
  const inboundComponents = components.filter(
    (component) => component.descriptor.inbound,
  );
  const queries = getEbcaQueries()
    .filter((query) => query.options.gates.includes('gql'))
    .map(normalizeGraphqlQueryContract)
    .sort((left, right) =>
      compareText(left.metadata.options.name, right.metadata.options.name),
    );
  const code = renderGraphqlContract({
    entities,
    components,
    projectedComponents,
    requestableComponents,
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

function renderGraphqlContract(input: {
  readonly entities: readonly EbcaRuntimeEntityDescriptor[];
  readonly components: readonly ContractComponent[];
  readonly projectedComponents: readonly ContractComponent[];
  readonly requestableComponents: readonly ContractComponent[];
  readonly inboundComponents: readonly ContractComponent[];
  readonly typeDeclarations: readonly string[];
  readonly queries: readonly GraphqlQueryContract[];
}): string {
  return [
    'export type GraphqlJsonValue =',
    '  | string',
    '  | number',
    '  | boolean',
    '  | null',
    '  | GraphqlJsonObject',
    '  | readonly GraphqlJsonValue[];',
    '',
    'export type GraphqlJsonObject = {',
    '  readonly [key: string]: GraphqlJsonValue',
    '};',
    '',
    'export type CommandFailureDetailValue = GraphqlJsonValue;',
    '',
    'export type CommandFailureDetails = GraphqlJsonObject;',
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
    '  GRAPHQL = "graphql",',
    '}',
    '',
    'export type GraphqlComponentLifecycleKind = "added" | "updated" | "removed";',
    '',
    'export type GraphqlComponentMutationOperation =',
    '  | "add"',
    '  | "update"',
    '  | "upsert"',
    '  | "remove";',
    '',
    'export type GraphqlComponentRequestMode = "entity" | "collection";',
    '',
    'export const EBCA_GRAPHQL_FIELDS = {',
    '  QUERY: "ebcaQuery",',
    '  COMPONENT_MUTATION: "ebcaComponentMutation",',
    '  COMPONENT_REQUEST: "ebcaComponentRequest",',
    '  COMPONENT_SUBSCRIPTION: "ebcaComponent",',
    '} as const;',
    '',
    ...input.typeDeclarations.flatMap((declaration) => [declaration, '']),
    ...input.entities.flatMap(renderEntityClass),
    ...renderNameConst(
      'GRAPHQL_PROJECTED_ENTITY_NAMES',
      input.entities.map((entity) => ({
        key: entityToConstantName(entity.className),
        value: entity.name,
      })),
    ),
    'export type GraphqlProjectedEntityName =',
    '  (typeof GRAPHQL_PROJECTED_ENTITY_NAMES)[keyof typeof GRAPHQL_PROJECTED_ENTITY_NAMES];',
    '',
    ...input.components.flatMap(renderComponentClass),
    ...renderNameConst(
      'GRAPHQL_PROJECTED_COMPONENT_NAMES',
      input.projectedComponents.map((component) =>
        componentToNameEntry(component.descriptor),
      ),
    ),
    'export type GraphqlProjectedComponentName =',
    '  (typeof GRAPHQL_PROJECTED_COMPONENT_NAMES)[keyof typeof GRAPHQL_PROJECTED_COMPONENT_NAMES];',
    '',
    ...renderNameConst(
      'GRAPHQL_INBOUND_COMPONENT_NAMES',
      input.inboundComponents.map((component) =>
        componentToNameEntry(component.descriptor),
      ),
    ),
    'export type GraphqlInboundComponentName =',
    '  (typeof GRAPHQL_INBOUND_COMPONENT_NAMES)[keyof typeof GRAPHQL_INBOUND_COMPONENT_NAMES];',
    '',
    'export type GraphqlComponentName =',
    '  | GraphqlProjectedComponentName',
    '  | GraphqlInboundComponentName;',
    '',
    'export interface GraphqlComponentPayloadByName {',
    ...input.components.map(
      (component) =>
        `  readonly ${quoteProperty(component.descriptor.name)}: ${component.descriptor.className};`,
    ),
    '}',
    '',
    'export type GraphqlComponentPayloadOf<',
    '  TComponentName extends GraphqlComponentName,',
    '> = TComponentName extends keyof GraphqlComponentPayloadByName',
    '  ? GraphqlComponentPayloadByName[TComponentName]',
    '  : never;',
    '',
    'export interface GraphqlInboundComponentPayloadByName {',
    ...input.inboundComponents.map(renderInboundPayloadByNameEntry),
    '}',
    '',
    'export type GraphqlInboundComponentPayloadOf<',
    '  TComponentName extends GraphqlInboundComponentName,',
    '> = TComponentName extends keyof GraphqlInboundComponentPayloadByName',
    '  ? GraphqlInboundComponentPayloadByName[TComponentName]',
    '  : never;',
    '',
    ...renderGraphqlMutationContract(),
    ...renderGraphqlRequestContract({
      projectedComponents: input.projectedComponents,
      requestableComponents: input.requestableComponents,
    }),
    ...renderGraphqlQueryContract(input.queries),
  ].join('\n');
}

function renderGraphqlMutationContract(): string[] {
  return [
    'export interface GraphqlComponentMutationInput<',
    '  TComponentName extends GraphqlInboundComponentName = GraphqlInboundComponentName,',
    '> {',
    '  readonly operation: GraphqlComponentMutationOperation;',
    '  readonly entityName: GraphqlProjectedEntityName;',
    '  readonly entityId: string;',
    '  readonly componentName: TComponentName;',
    '  readonly component?: GraphqlInboundComponentPayloadOf<TComponentName>;',
    '  readonly requestId?: string;',
    '}',
    '',
    'export interface GraphqlComponentMutationResult<',
    '  TComponentName extends GraphqlInboundComponentName = GraphqlInboundComponentName,',
    '> {',
    '  readonly kind: "component.mutation.accepted";',
    '  readonly entityName: GraphqlProjectedEntityName;',
    '  readonly entityId: string;',
    '  readonly componentName: TComponentName;',
    '  readonly operation: GraphqlComponentMutationOperation;',
    '}',
    '',
  ];
}

function renderGraphqlRequestContract(input: {
  readonly projectedComponents: readonly ContractComponent[];
  readonly requestableComponents: readonly ContractComponent[];
}): string[] {
  return [
    ...renderNameConst(
      'GRAPHQL_REQUESTABLE_COMPONENT_NAMES',
      input.requestableComponents.map((component) =>
        componentToNameEntry(component.descriptor),
      ),
    ),
    'export type GraphqlRequestableComponentName =',
    '  (typeof GRAPHQL_REQUESTABLE_COMPONENT_NAMES)[keyof typeof GRAPHQL_REQUESTABLE_COMPONENT_NAMES];',
    '',
    'export interface GraphqlComponentRequestTarget<',
    '  TComponentName extends GraphqlRequestableComponentName = GraphqlRequestableComponentName,',
    '> {',
    '  readonly mode: GraphqlComponentRequestMode;',
    '  readonly entityName: GraphqlProjectedEntityName;',
    '  readonly entityId?: string;',
    '  readonly componentNames: readonly TComponentName[];',
    '  readonly ownedOnly?: boolean;',
    '  readonly limit?: number;',
    '}',
    '',
    'export interface GraphqlComponentRequestInput {',
    '  readonly targets: readonly GraphqlComponentRequestTarget[];',
    '  readonly requestId?: string;',
    '}',
    '',
    'export type GraphqlComponentEvent = {',
    ...input.projectedComponents.map(renderComponentEventUnionEntry),
    '}[GraphqlProjectedComponentName];',
    '',
    'export type GraphqlRequestableComponentEvent = {',
    ...input.requestableComponents.map(renderComponentEventUnionEntry),
    '}[GraphqlRequestableComponentName];',
    '',
    'export interface GraphqlComponentBatch {',
    '  readonly kind: "component.batch";',
    '  readonly components: readonly GraphqlRequestableComponentEvent[];',
    '}',
    '',
    'export interface GraphqlComponentSubscriptionInput<',
    '  TComponentName extends GraphqlProjectedComponentName = GraphqlProjectedComponentName,',
    '> {',
    '  readonly entityName?: GraphqlProjectedEntityName;',
    '  readonly entityId?: string;',
    '  readonly componentNames?: readonly TComponentName[];',
    '  readonly requestId?: string;',
    '}',
    '',
  ];
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

function renderInboundPayloadByNameEntry(component: ContractComponent): string {
  return `  readonly ${quoteProperty(component.descriptor.name)}: ${renderInboundPayloadType(component)};`;
}

function renderInboundPayloadType(component: ContractComponent): string {
  const fields = component.descriptor.inboundFields;
  if (fields === null) {
    return 'never';
  }
  if (fields.length === 0) {
    return '{ readonly [key: string]: never }';
  }
  const propertyByName = new Map(
    component.shape.properties.map((property) => [property.name, property]),
  );
  return [
    '{',
    ...fields.map((field) => {
      const property = propertyByName.get(field);
      return `    readonly ${quoteProperty(field)}?: ${property?.type ?? 'GraphqlJsonValue'};`;
    }),
    '  }',
  ].join('\n');
}

function renderComponentEventUnionEntry(component: ContractComponent): string {
  const componentName = quoteProperty(component.descriptor.name);
  return [
    `  readonly ${componentName}: {`,
    '    readonly entityName: GraphqlProjectedEntityName;',
    '    readonly entityId: string;',
    '    readonly lifecycle: GraphqlComponentLifecycleKind;',
    `    readonly componentName: ${JSON.stringify(component.descriptor.name)};`,
    `    readonly component: ${component.descriptor.className};`,
    '  };',
  ].join('\n');
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
