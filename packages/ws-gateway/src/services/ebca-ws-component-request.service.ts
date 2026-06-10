import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { BaseComponent } from '@ebca/core/bases/base.component';
import { BaseEntity } from '@ebca/core/bases/base.entity';
import { ComponentManager } from '@ebca/core/component.manager';
import { EbcaEventType, getEntityName } from '@ebca/core/ebca.helpers';
import {
  getComponentConstructorByName,
  getComponentOptions,
} from '@ebca/core/decorators/component.decorator';
import { getEntityConstructorByName } from '@ebca/core/decorators/entity.decorator';
import type {
  ComponentConstructor,
  ComponentWebsocketProjectionOptions,
} from '@ebca/core/types/componens';
import type { EntityConstructor } from '@ebca/core/types/entities';
import { EBCA_WS_GATEWAY_OPTIONS } from '../tokens';
import type {
  EbcaWsEbcaComponentPayload,
  EbcaWsRequestComponentsPayload,
} from '../types/ebca-ws-gateway.contracts';
import type { EbcaWsGatewayOptionsToken } from '../tokens';
import type { EbcaWsAuthenticatedIdentity } from '../types/ebca-ws-gateway.options';
import { serializeEbcaWsJsonObject } from '../utils/ebca-ws-json';
import { EbcaWsProjectionService } from './ebca-ws-projection.service';

@Injectable()
export class EbcaWsComponentRequestService {
  private readonly logger = new Logger(EbcaWsComponentRequestService.name);
  private readonly collectionEntityIdCache = new Map<
    string,
    {
      readonly expiresAt: number;
      readonly entityIds: readonly string[];
    }
  >();

  constructor(
    private readonly componentManager: ComponentManager,
    private readonly projection: EbcaWsProjectionService,
    @Inject(EBCA_WS_GATEWAY_OPTIONS)
    private readonly options: EbcaWsGatewayOptionsToken,
    @Optional() private readonly dataSource: DataSource | null,
  ) {}

  async resolveRequestedComponents(
    identity: EbcaWsAuthenticatedIdentity,
    payload: EbcaWsRequestComponentsPayload,
  ): Promise<EbcaWsEbcaComponentPayload[]> {
    const targets = payload.targets.slice(
      0,
      this.options.limits.maxComponentRequestTargets,
    );
    const result: EbcaWsEbcaComponentPayload[] = [];
    for (const target of targets) {
      const targetPayloads =
        target.mode === 'entity'
          ? await this.resolveEntityTarget(identity, target)
          : await this.resolveCollectionTarget(identity, target);
      result.push(...targetPayloads);
    }
    return result;
  }

  private async resolveEntityTarget(
    identity: EbcaWsAuthenticatedIdentity,
    target: EbcaWsRequestComponentsPayload['targets'][number],
  ): Promise<EbcaWsEbcaComponentPayload[]> {
    if (!target.entityId) {
      return [];
    }
    const entityClass = this.resolveEntityClass(target.entityName);
    if (!entityClass) {
      return [];
    }
    return this.resolveEntityComponents(
      identity,
      entityClass,
      target.entityId,
      target.componentNames,
    );
  }

  private async resolveCollectionTarget(
    identity: EbcaWsAuthenticatedIdentity,
    target: EbcaWsRequestComponentsPayload['targets'][number],
  ): Promise<EbcaWsEbcaComponentPayload[]> {
    const entityClass = this.resolveEntityClass(target.entityName);
    if (!entityClass || !this.dataSource) {
      return [];
    }
    const repository = this.resolveRepository(entityClass);
    if (!repository) {
      return [];
    }
    const limit = this.clampCollectionLimit(target.limit);
    let entityIds = this.readCollectionEntityIdCache(
      identity.identityId,
      target.entityName,
      target.ownedOnly ?? false,
      limit,
    );
    if (!entityIds) {
      const queryBuilder = repository
        .createQueryBuilder('entity')
        .select(['entity.id'])
        .orderBy(this.resolveOrderColumn(repository), 'DESC')
        .take(limit);
      if (target.ownedOnly) {
        const filtered = this.applyOwnedCollectionFilter(
          repository,
          queryBuilder,
          identity.identityId,
        );
        if (!filtered) {
          this.logger.warn(
            `Owned EBCA websocket collection query for ${entityClass.name} has no identity projection column.`,
          );
        }
      }
      const rows = await queryBuilder.getMany();
      entityIds = rows.map((row) => row.id);
      this.writeCollectionEntityIdCache(
        identity.identityId,
        target.entityName,
        target.ownedOnly ?? false,
        limit,
        entityIds,
      );
    }
    const result: EbcaWsEbcaComponentPayload[] = [];
    for (const entityId of entityIds) {
      result.push(
        ...(await this.resolveEntityComponents(
          identity,
          entityClass,
          entityId,
          target.componentNames,
        )),
      );
    }
    return result;
  }

  private async resolveEntityComponents(
    identity: EbcaWsAuthenticatedIdentity,
    entityClass: EntityConstructor<BaseEntity>,
    entityId: string,
    componentNames: readonly string[],
  ): Promise<EbcaWsEbcaComponentPayload[]> {
    const result: EbcaWsEbcaComponentPayload[] = [];
    const entity = new entityClass();
    entity.id = entityId;
    const readableComponents: {
      readonly componentName: string;
      readonly componentClass: ComponentConstructor<BaseComponent>;
    }[] = [];
    for (const componentName of componentNames) {
      const componentClass = this.resolveComponentClass(componentName);
      if (!componentClass) {
        continue;
      }
      const projectionOptions =
        getComponentOptions(componentClass)?.websocket ?? null;
      if (!projectionOptions?.expose) {
        continue;
      }
      if (!this.canReadAsSnapshot(projectionOptions)) {
        continue;
      }
      readableComponents.push({ componentName, componentClass });
    }
    const batchComponents = await this.componentManager.getComponents(
      entity,
      readableComponents.map((item) => item.componentClass),
    );
    for (let index = 0; index < readableComponents.length; index += 1) {
      const readable = readableComponents[index];
      const component = batchComponents[index]?.component;
      if (!readable || !component) {
        continue;
      }
      const projectionOptions =
        getComponentOptions(readable.componentClass)?.websocket ?? null;
      if (!projectionOptions?.expose) {
        continue;
      }
      const serializedComponent = serializeEbcaWsJsonObject(component);
      const canReceive = await this.projection.canIdentityReceiveComponent(
        identity.identityId,
        entity,
        getEntityName(entityClass),
        readable.componentName,
        serializedComponent,
        projectionOptions,
      );
      if (!canReceive) {
        continue;
      }
      result.push({
        entityName: getEntityName(entityClass),
        entityId,
        lifecycle: EbcaEventType.COMPONENT_UPDATED,
        componentName: readable.componentName,
        component: serializedComponent,
      });
    }
    return result;
  }

  private resolveEntityClass(
    entityName: string,
  ): EntityConstructor<BaseEntity> | null {
    try {
      return getEntityConstructorByName(entityName);
    } catch {
      this.logger.warn(
        `Rejected EBCA websocket component request for unregistered entity ${entityName}.`,
      );
      return null;
    }
  }

  private resolveComponentClass(
    componentName: string,
  ): ComponentConstructor<BaseComponent> | null {
    try {
      return getComponentConstructorByName(componentName);
    } catch {
      this.logger.warn(
        `Rejected EBCA websocket component request for unregistered component ${componentName}.`,
      );
      return null;
    }
  }

  private resolveRepository(
    entityClass: EntityConstructor<BaseEntity>,
  ): Repository<BaseEntity> | null {
    try {
      return this.dataSource?.getRepository(entityClass) ?? null;
    } catch {
      this.logger.warn(
        `Skipped EBCA websocket collection query for ${entityClass.name}: repository is not available.`,
      );
      return null;
    }
  }

  private canReadAsSnapshot(
    projectionOptions: ComponentWebsocketProjectionOptions,
  ): boolean {
    if (!projectionOptions.lifecycleKinds) {
      return true;
    }
    return projectionOptions.lifecycleKinds.some(
      (lifecycleKind) => lifecycleKind === EbcaEventType.COMPONENT_UPDATED,
    );
  }

  private clampCollectionLimit(limit: number | undefined): number {
    if (!limit) {
      return this.options.limits.maxCollectionRows;
    }
    return Math.max(
      1,
      Math.min(this.options.limits.maxCollectionRows, Math.floor(limit)),
    );
  }

  private resolveOrderColumn(repository: Repository<BaseEntity>): string {
    if (repository.metadata.findColumnWithPropertyName('startsAt')) {
      return 'entity.startsAt';
    }
    if (repository.metadata.findColumnWithPropertyName('updatedAt')) {
      return 'entity.updatedAt';
    }
    if (repository.metadata.findColumnWithPropertyName('createdAt')) {
      return 'entity.createdAt';
    }
    return 'entity.id';
  }

  private applyOwnedCollectionFilter(
    repository: Repository<BaseEntity>,
    queryBuilder: ReturnType<Repository<BaseEntity>['createQueryBuilder']>,
    identityId: string,
  ): boolean {
    if (repository.metadata.findColumnWithPropertyName('ownerPlayerId')) {
      queryBuilder.where('entity.ownerPlayerId = :identityId', { identityId });
      return true;
    }
    if (
      this.options.identityEntityName !== null &&
      repository.metadata.targetName === this.options.identityEntityName
    ) {
      queryBuilder.where('entity.id = :identityId', { identityId });
      return true;
    }
    return false;
  }

  private readCollectionEntityIdCache(
    identityId: string,
    entityName: string,
    ownedOnly: boolean,
    limit: number,
  ): string[] | null {
    if (this.options.limits.collectionEntityIdCacheTtlMs <= 0) {
      return null;
    }
    const key = this.collectionEntityIdCacheKey(
      identityId,
      entityName,
      ownedOnly,
      limit,
    );
    const cached = this.collectionEntityIdCache.get(key);
    if (!cached) {
      return null;
    }
    if (cached.expiresAt <= Date.now()) {
      this.collectionEntityIdCache.delete(key);
      return null;
    }
    return [...cached.entityIds];
  }

  private writeCollectionEntityIdCache(
    identityId: string,
    entityName: string,
    ownedOnly: boolean,
    limit: number,
    entityIds: readonly string[],
  ): void {
    if (this.options.limits.collectionEntityIdCacheTtlMs <= 0) {
      return;
    }
    const key = this.collectionEntityIdCacheKey(
      identityId,
      entityName,
      ownedOnly,
      limit,
    );
    this.collectionEntityIdCache.set(key, {
      expiresAt: Date.now() + this.options.limits.collectionEntityIdCacheTtlMs,
      entityIds: [...entityIds],
    });
  }

  private collectionEntityIdCacheKey(
    identityId: string,
    entityName: string,
    ownedOnly: boolean,
    limit: number,
  ): string {
    return [
      entityName,
      ownedOnly ? 'owned' : 'world',
      ownedOnly ? identityId : 'all',
      String(limit),
    ].join(':');
  }
}
