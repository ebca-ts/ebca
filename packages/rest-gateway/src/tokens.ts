import type {
  EbcaRestAuthAdapter,
  EbcaRestGatewayResolvedOptions,
  EbcaRestInboundNormalizer,
} from './types/ebca-rest-gateway.options';

export const EBCA_REST_GATEWAY_OPTIONS = Symbol('EBCA_REST_GATEWAY_OPTIONS');
export const EBCA_REST_AUTH_ADAPTER = Symbol('EBCA_REST_AUTH_ADAPTER');
export const EBCA_REST_INBOUND_NORMALIZERS = Symbol(
  'EBCA_REST_INBOUND_NORMALIZERS',
);

export type EbcaRestGatewayOptionsToken = EbcaRestGatewayResolvedOptions;
export type EbcaRestAuthAdapterToken = EbcaRestAuthAdapter;
export type EbcaRestInboundNormalizersToken =
  readonly EbcaRestInboundNormalizer[];
