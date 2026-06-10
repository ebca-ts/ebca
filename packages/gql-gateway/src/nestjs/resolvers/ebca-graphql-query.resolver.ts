import { Inject, UnauthorizedException } from '@nestjs/common';
import { Args, Context, Query, Resolver } from '@nestjs/graphql';
import { randomUUID } from 'node:crypto';
import { EbcaGqlQueryService } from '../../services/ebca-gql-query.service';
import { EBCA_GQL_NESTJS_IDENTITY_RESOLVER } from '../tokens';
import {
  EbcaGraphqlQueryInput,
  EbcaGraphqlQueryResult,
} from '../types/ebca-graphql.contracts';
import type {
  EbcaGqlNestjsContext,
  EbcaGqlNestjsIdentityResolver,
} from '../types/ebca-graphql.options';

@Resolver()
export class EbcaGraphqlQueryResolver {
  constructor(
    private readonly queryService: EbcaGqlQueryService,
    @Inject(EBCA_GQL_NESTJS_IDENTITY_RESOLVER)
    private readonly identityResolver: EbcaGqlNestjsIdentityResolver,
  ) {}

  @Query(() => EbcaGraphqlQueryResult, { name: 'ebcaQuery' })
  async executeQuery(
    @Args('input') input: EbcaGraphqlQueryInput,
    @Context() context: EbcaGqlNestjsContext,
  ): Promise<EbcaGraphqlQueryResult> {
    const requestId = input.requestId ?? randomUUID();
    const identity = await this.identityResolver.resolveIdentity({
      context,
      requestId,
      queryName: input.name,
    });
    if (!identity) {
      throw new UnauthorizedException(
        'Valid GraphQL identity is required for EBCA query.',
      );
    }
    return new EbcaGraphqlQueryResult(
      await this.queryService.executeQuery(
        {
          name: input.name,
          params: input.params ?? {},
        },
        {
          identity,
          requestId,
        },
      ),
    );
  }
}
