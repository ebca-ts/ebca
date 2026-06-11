import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export type EbcaRestJsonValue =
  | string
  | number
  | boolean
  | null
  | EbcaRestJsonObject
  | readonly EbcaRestJsonValue[];

export type EbcaRestJsonObject = {
  readonly [key: string]: EbcaRestJsonValue;
};

export type EbcaRestMutableJsonObject = {
  [key: string]: EbcaRestJsonValue;
};

export type EbcaRestComponentMutationOperation =
  | 'add'
  | 'update'
  | 'upsert'
  | 'remove';

export class EbcaRestComponentMutationBody {
  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    description: 'Component fields to hydrate before writing.',
  })
  readonly component?: EbcaRestJsonObject;
}

export class EbcaRestComponentMutationResponse {
  @ApiProperty()
  readonly kind: 'component.mutation.accepted';

  @ApiProperty()
  readonly entityName: string;

  @ApiProperty()
  readonly entityId: string;

  @ApiProperty()
  readonly componentName: string;

  @ApiProperty()
  readonly operation: EbcaRestComponentMutationOperation;
}

export class EbcaRestQueryBody {
  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    description: 'Query params matched against @EbcaQueryParam metadata.',
  })
  readonly params?: EbcaRestJsonObject;
}

export class EbcaRestQueryResponse {
  @ApiProperty()
  readonly kind: 'query.result';

  @ApiProperty()
  readonly name: string;

  @ApiProperty({
    oneOf: [
      { type: 'string' },
      { type: 'number' },
      { type: 'boolean' },
      { type: 'object' },
      { type: 'array', items: {} },
    ],
    nullable: true,
  })
  readonly result: EbcaRestJsonValue;
}

export interface EbcaRestComponentMutationPayload {
  readonly entityName: string;
  readonly entityId: string;
  readonly componentName: string;
  readonly operation: EbcaRestComponentMutationOperation;
  readonly component?: EbcaRestJsonObject;
}

export interface EbcaRestQueryPayload {
  readonly name: string;
  readonly params?: EbcaRestJsonObject;
}

export interface EbcaRestQueryResultPayload {
  readonly kind: 'query.result';
  readonly name: string;
  readonly result: EbcaRestJsonValue;
}

export interface EbcaRestMetaQueryParam {
  readonly name: string;
  readonly type: string;
  readonly required: boolean;
  readonly array: boolean;
}

export interface EbcaRestMetaQuery {
  readonly name: string;
  readonly repositoryName: string;
  readonly params: readonly EbcaRestMetaQueryParam[];
}

export interface EbcaRestMetaInboundComponent {
  readonly entityName: string;
  readonly componentName: string;
  readonly operations: readonly EbcaRestComponentMutationOperation[];
  readonly fields: readonly string[];
}

export interface EbcaRestMetaResponse {
  readonly queries: readonly EbcaRestMetaQuery[];
  readonly inboundComponents: readonly EbcaRestMetaInboundComponent[];
}
