import type { Type } from '@nestjs/common';
import type { ComponentWebsocketProjectionOptions } from '@ebca/core/types/componens';
import type {
  EbcaWsComponentLifecycleKind,
  EbcaWsJsonObject,
  EbcaWsJsonValue,
} from './ebca-ws-gateway.contracts';

export interface EbcaWsGatewayEventNames {
  readonly hello: string;
  readonly component: string;
  readonly componentRequest: string;
  readonly query: string;
  readonly serverEvent: string;
  readonly serverError: string;
}

export interface EbcaWsGatewayLimits {
  readonly maxComponentRequestTargets: number;
  readonly maxCollectionRows: number;
  readonly collectionEntityIdCacheTtlMs: number;
}

export interface EbcaWsAuthContext {
  readonly clientId: string;
  readonly token: string | null;
  readonly auth: Record<string, string | readonly string[] | undefined>;
  readonly headers: Record<string, string | readonly string[] | undefined>;
}

export interface EbcaWsIdentity {
  readonly identityId: string;
  readonly roles?: readonly string[];
}

export interface EbcaWsAuthenticatedIdentity {
  readonly identityId: string;
  readonly roles: readonly string[];
}

export interface EbcaWsAuthAdapter {
  resolveIdentity(
    context: EbcaWsAuthContext,
  ): Promise<EbcaWsIdentity | null> | EbcaWsIdentity | null;
}

export type EbcaWsComponentFieldValue = EbcaWsJsonValue | Date | undefined;

export interface EbcaWsInboundNormalizerContext {
  readonly identity: EbcaWsAuthenticatedIdentity;
  readonly entityName: string;
  readonly entityId: string;
  readonly componentName: string;
  readonly field: string;
  readonly currentValue: EbcaWsComponentFieldValue;
  readonly component: EbcaWsJsonObject;
}

export interface EbcaWsInboundNormalizerResult {
  readonly handled: boolean;
  readonly value?: EbcaWsComponentFieldValue;
}

export interface EbcaWsInboundNormalizer {
  normalize(
    value: EbcaWsJsonValue,
    context: EbcaWsInboundNormalizerContext,
  ): EbcaWsInboundNormalizerResult;
}

export interface EbcaWsProjectionContext {
  readonly identityId?: string;
  readonly entityName: string;
  readonly entityId: string;
  readonly componentName: string;
  readonly component: EbcaWsJsonObject;
  readonly lifecycle?: EbcaWsComponentLifecycleKind;
  readonly projectionOptions: ComponentWebsocketProjectionOptions;
}

export interface EbcaWsProjectionPolicyResult {
  readonly handled: boolean;
  readonly allow: boolean;
}

export interface EbcaWsProjectionPolicy {
  canExpose(
    context: EbcaWsProjectionContext,
  ): Promise<EbcaWsProjectionPolicyResult> | EbcaWsProjectionPolicyResult;
}

export interface EbcaWsAudienceResolverResult {
  readonly handled: boolean;
  readonly broadcast?: boolean;
  readonly recipientIds?: readonly string[];
}

export interface EbcaWsAudienceResolver {
  resolveRecipients(
    context: EbcaWsProjectionContext,
  ): Promise<EbcaWsAudienceResolverResult> | EbcaWsAudienceResolverResult;
}

export interface EbcaWsQueryContext {
  readonly identity: EbcaWsAuthenticatedIdentity;
  readonly requestId: string;
  readonly queryName: string;
}

export interface EbcaWsGatewayModuleOptions {
  readonly namespace?: string;
  readonly corsOrigin?: boolean | string | readonly string[];
  readonly identityField?: string;
  readonly identityEntityName?: string;
  readonly identityRoomPrefix?: string;
  readonly broadcastIdentityId?: string;
  readonly defaultRoles?: readonly string[];
  readonly eventNames?: Partial<EbcaWsGatewayEventNames>;
  readonly limits?: Partial<EbcaWsGatewayLimits>;
  readonly authAdapter: Type<EbcaWsAuthAdapter>;
  readonly inboundNormalizers?: readonly Type<EbcaWsInboundNormalizer>[];
  readonly projectionPolicies?: readonly Type<EbcaWsProjectionPolicy>[];
  readonly audienceResolvers?: readonly Type<EbcaWsAudienceResolver>[];
}

export interface EbcaWsGatewayResolvedOptions {
  readonly namespace: string;
  readonly corsOrigin: boolean | string | readonly string[];
  readonly identityField: string;
  readonly identityEntityName: string | null;
  readonly identityRoomPrefix: string;
  readonly broadcastIdentityId: string;
  readonly defaultRoles: readonly string[];
  readonly eventNames: EbcaWsGatewayEventNames;
  readonly limits: EbcaWsGatewayLimits;
}
