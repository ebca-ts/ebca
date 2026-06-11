import type { Type } from '@nestjs/common';
import type { EbcaRestJsonValue } from './ebca-rest-gateway.contracts';

export interface EbcaRestIdentity {
  readonly identityId: string;
  readonly roles?: readonly string[];
}

export interface EbcaRestAuthenticatedIdentity {
  readonly identityId: string;
  readonly roles: readonly string[];
}

export interface EbcaRestHttpRequest {
  readonly headers: Record<string, string | readonly string[] | undefined>;
}

export interface EbcaRestAuthContext {
  readonly request: EbcaRestHttpRequest;
}

export interface EbcaRestAuthAdapter {
  resolveIdentity(
    context: EbcaRestAuthContext,
  ): Promise<EbcaRestIdentity | null> | EbcaRestIdentity | null;
}

export type EbcaRestComponentFieldValue = EbcaRestJsonValue | Date | undefined;

export interface EbcaRestInboundNormalizerContext {
  readonly identity: EbcaRestAuthenticatedIdentity;
  readonly entityName: string;
  readonly entityId: string;
  readonly componentName: string;
  readonly field: string;
  readonly currentValue: EbcaRestComponentFieldValue;
}

export interface EbcaRestInboundNormalizerResult {
  readonly handled: boolean;
  readonly value?: EbcaRestComponentFieldValue;
}

export interface EbcaRestInboundNormalizer {
  normalize(
    value: EbcaRestJsonValue,
    context: EbcaRestInboundNormalizerContext,
  ): EbcaRestInboundNormalizerResult;
}

export interface EbcaRestQueryContext {
  readonly identity: EbcaRestAuthenticatedIdentity;
  readonly requestId: string;
  readonly queryName: string;
}

export interface EbcaRestGatewayModuleOptions {
  readonly defaultIdentityId?: string;
  readonly defaultRoles?: readonly string[];
  readonly authAdapter?: Type<EbcaRestAuthAdapter>;
  readonly inboundNormalizers?: readonly Type<EbcaRestInboundNormalizer>[];
}

export interface EbcaRestGatewayResolvedOptions {
  readonly defaultIdentityId: string;
  readonly defaultRoles: readonly string[];
}
