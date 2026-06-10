import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  BaseCommandComponent,
  CommandComponentSource,
} from '@ebca/core/bases/base-command.component';
import { BaseComponent } from '@ebca/core/bases/base.component';
import { BaseEntity } from '@ebca/core/bases/base.entity';
import { ComponentManager } from '@ebca/core/component.manager';
import {
  getComponentConstructorByName,
  getComponentOptions,
} from '@ebca/core/decorators/component.decorator';
import { getEntityConstructorByName } from '@ebca/core/decorators/entity.decorator';
import { getComponentName, getEntityName } from '@ebca/core/ebca.helpers';
import type {
  ComponentConstructor,
  ComponentInboundOperation,
  ComponentInboundOptions,
} from '@ebca/core/types/componens';
import type { EntityConstructor } from '@ebca/core/types/entities';
import {
  EBCA_WS_GATEWAY_OPTIONS,
  EBCA_WS_INBOUND_NORMALIZERS,
} from '../tokens';
import type {
  EbcaWsComponentMutationPayload,
  EbcaWsJsonObject,
  EbcaWsJsonValue,
} from '../types/ebca-ws-gateway.contracts';
import type {
  EbcaWsGatewayOptionsToken,
  EbcaWsInboundNormalizersToken,
} from '../tokens';
import type {
  EbcaWsAuthenticatedIdentity,
  EbcaWsComponentFieldValue,
  EbcaWsInboundNormalizerContext,
} from '../types/ebca-ws-gateway.options';
import {
  cloneMutableEbcaWsJsonObject,
  resolveEbcaWsStringList,
  serializeEbcaWsJsonObject,
} from '../utils/ebca-ws-json';

type HydratedComponentRecord = BaseComponent &
  Record<string, EbcaWsComponentFieldValue>;

@Injectable()
export class EbcaWsComponentMutationService {
  private readonly logger = new Logger(EbcaWsComponentMutationService.name);

  constructor(
    private readonly componentManager: ComponentManager,
    @Inject(EBCA_WS_GATEWAY_OPTIONS)
    private readonly options: EbcaWsGatewayOptionsToken,
    @Inject(EBCA_WS_INBOUND_NORMALIZERS)
    private readonly normalizers: EbcaWsInboundNormalizersToken,
  ) {}

  async applyMutation(
    identity: EbcaWsAuthenticatedIdentity,
    payload: EbcaWsComponentMutationPayload,
  ): Promise<void> {
    const entityClass = this.resolveEntityClass(payload.entityName);
    const componentClass = this.resolveComponentClass(payload.componentName);
    const inbound = getComponentOptions(componentClass)?.inbound ?? null;
    if (!inbound?.expose) {
      throw new ForbiddenException(
        `Component ${payload.componentName} is not open for websocket inbound.`,
      );
    }
    this.assertOperationAllowed(payload.operation, inbound, payload);
    this.assertRolesAllowed(identity.roles, inbound, payload);
    await this.assertEntityScope(
      identity.identityId,
      entityClass,
      componentClass,
      inbound,
      payload,
    );

    const entity = new entityClass();
    entity.id = payload.entityId;
    if (payload.operation === 'remove') {
      await this.componentManager.removeComponent(entity, componentClass, [
        ...identity.roles,
      ]);
      this.logger.debug(
        `Removed inbound component ${payload.componentName} from ${payload.entityName}:${payload.entityId} for identity ${identity.identityId}.`,
      );
      return;
    }

    const component = this.hydrateComponent(componentClass, payload, identity);
    if (component instanceof BaseCommandComponent) {
      component.resetCommandState();
      component.commandSource = CommandComponentSource.WEBSOCKET;
      await this.applyCommandMutation(
        entity,
        componentClass,
        component,
        payload.operation,
        identity.roles,
      );
      this.logger.debug(
        `Applied inbound ${payload.operation} command ${payload.componentName} on ${payload.entityName}:${payload.entityId} from identity ${identity.identityId}.`,
      );
      return;
    }

    if (payload.operation === 'add') {
      await this.componentManager.addComponent(entity, component, [
        ...identity.roles,
      ]);
    } else if (payload.operation === 'update') {
      await this.componentManager.updateComponent(entity, component, [
        ...identity.roles,
      ]);
    } else {
      await this.componentManager.upsertComponent(entity, component, [
        ...identity.roles,
      ]);
    }
    this.logger.debug(
      `Applied inbound ${payload.operation} for ${payload.componentName} on ${payload.entityName}:${payload.entityId} from identity ${identity.identityId}.`,
    );
  }

  private resolveEntityClass(
    entityName: string,
  ): EntityConstructor<BaseEntity> {
    try {
      return getEntityConstructorByName(entityName);
    } catch {
      throw new BadRequestException(`Unknown EBCA entity ${entityName}.`);
    }
  }

  private resolveComponentClass(
    componentName: string,
  ): ComponentConstructor<BaseComponent> {
    try {
      return getComponentConstructorByName(componentName);
    } catch {
      throw new BadRequestException(`Unknown EBCA component ${componentName}.`);
    }
  }

  private assertOperationAllowed(
    operation: EbcaWsComponentMutationPayload['operation'],
    inbound: ComponentInboundOptions,
    payload: EbcaWsComponentMutationPayload,
  ): void {
    const operations: readonly ComponentInboundOperation[] =
      inbound.operations ?? ['upsert'];
    if (
      !operations.some((allowedOperation) => allowedOperation === operation)
    ) {
      throw new ForbiddenException(
        `Inbound ${operation} is not allowed for ${payload.componentName}.`,
      );
    }
  }

  private assertRolesAllowed(
    roles: readonly string[],
    inbound: ComponentInboundOptions,
    payload: EbcaWsComponentMutationPayload,
  ): void {
    if (!inbound.roles || inbound.roles.length === 0) {
      return;
    }
    const allowed = roles.some((role) => inbound.roles?.includes(role));
    if (!allowed) {
      throw new ForbiddenException(
        `Inbound roles are not allowed for ${payload.componentName}.`,
      );
    }
  }

  private async assertEntityScope(
    identityId: string,
    entityClass: EntityConstructor<BaseEntity>,
    componentClass: ComponentConstructor<BaseComponent>,
    inbound: ComponentInboundOptions,
    payload: EbcaWsComponentMutationPayload,
  ): Promise<void> {
    const mode = inbound.entityId ?? 'playerId';
    if (mode === 'playerId' && payload.entityId !== identityId) {
      throw new ForbiddenException(
        `Inbound component ${payload.componentName} can only target current identity entity.`,
      );
    }
    if (!inbound.ownerComponent && !inbound.ownerField) {
      return;
    }
    const entity = new entityClass();
    entity.id = payload.entityId;
    const ownerSource = inbound.ownerComponent
      ? await this.resolveOwnerComponent(entity, inbound.ownerComponent)
      : (payload.component ?? {});
    if (
      !resolveEbcaWsStringList(
        ownerSource,
        inbound.ownerField ?? 'ownerPlayerId',
      ).includes(identityId)
    ) {
      throw new ForbiddenException(
        `Identity ${identityId} cannot mutate ${getComponentName(componentClass)} on ${getEntityName(entityClass)}:${payload.entityId}.`,
      );
    }
  }

  private async applyCommandMutation(
    entity: BaseEntity,
    componentClass: ComponentConstructor<BaseComponent>,
    component: BaseComponent,
    operation: EbcaWsComponentMutationPayload['operation'],
    roles: readonly string[],
  ): Promise<void> {
    if (operation === 'update') {
      await this.componentManager.updateComponent(entity, component, [
        ...roles,
      ]);
      return;
    }
    if (operation === 'add') {
      await this.componentManager.addComponent(entity, component, [...roles]);
      return;
    }
    if (operation === 'upsert') {
      if (await this.componentManager.hasComponent(entity, componentClass)) {
        await this.componentManager.removeComponent(entity, componentClass, [
          ...roles,
        ]);
      }
      await this.componentManager.addComponent(entity, component, [...roles]);
      return;
    }
    throw new BadRequestException('Command components cannot be removed.');
  }

  private async resolveOwnerComponent(
    entity: BaseEntity,
    ownerComponentName: string,
  ): Promise<EbcaWsJsonObject> {
    const ownerComponentClass = this.resolveComponentClass(ownerComponentName);
    const ownerComponent = await this.componentManager.getComponent(
      entity,
      ownerComponentClass,
    );
    return ownerComponent ? serializeEbcaWsJsonObject(ownerComponent) : {};
  }

  private hydrateComponent(
    componentClass: ComponentConstructor<BaseComponent>,
    payload: EbcaWsComponentMutationPayload,
    identity: EbcaWsAuthenticatedIdentity,
  ): BaseComponent {
    const component = new componentClass() as HydratedComponentRecord;
    const rawComponent = payload.component;
    if (!rawComponent) {
      return component;
    }
    const mutableComponent = cloneMutableEbcaWsJsonObject(rawComponent);
    for (const [field, value] of Object.entries(mutableComponent)) {
      component[field] = this.normalizeInboundComponentField(value, {
        identity,
        entityName: payload.entityName,
        entityId: payload.entityId,
        componentName: payload.componentName,
        field,
        currentValue: component[field],
        component: rawComponent,
      });
    }
    return component;
  }

  private normalizeInboundComponentField(
    value: EbcaWsJsonValue,
    context: EbcaWsInboundNormalizerContext,
  ): EbcaWsComponentFieldValue {
    for (const normalizer of this.normalizers) {
      const result = normalizer.normalize(value, context);
      if (result.handled) {
        return result.value;
      }
    }
    if (context.currentValue instanceof Date) {
      return this.normalizeInboundDate(context.field, value);
    }
    return value;
  }

  private normalizeInboundDate(field: string, value: EbcaWsJsonValue): Date {
    if (typeof value !== 'string' && typeof value !== 'number') {
      throw new BadRequestException(
        `Inbound component field ${field} must be a date string or timestamp.`,
      );
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(
        `Inbound component field ${field} contains invalid date value.`,
      );
    }
    return date;
  }
}
