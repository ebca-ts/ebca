import { DynamicModule, Module, Provider, Type } from '@nestjs/common';
import {
  EBCA_REST_AUTH_ADAPTER,
  EBCA_REST_GATEWAY_OPTIONS,
  EBCA_REST_INBOUND_NORMALIZERS,
} from './tokens';
import { EbcaRestGatewayController } from './ebca-rest-gateway.controller';
import { EbcaRestComponentMutationService } from './services/ebca-rest-component-mutation.service';
import { EbcaRestQueryService } from './services/ebca-rest-query.service';
import type {
  EbcaRestGatewayModuleOptions,
  EbcaRestGatewayResolvedOptions,
  EbcaRestInboundNormalizer,
} from './types/ebca-rest-gateway.options';

@Module({})
export class EbcaRestGatewayModule {
  static forRoot(options: EbcaRestGatewayModuleOptions = {}): DynamicModule {
    const resolvedOptions = this.resolveOptions(options);
    const inboundNormalizers = options.inboundNormalizers ?? [];
    const providers: Provider[] = [
      {
        provide: EBCA_REST_GATEWAY_OPTIONS,
        useValue: resolvedOptions,
      },
      ...(options.authAdapter
        ? [
            options.authAdapter,
            {
              provide: EBCA_REST_AUTH_ADAPTER,
              useExisting: options.authAdapter,
            },
          ]
        : []),
      ...inboundNormalizers,
      this.createListProvider<EbcaRestInboundNormalizer>(
        EBCA_REST_INBOUND_NORMALIZERS,
        inboundNormalizers,
      ),
      EbcaRestComponentMutationService,
      EbcaRestQueryService,
    ];
    return {
      module: EbcaRestGatewayModule,
      controllers: [EbcaRestGatewayController],
      providers,
      exports: [
        EBCA_REST_GATEWAY_OPTIONS,
        EbcaRestComponentMutationService,
        EbcaRestQueryService,
      ],
    };
  }

  private static resolveOptions(
    options: EbcaRestGatewayModuleOptions,
  ): EbcaRestGatewayResolvedOptions {
    return {
      defaultIdentityId: options.defaultIdentityId ?? 'anonymous',
      defaultRoles: options.defaultRoles ?? [],
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
