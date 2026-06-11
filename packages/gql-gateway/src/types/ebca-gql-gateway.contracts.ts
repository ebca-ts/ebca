export type EbcaGqlJsonValue =
  | string
  | number
  | boolean
  | null
  | EbcaGqlJsonObject
  | readonly EbcaGqlJsonValue[];

export type EbcaGqlJsonObject = {
  readonly [key: string]: EbcaGqlJsonValue;
};

export type EbcaGqlSerializableValue =
  | string
  | number
  | boolean
  | null
  | Date
  | EbcaGqlSerializableObject
  | readonly EbcaGqlSerializableValue[];

export type EbcaGqlSerializableObject = {
  readonly [key: string]: EbcaGqlSerializableValue | undefined;
};

export type EbcaGqlComponentLifecycleKind = 'added' | 'updated' | 'removed';

export type EbcaGqlComponentMutationOperation =
  | 'add'
  | 'update'
  | 'upsert'
  | 'remove';

export interface EbcaGqlComponentMutationPayload {
  readonly operation: EbcaGqlComponentMutationOperation;
  readonly entityName: string;
  readonly entityId: string;
  readonly componentName: string;
  readonly component?: EbcaGqlJsonObject;
}

export interface EbcaGqlComponentMutationResultPayload {
  readonly kind: 'component.mutation.accepted';
  readonly entityName: string;
  readonly entityId: string;
  readonly componentName: string;
  readonly operation: EbcaGqlComponentMutationOperation;
}

export type EbcaGqlComponentRequestMode = 'entity' | 'collection';

export interface EbcaGqlComponentRequestTarget {
  readonly mode: EbcaGqlComponentRequestMode;
  readonly entityName: string;
  readonly entityId?: string;
  readonly componentNames: readonly string[];
  readonly ownedOnly?: boolean;
  readonly limit?: number;
}

export interface EbcaGqlRequestComponentsPayload {
  readonly targets: readonly EbcaGqlComponentRequestTarget[];
}

export interface EbcaGqlEbcaComponentPayload {
  readonly entityName: string;
  readonly entityId: string;
  readonly lifecycle: EbcaGqlComponentLifecycleKind;
  readonly componentName: string;
  readonly component: EbcaGqlJsonObject;
}

export interface EbcaGqlEbcaComponentBatchPayload {
  readonly kind: 'component.batch';
  readonly components: readonly EbcaGqlEbcaComponentPayload[];
}

export interface EbcaGqlComponentSubscriptionPayload {
  readonly entityName?: string;
  readonly entityId?: string;
  readonly componentNames?: readonly string[];
}

export interface EbcaGqlQueryPayload {
  readonly name: string;
  readonly params?: EbcaGqlJsonObject;
}

export interface EbcaGqlQueryResultPayload {
  readonly kind: 'query.result';
  readonly name: string;
  readonly result: EbcaGqlJsonValue;
}
