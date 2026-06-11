import { DynamicModule, Module, Provider, Type } from '@nestjs/common';
import {
  EBCA_GQL_AUDIENCE_RESOLVERS,
  EBCA_GQL_GATEWAY_OPTIONS,
  EBCA_GQL_INBOUND_NORMALIZERS,
  EBCA_GQL_PROJECTION_POLICIES,
} from './tokens';
import { EbcaGqlComponentMutationService } from './services/ebca-gql-component-mutation.service';
import { EbcaGqlComponentRequestService } from './services/ebca-gql-component-request.service';
import { EbcaGqlProjectionService } from './services/ebca-gql-projection.service';
import { EbcaGqlQueryService } from './services/ebca-gql-query.service';
import { EbcaGqlSubscriptionRegistryService } from './services/ebca-gql-subscription-registry.service';
import type {
  EbcaGqlAudienceResolver,
  EbcaGqlGatewayModuleOptions,
  EbcaGqlGatewayResolvedOptions,
  EbcaGqlGatewayLimits,
  EbcaGqlInboundNormalizer,
  EbcaGqlProjectionPolicy,
} from './types/ebca-gql-gateway.options';

const defaultLimits: EbcaGqlGatewayLimits = {
  maxComponentRequestTargets: 300,
  maxCollectionRows: 1000,
  collectionEntityIdCacheTtlMs: 15_000,
  maxSubscriptionQueueSize: 1000,
};

@Module({})
export class EbcaGqlGatewayModule {
  static forRoot(options: EbcaGqlGatewayModuleOptions = {}): DynamicModule {
    const resolvedOptions = this.resolveOptions(options);
    const inboundNormalizers = options.inboundNormalizers ?? [];
    const projectionPolicies = options.projectionPolicies ?? [];
    const audienceResolvers = options.audienceResolvers ?? [];
    const providers: Provider[] = [
      {
        provide: EBCA_GQL_GATEWAY_OPTIONS,
        useValue: resolvedOptions,
      },
      ...inboundNormalizers,
      ...projectionPolicies,
      ...audienceResolvers,
      this.createListProvider<EbcaGqlInboundNormalizer>(
        EBCA_GQL_INBOUND_NORMALIZERS,
        inboundNormalizers,
      ),
      this.createListProvider<EbcaGqlProjectionPolicy>(
        EBCA_GQL_PROJECTION_POLICIES,
        projectionPolicies,
      ),
      this.createListProvider<EbcaGqlAudienceResolver>(
        EBCA_GQL_AUDIENCE_RESOLVERS,
        audienceResolvers,
      ),
      EbcaGqlComponentMutationService,
      EbcaGqlComponentRequestService,
      EbcaGqlProjectionService,
      EbcaGqlQueryService,
      EbcaGqlSubscriptionRegistryService,
    ];
    return {
      module: EbcaGqlGatewayModule,
      providers,
      exports: [
        EBCA_GQL_GATEWAY_OPTIONS,
        EbcaGqlComponentMutationService,
        EbcaGqlComponentRequestService,
        EbcaGqlProjectionService,
        EbcaGqlQueryService,
        EbcaGqlSubscriptionRegistryService,
      ],
    };
  }

  private static resolveOptions(
    options: EbcaGqlGatewayModuleOptions,
  ): EbcaGqlGatewayResolvedOptions {
    return {
      defaultRoles: options.defaultRoles ?? [],
      identityEntityName: options.identityEntityName ?? null,
      limits: {
        ...defaultLimits,
        ...options.limits,
      },
    };
  }

  private static createListProvider<T extends object>(
    provide: symbol,
    providers: readonly Type<T>[],
  ): Provider {
    return {
      provide,
      useFactory: (...items: T[]) => items,
      inject: [...providers],
    };
  }
}
