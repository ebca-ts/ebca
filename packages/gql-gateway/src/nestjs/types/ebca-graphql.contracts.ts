import { Field, InputType, ObjectType } from '@nestjs/graphql';
import type {
  EbcaGqlComponentMutationOperation,
  EbcaGqlComponentMutationResultPayload,
  EbcaGqlComponentRequestMode,
  EbcaGqlEbcaComponentBatchPayload,
  EbcaGqlEbcaComponentPayload,
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

@InputType()
export class EbcaGraphqlComponentMutationInput {
  @Field(() => String)
  readonly operation: EbcaGqlComponentMutationOperation = 'upsert';

  @Field(() => String)
  readonly entityName: string = '';

  @Field(() => String)
  readonly entityId: string = '';

  @Field(() => String)
  readonly componentName: string = '';

  @Field(() => EbcaJsonScalar, { nullable: true })
  readonly component?: EbcaGqlJsonObject;

  @Field(() => String, { nullable: true })
  readonly requestId?: string;
}

@ObjectType()
export class EbcaGraphqlComponentMutationResult {
  @Field(() => String)
  readonly kind: 'component.mutation.accepted';

  @Field(() => String)
  readonly entityName: string;

  @Field(() => String)
  readonly entityId: string;

  @Field(() => String)
  readonly componentName: string;

  @Field(() => String)
  readonly operation: EbcaGqlComponentMutationOperation;

  constructor(payload: EbcaGqlComponentMutationResultPayload) {
    this.kind = payload.kind;
    this.entityName = payload.entityName;
    this.entityId = payload.entityId;
    this.componentName = payload.componentName;
    this.operation = payload.operation;
  }
}

@InputType()
export class EbcaGraphqlComponentRequestTargetInput {
  @Field(() => String)
  readonly mode: EbcaGqlComponentRequestMode = 'entity';

  @Field(() => String)
  readonly entityName: string = '';

  @Field(() => String, { nullable: true })
  readonly entityId?: string;

  @Field(() => [String])
  readonly componentNames: readonly string[] = [];

  @Field(() => Boolean, { nullable: true })
  readonly ownedOnly?: boolean;

  @Field(() => Number, { nullable: true })
  readonly limit?: number;
}

@InputType()
export class EbcaGraphqlComponentRequestInput {
  @Field(() => [EbcaGraphqlComponentRequestTargetInput])
  readonly targets: readonly EbcaGraphqlComponentRequestTargetInput[] = [];

  @Field(() => String, { nullable: true })
  readonly requestId?: string;
}

@ObjectType()
export class EbcaGraphqlComponentEvent {
  @Field(() => String)
  readonly entityName: string;

  @Field(() => String)
  readonly entityId: string;

  @Field(() => String)
  readonly lifecycle: string;

  @Field(() => String)
  readonly componentName: string;

  @Field(() => EbcaJsonScalar)
  readonly component: EbcaGqlJsonObject;

  constructor(payload: EbcaGqlEbcaComponentPayload) {
    this.entityName = payload.entityName;
    this.entityId = payload.entityId;
    this.lifecycle = payload.lifecycle;
    this.componentName = payload.componentName;
    this.component = payload.component;
  }
}

@ObjectType()
export class EbcaGraphqlComponentBatch {
  @Field(() => String)
  readonly kind: 'component.batch';

  @Field(() => [EbcaGraphqlComponentEvent])
  readonly components: readonly EbcaGraphqlComponentEvent[];

  constructor(payload: EbcaGqlEbcaComponentBatchPayload) {
    this.kind = payload.kind;
    this.components = payload.components.map(
      (component) => new EbcaGraphqlComponentEvent(component),
    );
  }
}

@InputType()
export class EbcaGraphqlComponentSubscriptionInput {
  @Field(() => String, { nullable: true })
  readonly entityName?: string;

  @Field(() => String, { nullable: true })
  readonly entityId?: string;

  @Field(() => [String], { nullable: true })
  readonly componentNames?: readonly string[];

  @Field(() => String, { nullable: true })
  readonly requestId?: string;
}
