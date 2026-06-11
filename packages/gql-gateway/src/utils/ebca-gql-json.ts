import type {
  EbcaGqlJsonObject,
  EbcaGqlJsonValue,
  EbcaGqlSerializableValue,
} from '../types/ebca-gql-gateway.contracts';

export function serializeEbcaGqlJsonValue(
  value: EbcaGqlSerializableValue,
): EbcaGqlJsonValue {
  return JSON.parse(JSON.stringify(value)) as EbcaGqlJsonValue;
}

export function serializeEbcaGqlJsonObject(value: object): EbcaGqlJsonObject {
  return JSON.parse(JSON.stringify(value)) as EbcaGqlJsonObject;
}

export function cloneMutableEbcaGqlJsonObject(
  value: EbcaGqlJsonObject,
): Record<string, EbcaGqlJsonValue> {
  return Object.fromEntries(Object.entries(value));
}

export function resolveEbcaGqlStringList(
  source: EbcaGqlJsonObject,
  field: string,
): readonly string[] {
  const value = source[field];
  if (typeof value === 'string') {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  return [];
}
