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

export interface EbcaGqlQueryPayload {
  readonly name: string;
  readonly params?: EbcaGqlJsonObject;
}

export interface EbcaGqlQueryResultPayload {
  readonly kind: 'query.result';
  readonly name: string;
  readonly result: EbcaGqlJsonValue;
}
