import type {
  EbcaRestJsonObject,
  EbcaRestJsonValue,
  EbcaRestMutableJsonObject,
} from '../types/ebca-rest-gateway.contracts';

type SerializableRecord = Record<string, EbcaRestJsonValue | Date | undefined>;

export function cloneMutableEbcaRestJsonObject(
  value: EbcaRestJsonObject,
): EbcaRestMutableJsonObject {
  return Object.fromEntries(Object.entries(value));
}

export function serializeEbcaRestJsonObject(
  value: object,
): EbcaRestJsonObject {
  return serializeEbcaRestJsonValue(value) as EbcaRestJsonObject;
}

export function serializeEbcaRestJsonValue(value: object): EbcaRestJsonValue;
export function serializeEbcaRestJsonValue(
  value: EbcaRestJsonValue | Date | undefined,
): EbcaRestJsonValue;
export function serializeEbcaRestJsonValue(
  value: EbcaRestJsonValue | Date | object | undefined,
): EbcaRestJsonValue {
  if (value === undefined) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map((item) => serializeEbcaRestJsonValue(item));
  }
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value as SerializableRecord).filter(
      ([, entryValue]) => entryValue !== undefined,
    );
    return Object.fromEntries(
      entries.map(([key, entryValue]) => [
        key,
        serializeEbcaRestJsonValue(entryValue),
      ]),
    );
  }
  return value;
}

export function resolveEbcaRestStringList(
  source: EbcaRestJsonObject,
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
