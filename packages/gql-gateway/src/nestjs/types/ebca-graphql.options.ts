import type { Type } from '@nestjs/common';
import type {
  EbcaGqlGatewayModuleOptions,
  EbcaGqlIdentity,
} from '../../types/ebca-gql-gateway.options';

export type EbcaGqlNestjsContextValue =
  | string
  | number
  | boolean
  | null
  | object
  | undefined;

export type EbcaGqlNestjsContext = Record<
  string,
  EbcaGqlNestjsContextValue
>;

export interface EbcaGqlNestjsIdentityResolverContext {
  readonly context: EbcaGqlNestjsContext;
  readonly requestId: string;
  readonly operationName: string;
  readonly queryName?: string;
}

export interface EbcaGqlNestjsIdentityResolver {
  resolveIdentity(
    context: EbcaGqlNestjsIdentityResolverContext,
  ): Promise<EbcaGqlIdentity | null> | EbcaGqlIdentity | null;
}

export interface EbcaGqlNestjsModuleOptions {
  readonly identityResolver: Type<EbcaGqlNestjsIdentityResolver>;
  readonly ebca?: EbcaGqlGatewayModuleOptions;
}
