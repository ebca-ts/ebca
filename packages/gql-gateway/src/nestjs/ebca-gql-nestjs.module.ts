import { DynamicModule, Module, Provider } from '@nestjs/common';
import { EbcaGqlGatewayModule } from '../ebca-gql-gateway.module';
import { EbcaGraphqlQueryResolver } from './resolvers/ebca-graphql-query.resolver';
import { EbcaJsonScalar } from './scalars/ebca-json.scalar';
import { EBCA_GQL_NESTJS_IDENTITY_RESOLVER } from './tokens';
import type { EbcaGqlNestjsModuleOptions } from './types/ebca-graphql.options';

@Module({})
export class EbcaGqlNestjsModule {
  static forRoot(options: EbcaGqlNestjsModuleOptions): DynamicModule {
    const providers: Provider[] = [
      options.identityResolver,
      {
        provide: EBCA_GQL_NESTJS_IDENTITY_RESOLVER,
        useExisting: options.identityResolver,
      },
      EbcaJsonScalar,
      EbcaGraphqlQueryResolver,
    ];
    return {
      module: EbcaGqlNestjsModule,
      imports: [EbcaGqlGatewayModule.forRoot(options.ebca)],
      providers,
      exports: [
        EBCA_GQL_NESTJS_IDENTITY_RESOLVER,
        EbcaJsonScalar,
        EbcaGraphqlQueryResolver,
      ],
    };
  }
}
