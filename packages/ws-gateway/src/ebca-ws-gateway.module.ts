import { DynamicModule, Module, Provider, Type } from '@nestjs/common';
import {
  EBCA_WS_AUDIENCE_RESOLVERS,
  EBCA_WS_AUTH_ADAPTER,
  EBCA_WS_GATEWAY_EMITTER,
  EBCA_WS_GATEWAY_OPTIONS,
  EBCA_WS_INBOUND_NORMALIZERS,
  EBCA_WS_PROJECTION_POLICIES,
} from './tokens';
import { createEbcaWsGatewayClass } from './ebca-ws.gateway';
import { EbcaWsProjectorController } from './ebca-ws-projector.controller';
import { EbcaWsComponentMutationService } from './services/ebca-ws-component-mutation.service';
import { EbcaWsComponentRequestService } from './services/ebca-ws-component-request.service';
import { EbcaWsProjectionService } from './services/ebca-ws-projection.service';
import { EbcaWsQueryService } from './services/ebca-ws-query.service';
import type {
  EbcaWsAudienceResolver,
  EbcaWsGatewayEventNames,
  EbcaWsGatewayLimits,
  EbcaWsGatewayModuleOptions,
  EbcaWsGatewayResolvedOptions,
  EbcaWsInboundNormalizer,
  EbcaWsProjectionPolicy,
} from './types/ebca-ws-gateway.options';

const defaultEventNames: EbcaWsGatewayEventNames = {
  hello: 'client.hello',
  component: 'client.component',
  componentRequest: 'client.component.request',
  query: 'client.query',
  serverEvent: 'server.event',
  serverError: 'server.error',
};

const defaultLimits: EbcaWsGatewayLimits = {
  maxComponentRequestTargets: 300,
  maxCollectionRows: 1000,
  collectionEntityIdCacheTtlMs: 15_000,
};

@Module({})
export class EbcaWsGatewayModule {
  static forRoot(options: EbcaWsGatewayModuleOptions): DynamicModule {
    const resolvedOptions = this.resolveOptions(options);
    const gatewayClass = createEbcaWsGatewayClass(resolvedOptions);
    const inboundNormalizers = options.inboundNormalizers ?? [];
    const projectionPolicies = options.projectionPolicies ?? [];
    const audienceResolvers = options.audienceResolvers ?? [];
    const providers: Provider[] = [
      {
        provide: EBCA_WS_GATEWAY_OPTIONS,
        useValue: resolvedOptions,
      },
      options.authAdapter,
      ...inboundNormalizers,
      ...projectionPolicies,
      ...audienceResolvers,
      {
        provide: EBCA_WS_AUTH_ADAPTER,
        useExisting: options.authAdapter,
      },
      this.createListProvider<EbcaWsInboundNormalizer>(
        EBCA_WS_INBOUND_NORMALIZERS,
        inboundNormalizers,
      ),
      this.createListProvider<EbcaWsProjectionPolicy>(
        EBCA_WS_PROJECTION_POLICIES,
        projectionPolicies,
      ),
      this.createListProvider<EbcaWsAudienceResolver>(
        EBCA_WS_AUDIENCE_RESOLVERS,
        audienceResolvers,
      ),
      EbcaWsProjectionService,
      EbcaWsComponentRequestService,
      EbcaWsComponentMutationService,
      EbcaWsQueryService,
      gatewayClass,
      {
        provide: EBCA_WS_GATEWAY_EMITTER,
        useExisting: gatewayClass,
      },
    ];
    return {
      module: EbcaWsGatewayModule,
      controllers: [EbcaWsProjectorController],
      providers,
      exports: [
        EBCA_WS_GATEWAY_OPTIONS,
        EBCA_WS_GATEWAY_EMITTER,
        EbcaWsProjectionService,
        EbcaWsComponentRequestService,
        EbcaWsComponentMutationService,
        EbcaWsQueryService,
      ],
    };
  }

  private static resolveOptions(
    options: EbcaWsGatewayModuleOptions,
  ): EbcaWsGatewayResolvedOptions {
    return {
      namespace: options.namespace ?? '/game',
      corsOrigin: options.corsOrigin ?? true,
      identityField: options.identityField ?? 'identityId',
      identityEntityName: options.identityEntityName ?? null,
      identityRoomPrefix: options.identityRoomPrefix ?? 'identity',
      broadcastIdentityId: options.broadcastIdentityId ?? 'world',
      defaultRoles: options.defaultRoles ?? [],
      eventNames: {
        ...defaultEventNames,
        ...options.eventNames,
      },
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
