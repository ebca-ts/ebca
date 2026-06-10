import type {
  EbcaGqlJsonValue,
  EbcaGqlSerializableValue,
} from '../types/ebca-gql-gateway.contracts';

export function serializeEbcaGqlJsonValue(
  value: EbcaGqlSerializableValue,
): EbcaGqlJsonValue {
  return JSON.parse(JSON.stringify(value)) as EbcaGqlJsonValue;
}
