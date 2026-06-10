import { DynamicModule, Module, Provider } from '@nestjs/common';
import { EBCA_GQL_GATEWAY_OPTIONS } from './tokens';
import { EbcaGqlQueryService } from './services/ebca-gql-query.service';
import type {
  EbcaGqlGatewayModuleOptions,
  EbcaGqlGatewayResolvedOptions,
} from './types/ebca-gql-gateway.options';

@Module({})
export class EbcaGqlGatewayModule {
  static forRoot(options: EbcaGqlGatewayModuleOptions = {}): DynamicModule {
    const resolvedOptions = this.resolveOptions(options);
    const providers: Provider[] = [
      {
        provide: EBCA_GQL_GATEWAY_OPTIONS,
        useValue: resolvedOptions,
      },
      EbcaGqlQueryService,
    ];
    return {
      module: EbcaGqlGatewayModule,
      providers,
      exports: [EBCA_GQL_GATEWAY_OPTIONS, EbcaGqlQueryService],
    };
  }

  private static resolveOptions(
    options: EbcaGqlGatewayModuleOptions,
  ): EbcaGqlGatewayResolvedOptions {
    return {
      defaultRoles: options.defaultRoles ?? [],
    };
  }
}
