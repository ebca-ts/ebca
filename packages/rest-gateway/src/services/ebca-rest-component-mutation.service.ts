import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
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
import { EBCA_REST_INBOUND_NORMALIZERS } from '../tokens';
import type { EbcaRestInboundNormalizersToken } from '../tokens';
import type {
  EbcaRestComponentMutationPayload,
  EbcaRestComponentMutationResponse,
  EbcaRestJsonObject,
  EbcaRestJsonValue,
} from '../types/ebca-rest-gateway.contracts';
import type {
  EbcaRestAuthenticatedIdentity,
  EbcaRestComponentFieldValue,
  EbcaRestInboundNormalizerContext,
} from '../types/ebca-rest-gateway.options';
import {
  cloneMutableEbcaRestJsonObject,
  resolveEbcaRestStringList,
  serializeEbcaRestJsonObject,
} from '../utils/ebca-rest-json';

type HydratedComponentRecord = BaseComponent &
  Record<string, EbcaRestComponentFieldValue>;

@Injectable()
export class EbcaRestComponentMutationService {
  private readonly logger = new Logger(EbcaRestComponentMutationService.name);

  constructor(
    private readonly componentManager: ComponentManager,
    @Inject(EBCA_REST_INBOUND_NORMALIZERS)
    private readonly normalizers: EbcaRestInboundNormalizersToken,
  ) {}

  async applyMutation(
    identity: EbcaRestAuthenticatedIdentity,
    payload: EbcaRestComponentMutationPayload,
  ): Promise<EbcaRestComponentMutationResponse> {
    const entityClass = this.resolveEntityClass(payload.entityName);
    const componentClass = this.resolveComponentClass(payload.componentName);
    const inbound = getComponentOptions(componentClass)?.inbound ?? null;
    if (!inbound?.expose) {
      throw new ForbiddenException(
        `Component ${payload.componentName} is not open for REST inbound.`,
      );
    }
    this.assertOperationAllowed(payload.operation, inbound, payload);
    this.assertRolesAllowed(identity.roles, inbound, payload);
    this.assertFieldsDeclared(payload.operation, inbound, payload);
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
      return this.accepted(payload);
    }

    const component = this.hydrateComponent(
      componentClass,
      inbound,
      payload,
      identity,
    );
    if (component instanceof BaseCommandComponent) {
      component.resetCommandState();
      component.commandSource = CommandComponentSource.REST;
      component.commandId = component.commandId ?? randomUUID();
      await this.applyCommandMutation(
        entity,
        componentClass,
        component,
        payload.operation,
        identity.roles,
      );
      this.logger.debug(
        `Applied REST ${payload.operation} command ${payload.componentName} on ${payload.entityName}:${payload.entityId} from identity ${identity.identityId}.`,
      );
      return this.accepted(payload);
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
      `Applied REST ${payload.operation} for ${payload.componentName} on ${payload.entityName}:${payload.entityId} from identity ${identity.identityId}.`,
    );
    return this.accepted(payload);
  }

  private accepted(
    payload: EbcaRestComponentMutationPayload,
  ): EbcaRestComponentMutationResponse {
    return {
      kind: 'component.mutation.accepted',
      entityName: payload.entityName,
      entityId: payload.entityId,
      componentName: payload.componentName,
      operation: payload.operation,
    };
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
    operation: EbcaRestComponentMutationPayload['operation'],
    inbound: ComponentInboundOptions,
    payload: EbcaRestComponentMutationPayload,
  ): void {
    const operations: readonly ComponentInboundOperation[] =
      inbound.operations ?? ['upsert'];
    if (!operations.some((allowedOperation) => allowedOperation === operation)) {
      throw new ForbiddenException(
        `Inbound ${operation} is not allowed for ${payload.componentName}.`,
      );
    }
  }

  private assertRolesAllowed(
    roles: readonly string[],
    inbound: ComponentInboundOptions,
    payload: EbcaRestComponentMutationPayload,
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

  private assertFieldsDeclared(
    operation: EbcaRestComponentMutationPayload['operation'],
    inbound: ComponentInboundOptions,
    payload: EbcaRestComponentMutationPayload,
  ): void {
    if (operation === 'remove' || inbound.fields) {
      return;
    }
    throw new BadRequestException(
      `REST inbound component ${payload.componentName} must declare inbound.fields.`,
    );
  }

  private async assertEntityScope(
    identityId: string,
    entityClass: EntityConstructor<BaseEntity>,
    componentClass: ComponentConstructor<BaseComponent>,
    inbound: ComponentInboundOptions,
    payload: EbcaRestComponentMutationPayload,
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
    if (!inbound.ownerComponent) {
      throw new BadRequestException(
        `REST inbound ownerField for ${payload.componentName} requires ownerComponent.`,
      );
    }
    const entity = new entityClass();
    entity.id = payload.entityId;
    const ownerSource = await this.resolveOwnerComponent(
      entity,
      inbound.ownerComponent,
    );
    if (
      !resolveEbcaRestStringList(
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
    operation: EbcaRestComponentMutationPayload['operation'],
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
  ): Promise<EbcaRestJsonObject> {
    const ownerComponentClass = this.resolveComponentClass(ownerComponentName);
    const ownerComponent = await this.componentManager.getComponent(
      entity,
      ownerComponentClass,
    );
    return ownerComponent ? serializeEbcaRestJsonObject(ownerComponent) : {};
  }

  private hydrateComponent(
    componentClass: ComponentConstructor<BaseComponent>,
    inbound: ComponentInboundOptions,
    payload: EbcaRestComponentMutationPayload,
    identity: EbcaRestAuthenticatedIdentity,
  ): BaseComponent {
    const component = new componentClass() as HydratedComponentRecord;
    const rawComponent = payload.component;
    if (!rawComponent) {
      return component;
    }
    const mutableComponent = cloneMutableEbcaRestJsonObject(rawComponent);
    for (const [field, value] of Object.entries(mutableComponent)) {
      if (inbound.fields && !inbound.fields.includes(field)) {
        throw new BadRequestException(
          `Inbound component field ${field} is not open for ${payload.componentName}.`,
        );
      }
      component[field] = this.normalizeInboundComponentField(value, {
        identity,
        entityName: payload.entityName,
        entityId: payload.entityId,
        componentName: payload.componentName,
        field,
        currentValue: component[field],
      });
    }
    return component;
  }

  private normalizeInboundComponentField(
    value: EbcaRestJsonValue,
    context: EbcaRestInboundNormalizerContext,
  ): EbcaRestComponentFieldValue {
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

  private normalizeInboundDate(field: string, value: EbcaRestJsonValue): Date {
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
