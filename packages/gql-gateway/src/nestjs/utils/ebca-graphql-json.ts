import { Kind } from 'graphql';
import type { ValueNode } from 'graphql';
import type { EbcaGqlJsonValue } from '../../types/ebca-gql-gateway.contracts';

export function parseEbcaGraphqlJsonLiteral(node: ValueNode): EbcaGqlJsonValue {
  if (node.kind === Kind.STRING || node.kind === Kind.ENUM) {
    return node.value;
  }
  if (node.kind === Kind.INT || node.kind === Kind.FLOAT) {
    return Number(node.value);
  }
  if (node.kind === Kind.BOOLEAN) {
    return node.value;
  }
  if (node.kind === Kind.NULL) {
    return null;
  }
  if (node.kind === Kind.LIST) {
    return node.values.map((value) => parseEbcaGraphqlJsonLiteral(value));
  }
  if (node.kind === Kind.OBJECT) {
    const result: Record<string, EbcaGqlJsonValue> = {};
    for (const field of node.fields) {
      result[field.name.value] = parseEbcaGraphqlJsonLiteral(field.value);
    }
    return result;
  }
  throw new Error(`Unsupported EBCA GraphQL JSON literal kind ${node.kind}.`);
}

export function serializeEbcaGraphqlJsonValue(
  value: EbcaGqlJsonValue,
): EbcaGqlJsonValue {
  return JSON.parse(JSON.stringify(value)) as EbcaGqlJsonValue;
}
