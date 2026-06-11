import { Inject, Injectable, Logger } from '@nestjs/common';
import { BaseComponent } from '@ebca/core/bases/base.component';
import { BaseEntity } from '@ebca/core/bases/base.entity';
import { ComponentManager } from '@ebca/core/component.manager';
import { EbcaEventType } from '@ebca/core/ebca.helpers';
import {
  getComponentConstructorByName,
  getComponentOptions,
} from '@ebca/core/decorators/component.decorator';
import { getEntityConstructorByName } from '@ebca/core/decorators/entity.decorator';
import type { ComponentWebsocketProjectionOptions } from '@ebca/core/types/componens';
import {
  EBCA_GQL_AUDIENCE_RESOLVERS,
  EBCA_GQL_GATEWAY_OPTIONS,
  EBCA_GQL_PROJECTION_POLICIES,
} from '../tokens';
import type {
  EbcaGqlEbcaComponentPayload,
  EbcaGqlJsonObject,
} from '../types/ebca-gql-gateway.contracts';
import type {
  EbcaGqlAudienceResolver,
  EbcaGqlGatewayResolvedOptions,
  EbcaGqlProjectionContext,
  EbcaGqlProjectionPolicy,
} from '../types/ebca-gql-gateway.options';
import {
  resolveEbcaGqlStringList,
  serializeEbcaGqlJsonObject,
} from '../utils/ebca-gql-json';

export type EbcaGqlEbcaProjectionPayload =
  | {
      readonly entityId: string;
      readonly component: BaseComponent;
    }
  | {
      readonly entityId: string;
      readonly componentName: string;
      readonly previousComponent?: BaseComponent;
    };

export interface EbcaGqlResolvedProjection {
  readonly payload: EbcaGqlEbcaComponentPayload;
  readonly broadcast: boolean;
  readonly recipientIds: readonly string[];
}

@Injectable()
export class EbcaGqlProjectionService {
  private readonly logger = new Logger(EbcaGqlProjectionService.name);

  constructor(
    private readonly componentManager: ComponentManager,
    @Inject(EBCA_GQL_GATEWAY_OPTIONS)
    private readonly options: EbcaGqlGatewayResolvedOptions,
    @Inject(EBCA_GQL_PROJECTION_POLICIES)
    private readonly policies: readonly EbcaGqlProjectionPolicy[],
    @Inject(EBCA_GQL_AUDIENCE_RESOLVERS)
    private readonly audienceResolvers: readonly EbcaGqlAudienceResolver[],
  ) {}

  async resolveLifecycleProjection(
    topic: string,
    data: EbcaGqlEbcaProjectionPayload,
  ): Promise<EbcaGqlResolvedProjection | null> {
    const parts = topic.split('.');
    if (parts.length < 5) {
      return null;
    }
    const [, entityName, entityId, lifecycleValue, ...componentNameParts] =
      parts;
    const lifecycleKind = lifecycleValue as EbcaEventType;
    if (!this.isSupportedLifecycleKind(lifecycleKind)) {
      return null;
    }
    const componentName = componentNameParts.join('.');
    const component = this.resolveComponentPayload(data);
    if (!component) {
      return null;
    }
    const projectionOptions = this.resolveProjectionOptions(componentName);
    if (!projectionOptions?.expose) {
      return null;
    }
    if (!this.isLifecycleAllowed(lifecycleKind, projectionOptions)) {
      return null;
    }
    const serializedComponent = serializeEbcaGqlJsonObject(component);
    const context: EbcaGqlProjectionContext = {
      entityName,
      entityId,
      componentName,
      component: serializedComponent,
      lifecycle: lifecycleValue as 'added' | 'updated' | 'removed',
      projectionOptions,
    };
    if (!(await this.canExpose(context))) {
      return null;
    }
    const payload: EbcaGqlEbcaComponentPayload = {
      entityName,
      entityId,
      lifecycle: context.lifecycle ?? 'updated',
      componentName,
      component: serializedComponent,
    };
    const audience = await this.resolveAudience(context);
    return {
      payload,
      broadcast: audience.broadcast,
      recipientIds: audience.recipientIds,
    };
  }

  async canIdentityReceiveComponent(
    identityId: string,
    entity: BaseEntity,
    entityName: string,
    componentName: string,
    component: EbcaGqlJsonObject,
    projectionOptions: ComponentWebsocketProjectionOptions,
  ): Promise<boolean> {
    const context: EbcaGqlProjectionContext = {
      identityId,
      entityName,
      entityId: entity.id,
      componentName,
      component,
      projectionOptions,
    };
    if (!(await this.canExpose(context))) {
      return false;
    }
    if (projectionOptions.audience === 'world') {
      return true;
    }
    const resolvedAudience = await this.resolveAudience(context);
    if (resolvedAudience.broadcast) {
      return true;
    }
    if (resolvedAudience.recipientIds.length > 0) {
      return resolvedAudience.recipientIds.includes(identityId);
    }
    if (projectionOptions.ownerComponent) {
      const ownerComponent = await this.resolveOwnerComponentPayload(
        entityName,
        entity.id,
        projectionOptions.ownerComponent,
      );
      if (!ownerComponent) {
        return false;
      }
      return resolveEbcaGqlStringList(
        ownerComponent,
        projectionOptions.ownerField ?? 'ownerPlayerId',
      ).includes(identityId);
    }
    if (projectionOptions.ownerField) {
      return resolveEbcaGqlStringList(
        component,
        projectionOptions.ownerField,
      ).includes(identityId);
    }
    return (
      this.options.identityEntityName !== null &&
      entityName === this.options.identityEntityName &&
      entity.id === identityId
    );
  }

  private isSupportedLifecycleKind(lifecycleKind: EbcaEventType): boolean {
    return (
      lifecycleKind === EbcaEventType.COMPONENT_ADDED ||
      lifecycleKind === EbcaEventType.COMPONENT_UPDATED ||
      lifecycleKind === EbcaEventType.COMPONENT_REMOVED
    );
  }

  private resolveComponentPayload(
    data: EbcaGqlEbcaProjectionPayload,
  ): BaseComponent | null {
    if ('component' in data) {
      return data.component;
    }
    return data.previousComponent ?? null;
  }

  private resolveProjectionOptions(
    componentName: string,
  ): ComponentWebsocketProjectionOptions | null {
    try {
      const componentClass = getComponentConstructorByName(componentName);
      return getComponentOptions(componentClass)?.websocket ?? null;
    } catch {
      return null;
    }
  }

  private isLifecycleAllowed(
    lifecycleKind: EbcaEventType,
    projectionOptions: ComponentWebsocketProjectionOptions,
  ): boolean {
    if (!projectionOptions.lifecycleKinds) {
      return true;
    }
    return projectionOptions.lifecycleKinds.some(
      (allowedLifecycleKind) => allowedLifecycleKind === lifecycleKind,
    );
  }

  private async canExpose(context: EbcaGqlProjectionContext): Promise<boolean> {
    for (const policy of this.policies) {
      const result = await policy.canExpose(context);
      if (result.handled && !result.allow) {
        return false;
      }
    }
    return true;
  }

  private async resolveAudience(
    context: EbcaGqlProjectionContext,
  ): Promise<{ readonly broadcast: boolean; readonly recipientIds: string[] }> {
    for (const resolver of this.audienceResolvers) {
      const result = await resolver.resolveRecipients(context);
      if (!result.handled) {
        continue;
      }
      return {
        broadcast: result.broadcast ?? false,
        recipientIds: [...(result.recipientIds ?? [])],
      };
    }
    if (context.projectionOptions.audience === 'world') {
      return { broadcast: true, recipientIds: [] };
    }
    if (context.projectionOptions.audience === 'city') {
      this.logger.debug(
        `Skipped EBCA GraphQL city audience for ${context.componentName}: no audience resolver handled it.`,
      );
      return { broadcast: false, recipientIds: [] };
    }
    if (context.projectionOptions.ownerComponent) {
      return {
        broadcast: false,
        recipientIds: await this.resolveOwnerComponentRecipients(context),
      };
    }
    if (context.projectionOptions.ownerField) {
      return {
        broadcast: false,
        recipientIds: [
          ...resolveEbcaGqlStringList(
          context.component,
          context.projectionOptions.ownerField,
          ),
        ],
      };
    }
    if (
      this.options.identityEntityName !== null &&
      context.entityName === this.options.identityEntityName
    ) {
      return { broadcast: false, recipientIds: [context.entityId] };
    }
    return { broadcast: false, recipientIds: [] };
  }

  private async resolveOwnerComponentRecipients(
    context: EbcaGqlProjectionContext,
  ): Promise<string[]> {
    const ownerComponentName = context.projectionOptions.ownerComponent;
    if (!ownerComponentName) {
      return [];
    }
    const ownerComponent = await this.resolveOwnerComponentPayload(
      context.entityName,
      context.entityId,
      ownerComponentName,
    );
    if (!ownerComponent) {
      return [];
    }
    return [
      ...resolveEbcaGqlStringList(
        ownerComponent,
        context.projectionOptions.ownerField ?? 'ownerPlayerId',
      ),
    ];
  }

  private async resolveOwnerComponentPayload(
    entityName: string,
    entityId: string,
    ownerComponentName: string,
  ): Promise<EbcaGqlJsonObject | null> {
    try {
      const EntityClass = getEntityConstructorByName(entityName);
      const OwnerComponentClass =
        getComponentConstructorByName(ownerComponentName);
      const entity = new EntityClass();
      entity.id = entityId;
      const ownerComponent = await this.componentManager.getComponent(
        entity,
        OwnerComponentClass,
      );
      return ownerComponent ? serializeEbcaGqlJsonObject(ownerComponent) : null;
    } catch {
      return null;
    }
  }
}
