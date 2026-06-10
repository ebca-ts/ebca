import { getComponentName, getEntityName } from '@ebca/core/ebca.helpers';
import type {
  EbcaQueryMetadata,
  EbcaQueryParamMetadata,
  EbcaQueryParamScalarValue,
  EbcaQueryParamType,
} from '@ebca/core/types/queries';

export interface WebsocketQueryContract {
  readonly metadata: EbcaQueryMetadata;
  readonly entityName: string;
  readonly componentNames: readonly string[];
}

export function normalizeWebsocketQueryContract(
  metadata: EbcaQueryMetadata,
): WebsocketQueryContract {
  return {
    metadata,
    entityName: getEntityName(metadata.options.entityClass),
    componentNames: metadata.options.components.map((componentClass) =>
      getComponentName(componentClass),
    ),
  };
}

export function renderWebsocketQueryContract(
  queries: readonly WebsocketQueryContract[],
): string[] {
  return [
    ...renderNameConst(
      'WEBSOCKET_QUERY_NAMES',
      queries.map((query) => ({
        key: queryNameToConstantName(query.metadata.options.name),
        value: query.metadata.options.name,
      })),
    ),
    'export type WebsocketQueryName =',
    '  (typeof WEBSOCKET_QUERY_NAMES)[keyof typeof WEBSOCKET_QUERY_NAMES];',
    '',
    'export type WebsocketQueryParamScalarValue = string | number | boolean | null;',
    '',
    'export type WebsocketQueryParamValue =',
    '  | WebsocketQueryParamScalarValue',
    '  | WebsocketQueryParamScalarValue[];',
    '',
    'export interface WebsocketQueryParamContract {',
    '  readonly name: string;',
    '  readonly type: "string" | "number" | "boolean" | "date";',
    '  readonly required: boolean;',
    '  readonly array: boolean;',
    '  readonly min?: number;',
    '  readonly max?: number;',
    '  readonly default?: WebsocketQueryParamValue;',
    '  readonly values?: readonly WebsocketQueryParamValue[];',
    '}',
    '',
    'export interface WebsocketQueryContract<',
    '  TQueryName extends WebsocketQueryName = WebsocketQueryName,',
    '> {',
    '  readonly name: TQueryName;',
    '  readonly entityName: WebsocketProjectedEntityName;',
    '  readonly componentNames: readonly string[];',
    '  readonly params: readonly WebsocketQueryParamContract[];',
    '}',
    '',
    'export const WEBSOCKET_QUERIES = {',
    ...queries.map(renderQueryMetadataEntry),
    '} as const;',
    '',
    'export interface WebsocketQueryParamsByName {',
    ...queries.map(renderQueryParamsByNameEntry),
    '}',
    '',
    'export interface WebsocketQueryResultByName {',
    ...queries.map(
      (query) =>
        `  readonly ${quoteProperty(query.metadata.options.name)}: WebsocketJsonValue;`,
    ),
    '}',
    '',
    'export interface WebsocketQueryPayload<',
    '  TQueryName extends WebsocketQueryName = WebsocketQueryName,',
    '> {',
    '  readonly name: TQueryName;',
    '  readonly params?: WebsocketQueryParamsByName[TQueryName];',
    '}',
    '',
    'export interface WebsocketQueryResultPayload<',
    '  TQueryName extends WebsocketQueryName = WebsocketQueryName,',
    '> {',
    '  readonly kind: "query.result";',
    '  readonly name: TQueryName;',
    '  readonly result: WebsocketQueryResultByName[TQueryName];',
    '}',
    '',
    'const websocketQueryNameValues: readonly string[] = Object.values(',
    '  WEBSOCKET_QUERY_NAMES,',
    ');',
    '',
    'export function isWebsocketQueryName(',
    '  value: string,',
    '): value is WebsocketQueryName {',
    '  return websocketQueryNameValues.some((name) => name === value);',
    '}',
    '',
  ];
}

function renderQueryMetadataEntry(query: WebsocketQueryContract): string {
  const name = query.metadata.options.name;
  const params = query.metadata.params.map(renderQueryParamMetadata).join(', ');
  return [
    `  ${queryNameToConstantName(name)}: {`,
    `    name: ${JSON.stringify(name)},`,
    `    entityName: ${JSON.stringify(query.entityName)},`,
    `    componentNames: [${query.componentNames.map((value) => JSON.stringify(value)).join(', ')}],`,
    `    params: [${params}],`,
    '  },',
  ].join('\n');
}

function renderQueryParamMetadata(param: EbcaQueryParamMetadata): string {
  const entries = [
    `name: ${JSON.stringify(param.propertyName)}`,
    `type: ${JSON.stringify(param.options.type)}`,
    `required: ${param.options.required ? 'true' : 'false'}`,
    `array: ${param.options.array ? 'true' : 'false'}`,
  ];
  if (param.options.min !== undefined) {
    entries.push(`min: ${param.options.min}`);
  }
  if (param.options.max !== undefined) {
    entries.push(`max: ${param.options.max}`);
  }
  if (param.options.default !== undefined) {
    entries.push(`default: ${renderQueryParamValue(param.options.default)}`);
  }
  if (param.options.values !== undefined) {
    entries.push(`values: ${renderQueryParamValue(param.options.values)}`);
  }
  return `{ ${entries.join(', ')} }`;
}

function renderQueryParamsByNameEntry(query: WebsocketQueryContract): string {
  const params = query.metadata.params;
  if (params.length === 0) {
    return `  readonly ${quoteProperty(query.metadata.options.name)}: WebsocketJsonObject;`;
  }
  return [
    `  readonly ${quoteProperty(query.metadata.options.name)}: {`,
    ...params.map(
      (param) =>
        `    readonly ${param.propertyName}${param.options.required ? '' : '?'}: ${renderQueryParamType(param)};`,
    ),
    '  };',
  ].join('\n');
}

function renderQueryParamType(param: EbcaQueryParamMetadata): string {
  const scalarType = renderQueryParamScalarType(param.options.type);
  return param.options.array ? `${scalarType}[]` : scalarType;
}

function renderQueryParamScalarType(type: EbcaQueryParamType): string {
  if (type === 'date') {
    return 'string | number';
  }
  return type;
}

function renderQueryParamValue(
  value: EbcaQueryParamScalarValue | readonly EbcaQueryParamScalarValue[],
): string {
  if (isQueryParamValueArray(value)) {
    return `[${value.map(renderScalarQueryParamValue).join(', ')}]`;
  }
  return renderScalarQueryParamValue(value);
}

function isQueryParamValueArray(
  value: EbcaQueryParamScalarValue | readonly EbcaQueryParamScalarValue[],
): value is readonly EbcaQueryParamScalarValue[] {
  return Array.isArray(value);
}

function renderScalarQueryParamValue(value: EbcaQueryParamScalarValue): string {
  if (value instanceof Date) {
    return JSON.stringify(value.toISOString());
  }
  return JSON.stringify(value);
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

function quoteProperty(value: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value)
    ? value
    : JSON.stringify(value);
}

function queryNameToConstantName(queryName: string): string {
  return toConstantName(queryName.replace(/[^A-Za-z0-9]+/g, '_'));
}

function toConstantName(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}
