import type { Type } from '@nestjs/common';
import type { ComponentWebsocketProjectionOptions } from '@ebca/core/types/componens';
import type {
  EbcaGqlComponentLifecycleKind,
  EbcaGqlJsonObject,
  EbcaGqlJsonValue,
} from './ebca-gql-gateway.contracts';

export interface EbcaGqlIdentity {
  readonly identityId: string;
  readonly roles?: readonly string[];
}

export interface EbcaGqlAuthenticatedIdentity {
  readonly identityId: string;
  readonly roles: readonly string[];
}

export interface EbcaGqlQueryExecutionContext {
  readonly identity: EbcaGqlIdentity;
  readonly requestId?: string;
}

export interface EbcaGqlQueryContext {
  readonly identity: EbcaGqlAuthenticatedIdentity;
  readonly requestId: string;
  readonly queryName: string;
}

export interface EbcaGqlGatewayLimits {
  readonly maxComponentRequestTargets: number;
  readonly maxCollectionRows: number;
  readonly collectionEntityIdCacheTtlMs: number;
  readonly maxSubscriptionQueueSize: number;
}

export type EbcaGqlComponentFieldValue = EbcaGqlJsonValue | Date | undefined;

export interface EbcaGqlInboundNormalizerContext {
  readonly identity: EbcaGqlAuthenticatedIdentity;
  readonly entityName: string;
  readonly entityId: string;
  readonly componentName: string;
  readonly field: string;
  readonly currentValue: EbcaGqlComponentFieldValue;
  readonly component: EbcaGqlJsonObject;
}

export interface EbcaGqlInboundNormalizerResult {
  readonly handled: boolean;
  readonly value?: EbcaGqlComponentFieldValue;
}

export interface EbcaGqlInboundNormalizer {
  normalize(
    value: EbcaGqlJsonValue,
    context: EbcaGqlInboundNormalizerContext,
  ): EbcaGqlInboundNormalizerResult;
}

export interface EbcaGqlProjectionContext {
  readonly identityId?: string;
  readonly entityName: string;
  readonly entityId: string;
  readonly componentName: string;
  readonly component: EbcaGqlJsonObject;
  readonly lifecycle?: EbcaGqlComponentLifecycleKind;
  readonly projectionOptions: ComponentWebsocketProjectionOptions;
}

export interface EbcaGqlProjectionPolicyResult {
  readonly handled: boolean;
  readonly allow: boolean;
}

export interface EbcaGqlProjectionPolicy {
  canExpose(
    context: EbcaGqlProjectionContext,
  ): Promise<EbcaGqlProjectionPolicyResult> | EbcaGqlProjectionPolicyResult;
}

export interface EbcaGqlAudienceResolverResult {
  readonly handled: boolean;
  readonly broadcast?: boolean;
  readonly recipientIds?: readonly string[];
}

export interface EbcaGqlAudienceResolver {
  resolveRecipients(
    context: EbcaGqlProjectionContext,
  ): Promise<EbcaGqlAudienceResolverResult> | EbcaGqlAudienceResolverResult;
}

export interface EbcaGqlGatewayModuleOptions {
  readonly defaultRoles?: readonly string[];
  readonly identityEntityName?: string;
  readonly limits?: Partial<EbcaGqlGatewayLimits>;
  readonly inboundNormalizers?: readonly Type<EbcaGqlInboundNormalizer>[];
  readonly projectionPolicies?: readonly Type<EbcaGqlProjectionPolicy>[];
  readonly audienceResolvers?: readonly Type<EbcaGqlAudienceResolver>[];
}

export interface EbcaGqlGatewayResolvedOptions {
  readonly defaultRoles: readonly string[];
  readonly identityEntityName: string | null;
  readonly limits: EbcaGqlGatewayLimits;
}
