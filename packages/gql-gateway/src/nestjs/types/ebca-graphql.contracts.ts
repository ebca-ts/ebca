import { Field, InputType, ObjectType } from '@nestjs/graphql';
import type {
  EbcaGqlJsonObject,
  EbcaGqlJsonValue,
  EbcaGqlQueryResultPayload,
} from '../../types/ebca-gql-gateway.contracts';
import { EbcaJsonScalar } from '../scalars/ebca-json.scalar';

@InputType()
export class EbcaGraphqlQueryInput {
  @Field(() => String)
  readonly name: string = '';

  @Field(() => EbcaJsonScalar, { nullable: true })
  readonly params?: EbcaGqlJsonObject;

  @Field(() => String, { nullable: true })
  readonly requestId?: string;
}

@ObjectType()
export class EbcaGraphqlQueryResult {
  @Field(() => String)
  readonly kind: 'query.result';

  @Field(() => String)
  readonly name: string;

  @Field(() => EbcaJsonScalar)
  readonly result: EbcaGqlJsonValue;

  constructor(payload: EbcaGqlQueryResultPayload) {
    this.kind = payload.kind;
    this.name = payload.name;
    this.result = payload.result;
  }
}
