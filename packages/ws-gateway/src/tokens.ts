import type { EbcaWsGatewayBase } from './ebca-ws.gateway';
import type {
  EbcaWsAudienceResolver,
  EbcaWsAuthAdapter,
  EbcaWsGatewayResolvedOptions,
  EbcaWsInboundNormalizer,
  EbcaWsProjectionPolicy,
} from './types/ebca-ws-gateway.options';

export const EBCA_WS_GATEWAY_OPTIONS = Symbol('ebca_ws_gateway_options');
export const EBCA_WS_AUTH_ADAPTER = Symbol('ebca_ws_auth_adapter');
export const EBCA_WS_INBOUND_NORMALIZERS = Symbol(
  'ebca_ws_inbound_normalizers',
);
export const EBCA_WS_PROJECTION_POLICIES = Symbol(
  'ebca_ws_projection_policies',
);
export const EBCA_WS_AUDIENCE_RESOLVERS = Symbol('ebca_ws_audience_resolvers');
export const EBCA_WS_GATEWAY_EMITTER = Symbol('ebca_ws_gateway_emitter');

export type EbcaWsGatewayOptionsToken = EbcaWsGatewayResolvedOptions;
export type EbcaWsAuthAdapterToken = EbcaWsAuthAdapter;
export type EbcaWsInboundNormalizersToken = readonly EbcaWsInboundNormalizer[];
export type EbcaWsProjectionPoliciesToken = readonly EbcaWsProjectionPolicy[];
export type EbcaWsAudienceResolversToken = readonly EbcaWsAudienceResolver[];
export type EbcaWsGatewayEmitterToken = EbcaWsGatewayBase;
