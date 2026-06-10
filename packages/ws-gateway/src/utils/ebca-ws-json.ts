import type {
  EbcaWsJsonObject,
  EbcaWsJsonValue,
  EbcaWsMutableJsonObject,
} from '../types/ebca-ws-gateway.contracts';

export function serializeEbcaWsJsonObject(value: object): EbcaWsJsonObject {
  return JSON.parse(JSON.stringify(value)) as EbcaWsJsonObject;
}

export function serializeEbcaWsJsonValue(
  value: EbcaWsJsonValue,
): EbcaWsJsonValue {
  return JSON.parse(JSON.stringify(value)) as EbcaWsJsonValue;
}

export function isEbcaWsJsonObject(
  value: EbcaWsJsonValue | undefined,
): value is EbcaWsJsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function cloneMutableEbcaWsJsonObject(
  value: EbcaWsJsonObject,
): EbcaWsMutableJsonObject {
  const result: EbcaWsMutableJsonObject = {};
  for (const [key, item] of Object.entries(value)) {
    result[key] = item;
  }
  return result;
}

export function resolveEbcaWsPath(
  source: EbcaWsJsonObject,
  path: string,
): EbcaWsJsonValue | undefined {
  let current: EbcaWsJsonValue | undefined = source;
  for (const segment of path.split('.')) {
    if (!isEbcaWsJsonObject(current)) {
      return undefined;
    }
    current = current[segment];
  }
  return current;
}

export function resolveEbcaWsStringList(
  source: EbcaWsJsonObject,
  path: string,
): string[] {
  const value = resolveEbcaWsPath(source, path);
  if (typeof value === 'string' && value.length > 0) {
    return [value];
  }
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (item): item is string => typeof item === 'string' && item.length > 0,
  );
}
