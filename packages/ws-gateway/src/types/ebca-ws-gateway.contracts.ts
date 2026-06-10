export type EbcaWsJsonValue =
  | string
  | number
  | boolean
  | null
  | EbcaWsJsonObject
  | readonly EbcaWsJsonValue[];

export type EbcaWsJsonObject = {
  readonly [key: string]: EbcaWsJsonValue;
};

export type EbcaWsMutableJsonObject = {
  [key: string]: EbcaWsJsonValue;
};

export type EbcaWsComponentLifecycleKind = 'added' | 'updated' | 'removed';

export type EbcaWsComponentMutationOperation =
  | 'add'
  | 'update'
  | 'upsert'
  | 'remove';

export interface EbcaWsClientHelloPayload {
  readonly requestId?: string;
  readonly [key: string]: string | undefined;
}

export interface EbcaWsComponentMutationPayload {
  readonly operation: EbcaWsComponentMutationOperation;
  readonly entityName: string;
  readonly entityId: string;
  readonly componentName: string;
  readonly component?: EbcaWsJsonObject;
}

export type EbcaWsComponentRequestMode = 'entity' | 'collection';

export interface EbcaWsComponentRequestTarget {
  readonly mode: EbcaWsComponentRequestMode;
  readonly entityName: string;
  readonly entityId?: string;
  readonly componentNames: readonly string[];
  readonly ownedOnly?: boolean;
  readonly limit?: number;
}

export interface EbcaWsRequestComponentsPayload {
  readonly targets: readonly EbcaWsComponentRequestTarget[];
}

export interface EbcaWsQueryPayload {
  readonly name: string;
  readonly params?: EbcaWsJsonObject;
}

export interface EbcaWsClientEnvelope<
  TPayload extends object = EbcaWsJsonObject,
> {
  readonly requestId: string;
  readonly type: string;
  readonly payload: TPayload;
  readonly [key: string]: string | TPayload;
}

export interface EbcaWsEbcaComponentPayload {
  readonly entityName: string;
  readonly entityId: string;
  readonly lifecycle: EbcaWsComponentLifecycleKind;
  readonly componentName: string;
  readonly component: EbcaWsJsonObject;
}

export interface EbcaWsEbcaComponentBatchPayload {
  readonly kind: 'component.batch';
  readonly components: readonly EbcaWsEbcaComponentPayload[];
}

export interface EbcaWsQueryResultPayload {
  readonly kind: 'query.result';
  readonly name: string;
  readonly result: EbcaWsJsonValue;
}

export type EbcaWsOutboundPayload =
  | EbcaWsEbcaComponentPayload
  | EbcaWsEbcaComponentBatchPayload
  | EbcaWsQueryResultPayload;

export interface EbcaWsOutboundEnvelope {
  readonly eventId: string;
  readonly type: string;
  readonly emittedAt: string;
  readonly requestId?: string;
  readonly payload: EbcaWsOutboundPayload;
  [key: string]: string | EbcaWsOutboundPayload | undefined;
}

export interface EbcaWsErrorPayload {
  readonly requestId?: string;
  readonly code: string;
  readonly message: string;
}
