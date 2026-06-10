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

export interface EbcaGqlGatewayModuleOptions {
  readonly defaultRoles?: readonly string[];
}

export interface EbcaGqlGatewayResolvedOptions {
  readonly defaultRoles: readonly string[];
}
