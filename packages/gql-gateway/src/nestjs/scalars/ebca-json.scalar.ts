import { Scalar } from '@nestjs/graphql';
import type { CustomScalar } from '@nestjs/graphql';
import type { ValueNode } from 'graphql';
import type { EbcaGqlJsonValue } from '../../types/ebca-gql-gateway.contracts';
import {
  parseEbcaGraphqlJsonLiteral,
  serializeEbcaGraphqlJsonValue,
} from '../utils/ebca-graphql-json';

@Scalar('EbcaJson')
export class EbcaJsonScalar
  implements CustomScalar<EbcaGqlJsonValue, EbcaGqlJsonValue>
{
  readonly description = 'EBCA JSON scalar';

  parseValue(value: EbcaGqlJsonValue): EbcaGqlJsonValue {
    return serializeEbcaGraphqlJsonValue(value);
  }

  serialize(value: EbcaGqlJsonValue): EbcaGqlJsonValue {
    return serializeEbcaGraphqlJsonValue(value);
  }

  parseLiteral(node: ValueNode): EbcaGqlJsonValue {
    return parseEbcaGraphqlJsonLiteral(node);
  }
}
