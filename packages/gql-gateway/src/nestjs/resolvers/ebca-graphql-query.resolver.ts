import { Inject, UnauthorizedException } from '@nestjs/common';
import {
  Args,
  Context,
  Mutation,
  Query,
  Resolver,
  Subscription,
} from '@nestjs/graphql';
import { randomUUID } from 'node:crypto';
import { EBCA_GQL_GATEWAY_OPTIONS } from '../../tokens';
import { EbcaGqlComponentMutationService } from '../../services/ebca-gql-component-mutation.service';
import { EbcaGqlComponentRequestService } from '../../services/ebca-gql-component-request.service';
import { EbcaGqlQueryService } from '../../services/ebca-gql-query.service';
import { EbcaGqlSubscriptionRegistryService } from '../../services/ebca-gql-subscription-registry.service';
import { EBCA_GQL_NESTJS_IDENTITY_RESOLVER } from '../tokens';
import {
  EbcaGraphqlComponentBatch,
  EbcaGraphqlComponentEvent,
  EbcaGraphqlComponentMutationInput,
  EbcaGraphqlComponentMutationResult,
  EbcaGraphqlComponentRequestInput,
  EbcaGraphqlComponentSubscriptionInput,
  EbcaGraphqlQueryInput,
  EbcaGraphqlQueryResult,
} from '../types/ebca-graphql.contracts';
import type { EbcaGqlEbcaComponentPayload } from '../../types/ebca-gql-gateway.contracts';
import type {
  EbcaGqlAuthenticatedIdentity,
  EbcaGqlGatewayResolvedOptions,
  EbcaGqlIdentity,
} from '../../types/ebca-gql-gateway.options';
import type {
  EbcaGqlNestjsContext,
  EbcaGqlNestjsIdentityResolver,
} from '../types/ebca-graphql.options';

@Resolver()
export class EbcaGraphqlQueryResolver {
  constructor(
    private readonly queryService: EbcaGqlQueryService,
    private readonly componentMutation: EbcaGqlComponentMutationService,
    private readonly componentRequest: EbcaGqlComponentRequestService,
    private readonly subscriptions: EbcaGqlSubscriptionRegistryService,
    @Inject(EBCA_GQL_GATEWAY_OPTIONS)
    private readonly options: EbcaGqlGatewayResolvedOptions,
    @Inject(EBCA_GQL_NESTJS_IDENTITY_RESOLVER)
    private readonly identityResolver: EbcaGqlNestjsIdentityResolver,
  ) {}

  @Query(() => EbcaGraphqlQueryResult, { name: 'ebcaQuery' })
  async executeQuery(
    @Args('input') input: EbcaGraphqlQueryInput,
    @Context() context: EbcaGqlNestjsContext,
  ): Promise<EbcaGraphqlQueryResult> {
    const requestId = input.requestId ?? randomUUID();
    const identity = await this.resolveAuthenticatedIdentity({
      context,
      requestId,
      operationName: 'ebcaQuery',
      queryName: input.name,
    });
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

  @Mutation(() => EbcaGraphqlComponentMutationResult, {
    name: 'ebcaComponentMutation',
  })
  async mutateComponent(
    @Args('input') input: EbcaGraphqlComponentMutationInput,
    @Context() context: EbcaGqlNestjsContext,
  ): Promise<EbcaGraphqlComponentMutationResult> {
    const requestId = input.requestId ?? randomUUID();
    const identity = await this.resolveAuthenticatedIdentity({
      context,
      requestId,
      operationName: 'ebcaComponentMutation',
    });
    return new EbcaGraphqlComponentMutationResult(
      await this.componentMutation.applyMutation(identity, {
        operation: input.operation,
        entityName: input.entityName,
        entityId: input.entityId,
        componentName: input.componentName,
        component: input.component,
      }),
    );
  }

  @Query(() => EbcaGraphqlComponentBatch, { name: 'ebcaComponentRequest' })
  async requestComponents(
    @Args('input') input: EbcaGraphqlComponentRequestInput,
    @Context() context: EbcaGqlNestjsContext,
  ): Promise<EbcaGraphqlComponentBatch> {
    const requestId = input.requestId ?? randomUUID();
    const identity = await this.resolveAuthenticatedIdentity({
      context,
      requestId,
      operationName: 'ebcaComponentRequest',
    });
    return new EbcaGraphqlComponentBatch({
      kind: 'component.batch',
      components: await this.componentRequest.resolveRequestedComponents(
        identity,
        {
          targets: input.targets,
        },
      ),
    });
  }

  @Subscription(() => EbcaGraphqlComponentEvent, {
    name: 'ebcaComponent',
    resolve: (payload: EbcaGqlEbcaComponentPayload) =>
      new EbcaGraphqlComponentEvent(payload),
  })
  async subscribeComponents(
    @Args('input') input: EbcaGraphqlComponentSubscriptionInput,
    @Context() context: EbcaGqlNestjsContext,
  ): Promise<AsyncIterableIterator<EbcaGqlEbcaComponentPayload>> {
    const requestId = input.requestId ?? randomUUID();
    const identity = await this.resolveAuthenticatedIdentity({
      context,
      requestId,
      operationName: 'ebcaComponent',
    });
    return this.subscriptions.subscribe(identity, {
      entityName: input.entityName,
      entityId: input.entityId,
      componentNames: input.componentNames,
    });
  }

  private async resolveAuthenticatedIdentity(options: {
    readonly context: EbcaGqlNestjsContext;
    readonly requestId: string;
    readonly operationName: string;
    readonly queryName?: string;
  }): Promise<EbcaGqlAuthenticatedIdentity> {
    const identity = await this.identityResolver.resolveIdentity(options);
    if (!identity) {
      throw new UnauthorizedException(
        'Valid GraphQL identity is required for EBCA operation.',
      );
    }
    return this.resolveIdentity(identity);
  }

  private resolveIdentity(
    identity: EbcaGqlIdentity,
  ): EbcaGqlAuthenticatedIdentity {
    return {
      identityId: identity.identityId,
      roles: identity.roles ?? this.options.defaultRoles,
    };
  }
}
