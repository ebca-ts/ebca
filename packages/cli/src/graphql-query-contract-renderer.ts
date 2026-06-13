import { getComponentName, getEntityName } from '@ebca/core/ebca.helpers';
import type {
  EbcaQueryMetadata,
  EbcaQueryParamMetadata,
  EbcaQueryParamScalarValue,
  EbcaQueryParamType,
} from '@ebca/core/types/queries';

export interface GraphqlQueryContract {
  readonly metadata: EbcaQueryMetadata;
  readonly entityName: string;
  readonly componentNames: readonly string[];
}

export function normalizeGraphqlQueryContract(
  metadata: EbcaQueryMetadata,
): GraphqlQueryContract {
  return {
    metadata,
    entityName: getEntityName(metadata.options.entityClass),
    componentNames: metadata.options.components.map((componentClass) =>
      getComponentName(componentClass),
    ),
  };
}

export function renderGraphqlQueryContract(
  queries: readonly GraphqlQueryContract[],
): string[] {
  const queryNameEntries = createQueryNameEntries(queries);
  return [
    ...renderNameConst(
      'GRAPHQL_QUERY_NAMES',
      queryNameEntries,
    ),
    'export type GraphqlQueryName =',
    '  (typeof GRAPHQL_QUERY_NAMES)[keyof typeof GRAPHQL_QUERY_NAMES];',
    '',
    'export type GraphqlQueryParamScalarValue = string | number | boolean | null;',
    '',
    'export type GraphqlQueryParamValue =',
    '  | GraphqlQueryParamScalarValue',
    '  | GraphqlQueryParamScalarValue[];',
    '',
    'export interface GraphqlQueryParamContract {',
    '  readonly name: string;',
    '  readonly type: "string" | "number" | "boolean" | "date";',
    '  readonly required: boolean;',
    '  readonly array: boolean;',
    '  readonly min?: number;',
    '  readonly max?: number;',
    '  readonly default?: GraphqlQueryParamValue;',
    '  readonly values?: readonly GraphqlQueryParamValue[];',
    '}',
    '',
    'export interface GraphqlQueryContract<',
    '  TQueryName extends GraphqlQueryName = GraphqlQueryName,',
    '> {',
    '  readonly name: TQueryName;',
    '  readonly entityName: GraphqlProjectedEntityName;',
    '  readonly componentNames: readonly string[];',
    '  readonly params: readonly GraphqlQueryParamContract[];',
    '}',
    '',
    'export const GRAPHQL_QUERIES = {',
    ...queries.map(renderQueryMetadataEntry),
    '} as const;',
    '',
    'export interface GraphqlQueryParamsByName {',
    ...queries.map(renderQueryParamsByNameEntry),
    '}',
    '',
    'export interface GraphqlQueryResultByName {',
    ...queries.map(
      (query) =>
        `  readonly ${quoteProperty(query.metadata.options.name)}: GraphqlJsonValue;`,
    ),
    '}',
    '',
    'export interface GraphqlQueryHasRequiredParamsByName {',
    ...queries.map(renderQueryHasRequiredParamsByNameEntry),
    '}',
    '',
    'export type GraphqlQueryInput<',
    '  TQueryName extends GraphqlQueryName = GraphqlQueryName,',
    '> = TQueryName extends GraphqlQueryName',
    '  ? {',
    '      readonly name: TQueryName;',
    '      readonly requestId?: string;',
    '    } & (GraphqlQueryHasRequiredParamsByName[TQueryName] extends true',
    '      ? { readonly params: GraphqlQueryParamsByName[TQueryName] }',
    '      : { readonly params?: GraphqlQueryParamsByName[TQueryName] })',
    '  : never;',
    '',
    'export interface GraphqlQueryResult<',
    '  TQueryName extends GraphqlQueryName = GraphqlQueryName,',
    '> {',
    '  readonly kind: "query.result";',
    '  readonly name: TQueryName;',
    '  readonly result: GraphqlQueryResultByName[TQueryName];',
    '}',
    '',
    'const graphqlQueryNameValues: readonly string[] = Object.values(',
    '  GRAPHQL_QUERY_NAMES,',
    ');',
    '',
    'export function isGraphqlQueryName(',
    '  value: string,',
    '): value is GraphqlQueryName {',
    '  return graphqlQueryNameValues.some((name) => name === value);',
    '}',
    '',
  ];
}

function renderQueryMetadataEntry(query: GraphqlQueryContract): string {
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

function renderQueryParamsByNameEntry(query: GraphqlQueryContract): string {
  const params = query.metadata.params;
  if (params.length === 0) {
    return `  readonly ${quoteProperty(query.metadata.options.name)}: GraphqlJsonObject;`;
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

function renderQueryHasRequiredParamsByNameEntry(
  query: GraphqlQueryContract,
): string {
  const hasRequiredParams = query.metadata.params.some(
    (param) => param.options.required,
  );
  return `  readonly ${quoteProperty(query.metadata.options.name)}: ${hasRequiredParams ? 'true' : 'false'};`;
}

function renderQueryParamType(param: EbcaQueryParamMetadata): string {
  const scalarType = renderQueryParamScalarType(param.options.type);
  return param.options.array ? `Array<${scalarType}>` : scalarType;
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

function createQueryNameEntries(
  queries: readonly GraphqlQueryContract[],
): Array<{ readonly key: string; readonly value: string }> {
  const usedKeys = new Set<string>();
  return queries.map((query) => {
    const baseKey = queryNameToConstantName(query.metadata.options.name);
    let key = baseKey;
    let suffix = 2;
    while (usedKeys.has(key)) {
      key = `${baseKey}_${suffix}`;
      suffix += 1;
    }
    usedKeys.add(key);
    return {
      key,
      value: query.metadata.options.name,
    };
  });
}

function quoteProperty(value: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value)
    ? value
    : JSON.stringify(value);
}

function queryNameToConstantName(queryName: string): string {
  const key = toConstantName(queryName.replace(/[^A-Za-z0-9]+/g, '_'));
  if (!key) {
    return 'QUERY';
  }
  return /^[0-9]/.test(key) ? `_${key}` : key;
}

function toConstantName(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}
