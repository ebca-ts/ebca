import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ClientProxy, NatsRecordBuilder } from '@nestjs/microservices';
import type { EntityManager } from 'typeorm';
import type { Cache } from 'cache-manager';
import { BaseCommandComponent } from './bases/base-command.component';
import { BaseComponent } from './bases/base.component';
import {
  buildEbcaRedisKey,
  buildEbcaTopic,
  EbcaEventType,
  getComponentName,
  getEntityName,
} from './ebca.helpers';
import KeyvRedis, { RedisClientConnectionType } from '@keyv/redis';
import { BaseEntity } from './bases/base.entity';
import { PersistenceManager } from './persistence.manager';
import { EBCA_DELAYED_TOPIC_PREFIX } from './delayed-stream.bootstrap';
import type { PersistentPropertyMetadata } from './decorators/persistent-property.decorator';
import {
  checkComponentPermissions,
  getComponentOptions,
  getRegisteredComponents,
  resolveDelayedComponentAt,
} from './decorators/component.decorator';
import { EntityConstructor } from './types/entities';
import { ComponentConstructor } from './types/componens';
import { headers } from 'nats';
import { EbcaOrderedIngressService } from './ordered-ingress.service';

type ComponentComparableJsonValue =
  | string
  | number
  | boolean
  | null
  | ComponentComparableJsonValue[]
  | { [key: string]: ComponentComparableJsonValue };

type ComponentComparableJsonObject = {
  [key: string]: ComponentComparableJsonValue;
};

type ComponentProjectionGuardValue = string | number | boolean | Date | null;

export interface ComponentProjectionEqualityGuard<C extends BaseComponent> {
  componentProperty: Extract<keyof C, string>;
  expectedValue: ComponentProjectionGuardValue;
}

export type PersistedComponentSyncEventType =
  | EbcaEventType.COMPONENT_ADDED
  | EbcaEventType.COMPONENT_UPDATED;

export interface ComponentBatchReadResult<
  C extends BaseComponent = BaseComponent,
> {
  componentName: string;
  component: C | null;
}

export interface ComponentBatchPresenceResult {
  componentName: string;
  exists: boolean;
}

export type ComponentBatchReadResults<
  T extends readonly ComponentConstructor<BaseComponent>[],
> = {
  [K in keyof T]: T[K] extends ComponentConstructor<infer C>
    ? ComponentBatchReadResult<C>
    : never;
};

export interface ComponentBatchWriteOptions {
  assumeMissing?: boolean;
}

export interface PersistedComponentLifecycleSync {
  entity: BaseEntity;
  component: BaseComponent;
  eventType: PersistedComponentSyncEventType;
}

interface ComponentBatchLifecycleSync {
  component: BaseComponent;
  eventType: PersistedComponentSyncEventType;
}

interface ComponentLifecycleEntityBatch {
  entityClass: EntityConstructor<BaseEntity>;
  entityName: string;
  entityId: string;
  redisKey: string;
  entries: ComponentLifecycleEntityBatchEntry[];
}

interface ComponentLifecycleEntityBatchEntry {
  componentName: string;
  componentClass: ComponentConstructor<BaseComponent>;
  component: BaseComponent;
  eventType: PersistedComponentSyncEventType;
}

@Injectable()
export class ComponentManager implements OnModuleInit {
  private readonly logger = new Logger(ComponentManager.name);
  private redisClient: RedisClientConnectionType;
  private componentConstructorsByName: Map<
    string,
    ComponentConstructor<BaseComponent>
  > = new Map();
  constructor(
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    @Inject('NATS_SERVICE') private readonly natsClient: ClientProxy,
    private readonly persistenceManager: PersistenceManager,
    private readonly orderedIngress: EbcaOrderedIngressService,
  ) {}

  async onModuleInit() {
    this.redisClient = await (
      this.cache.stores[0].store as KeyvRedis<unknown>
    ).getClient();

    const registeredComponents = getRegisteredComponents();
    for (const ComponentClass of registeredComponents) {
      const componentName = getComponentName(ComponentClass);
      this.componentConstructorsByName.set(componentName, ComponentClass);
    }

    this.logger.log(
      'ComponentManager initialized. Redis client ready. Entity and component constructors registered.',
    );
  }

  public async addComponent<E extends BaseEntity, C extends BaseComponent>(
    entity: E,
    component: C,
    userRoles: string[] = [],
  ): Promise<void> {
    const entityClass = entity.constructor as EntityConstructor<E>;
    const componentClass = component.constructor as ComponentConstructor<C>;
    const componentName = getComponentName(componentClass);
    const entityName = getEntityName(entityClass);

    checkComponentPermissions(
      componentClass,
      EbcaEventType.COMPONENT_ADDED,
      userRoles,
    );

    if (!componentName) {
      throw new Error(
        `Component class ${componentClass.name} is missing a valid name.`,
      );
    }

    const now = Date.now();
    if (component instanceof BaseCommandComponent) {
      if (typeof component.createdAt !== 'number') {
        component.createdAt = now;
      }
      component.updatedAt = now;
      const redisKey = buildEbcaRedisKey(entityClass, entity.id);
      await this.redisClient.hDel(redisKey, componentName);
      const topic = buildEbcaTopic({
        entityClass: entityClass,
        entityId: entity.id,
        eventType: EbcaEventType.COMPONENT_ADDED,
        componentClass: componentClass,
      });
      const payload = { entityId: entity.id, component: component };
      const delayedAt = resolveDelayedComponentAt(component);
      if (delayedAt && delayedAt.getTime() > now) {
        this.emitDelayed(topic, payload, delayedAt);
        this.logger.verbose(
          `Transient command ${componentName} ADDED scheduled for ${entityName}:${entity.id} at ${delayedAt.toISOString()}.`,
        );
        return;
      }
      if (
        await this.orderedIngress.publishIfConfigured({
          entityClass,
          entityId: entity.id,
          eventType: EbcaEventType.COMPONENT_ADDED,
          componentClass,
          component,
          payload,
          originalTopic: topic,
        })
      ) {
        this.logger.verbose(
          `Transient command ${componentName} ADDED queued through ordered ingress for ${entityName}:${entity.id}.`,
        );
        return;
      }
      this.natsClient.emit(topic, payload);
      this.logger.verbose(
        `Transient command ${componentName} ADDED emitted for ${entityName}:${entity.id}.`,
      );
      return;
    }

    const exists = await this.hasComponent(entity, componentClass);
    const delayedBy = getComponentOptions(componentClass)?.delayedBy;
    if (delayedBy) {
      throw new Error(
        `Delayed component ${componentName} for ${entityName}:${entity.id} must extend BaseCommandComponent.`,
      );
    }
    if (exists) {
      throw new ConflictException(
        `Component ${componentName} already exists for entity ${entityName}:${entity.id}. Use updateComponent instead.`,
      );
    }

    if (typeof component.createdAt !== 'number') {
      component.createdAt = now;
    }
    component.updatedAt = now;

    const redisKey = buildEbcaRedisKey(entityClass, entity.id);
    const inserted = await this.redisClient.hSetNX(
      redisKey,
      componentName,
      JSON.stringify(component),
    );
    if (inserted === 0) {
      throw new ConflictException(
        `Component ${componentName} already exists for entity ${entityName}:${entity.id}. Use updateComponent instead.`,
      );
    }

    const componentOptions = getComponentOptions(componentClass);

    const persistentProperties = componentClass.getPersistentProperties();
    if (persistentProperties.length > 0) {
      await this.persistenceManager.savePersistentProperties(
        entity,
        entityClass,
        component,
        persistentProperties,
      );
    }

    if (componentOptions?.isPersistent) {
      await this.persistenceManager.saveComponentToJsonb(
        entity,
        entityClass,
        componentName,
        component,
      );
    }

    this.natsClient.emit(
      buildEbcaTopic({
        entityClass: entityClass,
        entityId: entity.id,
        eventType: EbcaEventType.COMPONENT_ADDED,
        componentClass: componentClass,
      }),
      { entityId: entity.id, component: component },
    );
    this.logger.verbose(
      `NATS event for ${componentName} ADDED emitted for ${entityName}:${entity.id}.`,
    );
  }

  public async updateComponent<E extends BaseEntity, C extends BaseComponent>(
    entity: E,
    component: C,
    userRoles: string[] = [],
  ): Promise<void> {
    const entityClass = entity.constructor as EntityConstructor<E>;
    const componentClass = component.constructor as ComponentConstructor<C>;
    const componentName = getComponentName(componentClass);
    const entityName = getEntityName(entityClass);

    checkComponentPermissions(
      componentClass,
      EbcaEventType.COMPONENT_UPDATED,
      userRoles,
    );

    if (!componentName) {
      throw new Error(
        `Component class ${componentClass.name} is missing a valid name.`,
      );
    }

    const now = Date.now();
    if (component instanceof BaseCommandComponent) {
      if (typeof component.createdAt !== 'number') {
        component.createdAt = now;
      }
      component.updatedAt = now;
      const redisKey = buildEbcaRedisKey(entityClass, entity.id);
      await this.redisClient.hDel(redisKey, componentName);
      this.natsClient.emit(
        buildEbcaTopic({
          entityClass: entityClass,
          entityId: entity.id,
          eventType: EbcaEventType.COMPONENT_UPDATED,
          componentClass: componentClass,
        }),
        { entityId: entity.id, component: component },
      );
      this.logger.verbose(
        `Transient command ${componentName} UPDATED emitted for ${entityName}:${entity.id}.`,
      );
      return;
    }

    const existingComponent = await this.getComponent(entity, componentClass);
    if (!existingComponent) {
      throw new NotFoundException(
        `Component ${componentName} not found for entity ${entityName}:${entity.id}. Use addComponent instead.`,
      );
    }

    component.createdAt =
      typeof existingComponent.createdAt === 'number'
        ? existingComponent.createdAt
        : now;
    component.updatedAt = now;

    const redisKey = buildEbcaRedisKey(entityClass, entity.id);
    await this.redisClient.hSet(
      redisKey,
      componentName,
      JSON.stringify(component),
    );

    const componentOptions = getComponentOptions(componentClass);

    const persistentProperties = componentClass.getPersistentProperties();
    if (
      persistentProperties.length > 0 &&
      this.havePersistentPropertiesChanged(
        existingComponent,
        component,
        persistentProperties,
      )
    ) {
      await this.persistenceManager.savePersistentProperties(
        entity,
        entityClass,
        component,
        persistentProperties,
      );
    }

    if (componentOptions?.isPersistent) {
      await this.persistenceManager.saveComponentToJsonb(
        entity,
        entityClass,
        componentName,
        component,
      );
    }

    this.natsClient.emit(
      buildEbcaTopic({
        entityClass: entityClass,
        entityId: entity.id,
        eventType: EbcaEventType.COMPONENT_UPDATED,
        componentClass: componentClass,
      }),
      { entityId: entity.id, component: component },
    );
    this.logger.verbose(
      `NATS event for ${componentName} UPDATED emitted for ${entityName}:${entity.id}.`,
    );
  }

  public async upsertComponent<E extends BaseEntity, C extends BaseComponent>(
    entity: E,
    component: C,
    userRoles: string[] = [],
  ): Promise<void> {
    const entityClass = entity.constructor as EntityConstructor<E>;
    const componentClass = component.constructor as ComponentConstructor<C>;
    const componentOptions = getComponentOptions(componentClass);
    const existingComponent = await this.getComponent(entity, componentClass);
    if (existingComponent) {
      const hasPersistentSnapshot =
        componentOptions?.isPersistent === true
          ? (await this.persistenceManager.loadComponentFromJsonb(
              entity.id,
              entityClass,
              componentClass,
            )) !== null
          : true;
      if (
        hasPersistentSnapshot &&
        this.areComponentsSemanticallyEqual(existingComponent, component)
      ) {
        return;
      }
      await this.updateComponent(entity, component, userRoles);
      return;
    }
    await this.addComponent(entity, component, userRoles);
  }

  public async getComponents<
    E extends BaseEntity,
    const T extends readonly ComponentConstructor<BaseComponent>[],
  >(entity: E, componentClasses: T): Promise<ComponentBatchReadResults<T>> {
    if (componentClasses.length === 0) {
      return [] as ComponentBatchReadResults<T>;
    }
    const entityClass = entity.constructor as EntityConstructor<E>;
    const entityName = getEntityName(entityClass);
    const redisKey = buildEbcaRedisKey(entityClass, entity.id);
    const cachedEntries = await this.redisClient.hGetAll(redisKey);
    const results: ComponentBatchReadResult[] = [];

    for (const componentClass of componentClasses) {
      const componentName = getComponentName(componentClass);
      if (this.isCommandComponentClass(componentClass)) {
        results.push({ componentName, component: null });
        continue;
      }

      const cached = cachedEntries[componentName];
      if (cached) {
        try {
          const plainObject = this.parseStoredComponent(cached);
          if (plainObject) {
            results.push({
              componentName,
              component: Object.assign(new componentClass(), plainObject),
            });
            continue;
          }
        } catch (error) {
          this.logger.error(
            `Failed to parse component ${componentName} from Redis for ${entityName}:${entity.id}`,
            error instanceof Error ? error.stack : String(error),
          );
        }
      }

      results.push({
        componentName,
        component: await this.getComponent(entity, componentClass),
      });
    }

    return results as ComponentBatchReadResults<T>;
  }

  public async hasComponents<E extends BaseEntity>(
    entity: E,
    componentClasses: ComponentConstructor<BaseComponent>[],
  ): Promise<ComponentBatchPresenceResult[]> {
    if (componentClasses.length === 0) {
      return [];
    }
    const entityClass = entity.constructor as EntityConstructor<E>;
    const redisKey = buildEbcaRedisKey(entityClass, entity.id);
    const cachedEntries = await this.redisClient.hGetAll(redisKey);
    let persistedComponentNames: Set<string> | null = null;
    const results: ComponentBatchPresenceResult[] = [];

    for (const componentClass of componentClasses) {
      const componentName = getComponentName(componentClass);
      if (this.isCommandComponentClass(componentClass)) {
        results.push({ componentName, exists: false });
        continue;
      }
      if (Object.prototype.hasOwnProperty.call(cachedEntries, componentName)) {
        results.push({ componentName, exists: true });
        continue;
      }

      const componentOptions = getComponentOptions(componentClass);
      if (componentOptions?.isPersistent === true) {
        if (!persistedComponentNames) {
          persistedComponentNames =
            await this.persistenceManager.loadJsonbComponentNames(
              entity.id,
              entityClass,
            );
        }
        results.push({
          componentName,
          exists: persistedComponentNames.has(componentName),
        });
        continue;
      }

      const persistentProperties = componentClass.getPersistentProperties();
      if (persistentProperties.length === 0) {
        results.push({ componentName, exists: false });
        continue;
      }

      const componentData =
        await this.persistenceManager.loadPersistentProperties(
          entity.id,
          entityClass,
          componentClass,
          persistentProperties,
        );
      results.push({
        componentName,
        exists: componentData !== null && Object.keys(componentData).length > 0,
      });
    }

    return results;
  }

  public async addComponents<E extends BaseEntity>(
    entity: E,
    components: BaseComponent[],
    userRoles: string[] = [],
    options: ComponentBatchWriteOptions = {},
  ): Promise<void> {
    const now = Date.now();
    const entityClass = entity.constructor as EntityConstructor<E>;
    const entityName = getEntityName(entityClass);
    const persistentComponents: BaseComponent[] = [];
    const lifecycleSyncs: ComponentBatchLifecycleSync[] = [];
    const componentNames = new Set<string>();
    const componentClasses: ComponentConstructor<BaseComponent>[] = [];

    for (const component of components) {
      const componentClass =
        component.constructor as ComponentConstructor<BaseComponent>;
      const componentName = getComponentName(componentClass);
      if (componentNames.has(componentName)) {
        throw new ConflictException(
          `Component batch contains duplicate ${componentName}.`,
        );
      }
      componentNames.add(componentName);
      if (!(component instanceof BaseCommandComponent)) {
        componentClasses.push(componentClass);
      }
    }

    const existingComponentNames = options.assumeMissing
      ? new Set<string>()
      : new Set(
          (await this.hasComponents(entity, componentClasses))
            .filter((result) => result.exists)
            .map((result) => result.componentName),
        );

    for (const component of components) {
      const componentClass =
        component.constructor as ComponentConstructor<BaseComponent>;
      const componentName = getComponentName(componentClass);
      if (component instanceof BaseCommandComponent) {
        await this.addComponent(entity, component, userRoles);
        continue;
      }

      checkComponentPermissions(
        componentClass,
        EbcaEventType.COMPONENT_ADDED,
        userRoles,
      );
      if (existingComponentNames.has(componentName)) {
        throw new ConflictException(
          `Component ${componentName} already exists for entity ${entityName}:${entity.id}. Use updateComponent instead.`,
        );
      }
      this.assignComponentWriteTimestamps(component, now, null);
      if (this.shouldPersistComponent(componentClass)) {
        persistentComponents.push(component);
      }
      lifecycleSyncs.push({
        component,
        eventType: EbcaEventType.COMPONENT_ADDED,
      });
    }

    if (persistentComponents.length > 0) {
      await this.runPersistentTransaction(async (manager) => {
        await this.savePersistentComponentSetInTransaction(
          manager,
          entity,
          persistentComponents,
        );
      });
    }
    await this.syncComponentLifecycleBatch(entity, lifecycleSyncs);
  }

  public async updateComponents<E extends BaseEntity>(
    entity: E,
    components: BaseComponent[],
    userRoles: string[] = [],
  ): Promise<void> {
    const now = Date.now();
    const entityClass = entity.constructor as EntityConstructor<E>;
    const entityName = getEntityName(entityClass);
    const persistentComponents: BaseComponent[] = [];
    const lifecycleSyncs: ComponentBatchLifecycleSync[] = [];
    const componentNames = new Set<string>();
    const componentClasses: ComponentConstructor<BaseComponent>[] = [];

    for (const component of components) {
      const componentClass =
        component.constructor as ComponentConstructor<BaseComponent>;
      const componentName = getComponentName(componentClass);
      if (componentNames.has(componentName)) {
        throw new ConflictException(
          `Component batch contains duplicate ${componentName}.`,
        );
      }
      componentNames.add(componentName);
      if (!(component instanceof BaseCommandComponent)) {
        componentClasses.push(componentClass);
      }
    }

    const existingComponentsByName = new Map<string, BaseComponent | null>(
      (await this.getComponents(entity, componentClasses)).map((result) => [
        result.componentName,
        result.component,
      ]),
    );

    for (const component of components) {
      const componentClass =
        component.constructor as ComponentConstructor<BaseComponent>;
      const componentName = getComponentName(componentClass);
      if (component instanceof BaseCommandComponent) {
        await this.updateComponent(entity, component, userRoles);
        continue;
      }

      checkComponentPermissions(
        componentClass,
        EbcaEventType.COMPONENT_UPDATED,
        userRoles,
      );
      const existingComponent =
        existingComponentsByName.get(componentName) ?? null;
      if (!existingComponent) {
        throw new NotFoundException(
          `Component ${componentName} not found for entity ${entityName}:${entity.id}. Use addComponent instead.`,
        );
      }
      this.assignComponentWriteTimestamps(component, now, existingComponent);
      if (this.shouldPersistComponent(componentClass)) {
        persistentComponents.push(component);
      }
      lifecycleSyncs.push({
        component,
        eventType: EbcaEventType.COMPONENT_UPDATED,
      });
    }

    if (persistentComponents.length > 0) {
      await this.runPersistentTransaction(async (manager) => {
        await this.savePersistentComponentSetInTransaction(
          manager,
          entity,
          persistentComponents,
        );
      });
    }
    await this.syncComponentLifecycleBatch(entity, lifecycleSyncs);
  }

  public async upsertComponents<E extends BaseEntity>(
    entity: E,
    components: BaseComponent[],
    userRoles: string[] = [],
  ): Promise<void> {
    const now = Date.now();
    const entityClass = entity.constructor as EntityConstructor<E>;
    const persistentComponents: BaseComponent[] = [];
    const lifecycleSyncs: ComponentBatchLifecycleSync[] = [];
    const componentNames = new Set<string>();
    const componentClasses: ComponentConstructor<BaseComponent>[] = [];

    for (const component of components) {
      const componentClass =
        component.constructor as ComponentConstructor<BaseComponent>;
      const componentName = getComponentName(componentClass);
      if (componentNames.has(componentName)) {
        throw new ConflictException(
          `Component batch contains duplicate ${componentName}.`,
        );
      }
      componentNames.add(componentName);
      if (!(component instanceof BaseCommandComponent)) {
        componentClasses.push(componentClass);
      }
    }

    const existingComponentsByName = new Map<string, BaseComponent | null>(
      (await this.getComponents(entity, componentClasses)).map((result) => [
        result.componentName,
        result.component,
      ]),
    );

    for (const component of components) {
      const componentClass =
        component.constructor as ComponentConstructor<BaseComponent>;
      const componentName = getComponentName(componentClass);
      if (component instanceof BaseCommandComponent) {
        await this.upsertComponent(entity, component, userRoles);
        continue;
      }

      const existingComponent =
        existingComponentsByName.get(componentName) ?? null;
      const eventType = existingComponent
        ? EbcaEventType.COMPONENT_UPDATED
        : EbcaEventType.COMPONENT_ADDED;
      checkComponentPermissions(componentClass, eventType, userRoles);
      this.assignComponentWriteTimestamps(component, now, existingComponent);
      if (existingComponent) {
        const componentOptions = getComponentOptions(componentClass);
        const hasPersistentSnapshot =
          componentOptions?.isPersistent === true
            ? (await this.persistenceManager.loadComponentFromJsonb(
                entity.id,
                entityClass,
                componentClass,
              )) !== null
            : true;
        if (
          hasPersistentSnapshot &&
          this.areComponentsSemanticallyEqual(existingComponent, component)
        ) {
          continue;
        }
      }
      if (this.shouldPersistComponent(componentClass)) {
        persistentComponents.push(component);
      }
      lifecycleSyncs.push({ component, eventType });
    }

    if (persistentComponents.length > 0) {
      await this.runPersistentTransaction(async (manager) => {
        await this.savePersistentComponentSetInTransaction(
          manager,
          entity,
          persistentComponents,
        );
      });
    }
    await this.syncComponentLifecycleBatch(entity, lifecycleSyncs);
  }

  public async tryUpdateComponentWithProjectionGuard<
    E extends BaseEntity,
    C extends BaseComponent,
  >(
    entity: E,
    component: C,
    guard: ComponentProjectionEqualityGuard<C>,
    userRoles: string[] = [],
  ): Promise<boolean> {
    const entityClass = entity.constructor as EntityConstructor<E>;
    const componentClass = component.constructor as ComponentConstructor<C>;
    const componentName = getComponentName(componentClass);
    const entityName = getEntityName(entityClass);

    checkComponentPermissions(
      componentClass,
      EbcaEventType.COMPONENT_UPDATED,
      userRoles,
    );

    if (!componentName) {
      throw new Error(
        `Component class ${componentClass.name} is missing a valid name.`,
      );
    }

    if (component instanceof BaseCommandComponent) {
      throw new Error(
        `Conditional projected write is not supported for transient command ${componentName}.`,
      );
    }

    const now = Date.now();
    const existingComponent = await this.getComponent(entity, componentClass);
    component.createdAt =
      existingComponent && typeof existingComponent.createdAt === 'number'
        ? existingComponent.createdAt
        : now;
    component.updatedAt = now;

    const componentOptions = getComponentOptions(componentClass);
    const persistentProperties = componentClass.getPersistentProperties();
    const updated =
      await this.persistenceManager.tryUpdateComponentWithProjectionGuard(
        entity,
        entityClass,
        componentName,
        component,
        persistentProperties,
        componentOptions?.isPersistent === true,
        guard,
      );
    if (!updated) {
      this.logger.warn(
        `Conditional projected write for ${componentName} skipped for ${entityName}:${entity.id}; guard ${guard.componentProperty} did not match.`,
      );
      return false;
    }

    const redisKey = buildEbcaRedisKey(entityClass, entity.id);
    await this.redisClient.hSet(
      redisKey,
      componentName,
      JSON.stringify(component),
    );

    this.natsClient.emit(
      buildEbcaTopic({
        entityClass: entityClass,
        entityId: entity.id,
        eventType: EbcaEventType.COMPONENT_UPDATED,
        componentClass: componentClass,
      }),
      { entityId: entity.id, component: component },
    );
    this.logger.verbose(
      `NATS event for ${componentName} UPDATED emitted for ${entityName}:${entity.id}.`,
    );
    return true;
  }

  public async runPersistentTransaction<T>(
    work: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return this.persistenceManager.transaction(work);
  }

  public async savePersistentComponentSetInTransaction<E extends BaseEntity>(
    manager: EntityManager,
    entity: E,
    components: BaseComponent[],
  ): Promise<void> {
    const entityClass = entity.constructor as EntityConstructor<E>;
    const entries = components.map((component) => {
      const componentClass =
        component.constructor as ComponentConstructor<BaseComponent>;
      const componentName = getComponentName(componentClass);
      if (!componentName) {
        throw new Error(
          `Component class ${componentClass.name} is missing a valid name.`,
        );
      }
      const componentOptions = getComponentOptions(componentClass);
      return {
        componentName,
        component,
        persistentProperties: componentClass.getPersistentProperties(),
        persistJsonb: componentOptions?.isPersistent === true,
      };
    });
    await this.persistenceManager.saveComponentSetInTransaction(
      manager,
      entity,
      entityClass,
      entries,
    );
  }

  public async syncPersistedComponentLifecycle<
    E extends BaseEntity,
    C extends BaseComponent,
  >(
    entity: E,
    component: C,
    eventType: PersistedComponentSyncEventType,
  ): Promise<void> {
    await this.syncPersistedComponentLifecycleBatch([
      { entity, component, eventType },
    ]);
  }

  public async syncPersistedComponentLifecycleBatch(
    syncs: PersistedComponentLifecycleSync[],
  ): Promise<void> {
    if (syncs.length === 0) {
      return;
    }

    const batches = new Map<string, ComponentLifecycleEntityBatch>();
    for (const sync of syncs) {
      const entityClass = sync.entity
        .constructor as EntityConstructor<BaseEntity>;
      const componentClass = sync.component
        .constructor as ComponentConstructor<BaseComponent>;
      const componentName = getComponentName(componentClass);
      const entityName = getEntityName(entityClass);
      if (!componentName) {
        throw new Error(
          `Component class ${componentClass.name} is missing a valid name.`,
        );
      }
      if (sync.component instanceof BaseCommandComponent) {
        throw new Error(
          `Persistent lifecycle sync is not supported for transient command ${componentName}.`,
        );
      }

      const redisKey = buildEbcaRedisKey(entityClass, sync.entity.id);
      const batchKey = `${entityName}:${sync.entity.id}`;
      const existingBatch = batches.get(batchKey);
      const batch = existingBatch ?? {
        entityClass,
        entityName,
        entityId: sync.entity.id,
        redisKey,
        entries: [],
      };
      batch.entries.push({
        componentName,
        componentClass,
        component: sync.component,
        eventType: sync.eventType,
      });
      batches.set(batchKey, batch);
    }

    for (const batch of batches.values()) {
      const redisFields: Record<string, string> = {};
      for (const entry of batch.entries) {
        redisFields[entry.componentName] = JSON.stringify(entry.component);
      }
      await this.redisClient.hSet(batch.redisKey, redisFields);
      for (const entry of batch.entries) {
        this.natsClient.emit(
          buildEbcaTopic({
            entityClass: batch.entityClass,
            entityId: batch.entityId,
            eventType: entry.eventType,
            componentClass: entry.componentClass,
          }),
          { entityId: batch.entityId, component: entry.component },
        );
        this.logger.verbose(
          `Component ${entry.componentName} ${entry.eventType} synced for ${batch.entityName}:${batch.entityId}.`,
        );
      }
    }
  }

  public async syncPersistedComponentRemoval<
    E extends BaseEntity,
    C extends BaseComponent,
  >(
    entity: E,
    componentClass: ComponentConstructor<C>,
    previousComponent: C | null = null,
  ): Promise<void> {
    const entityClass = entity.constructor as EntityConstructor<E>;
    const componentName = getComponentName(componentClass);
    const entityName = getEntityName(entityClass);
    const redisKey = buildEbcaRedisKey(entityClass, entity.id);
    await this.redisClient.hDel(redisKey, componentName);
    this.natsClient.emit(
      buildEbcaTopic({
        entityClass: entityClass,
        entityId: entity.id,
        eventType: EbcaEventType.COMPONENT_REMOVED,
        componentClass: componentClass,
      }),
      {
        entityId: entity.id,
        componentName,
        previousComponent,
      },
    );
    this.logger.verbose(
      `Persisted ${componentName} REMOVED synced for ${entityName}:${entity.id}.`,
    );
  }

  public async removeComponent<E extends BaseEntity, C extends BaseComponent>(
    entity: E,
    componentClass: ComponentConstructor<C>,
    userRoles: string[] = [],
  ): Promise<void> {
    const entityClass = entity.constructor as EntityConstructor<E>;
    const componentName = getComponentName(componentClass);
    const entityName = getEntityName(entityClass);

    checkComponentPermissions(
      componentClass,
      EbcaEventType.COMPONENT_REMOVED,
      userRoles,
    );

    if (this.isCommandComponentClass(componentClass)) {
      const terminalComponent = new componentClass();
      if (terminalComponent instanceof BaseCommandComponent) {
        terminalComponent.succeed();
      }
      const now = Date.now();
      terminalComponent.createdAt = now;
      terminalComponent.updatedAt = now;
      const redisKey = buildEbcaRedisKey(entityClass, entity.id);
      await this.redisClient.hDel(redisKey, componentName);
      this.natsClient.emit(
        buildEbcaTopic({
          entityClass: entityClass,
          entityId: entity.id,
          eventType: EbcaEventType.COMPONENT_UPDATED,
          componentClass: componentClass,
        }),
        { entityId: entity.id, component: terminalComponent },
      );
      this.logger.verbose(
        `Transient command ${componentName} SUCCEEDED emitted for ${entityName}:${entity.id}.`,
      );
      return;
    }

    const existingComponent = await this.getComponent(entity, componentClass);
    const redisKey = buildEbcaRedisKey(entityClass, entity.id);
    const result = await this.redisClient.hDel(redisKey, componentName);
    if (result === 0) {
      this.logger.warn(
        `Attempted to remove component ${componentName} from ${entityName}:${entity.id}, but it was not found in Redis.`,
      );
    }

    const componentOptions = getComponentOptions(componentClass);

    const persistentProperties = componentClass.getPersistentProperties();
    if (persistentProperties.length > 0) {
      await this.persistenceManager.clearPersistentProperties(
        entity.id,
        entityClass,
        persistentProperties,
      );
    }

    const removedComponentData: C | null = existingComponent;
    if (componentOptions?.isPersistent) {
      await this.persistenceManager.removeComponentFromJsonb(
        entity.id,
        entityClass,
        componentClass,
      );
    }

    this.natsClient.emit(
      buildEbcaTopic({
        entityClass: entityClass,
        entityId: entity.id,
        eventType: EbcaEventType.COMPONENT_REMOVED,
        componentClass: componentClass,
      }),
      {
        entityId: entity.id,
        componentName,
        previousComponent: removedComponentData,
      },
    );
    this.logger.verbose(
      `NATS event for ${componentName} REMOVED emitted for ${entityName}:${entity.id}.`,
    );
  }

  public async getComponent<E extends BaseEntity, C extends BaseComponent>(
    entity: E,
    componentClass: ComponentConstructor<C>,
  ): Promise<C | null> {
    const entityClass = entity.constructor as EntityConstructor<E>;
    const componentName = getComponentName(componentClass);
    const entityName = getEntityName(entityClass);
    if (this.isCommandComponentClass(componentClass)) {
      return null;
    }
    const redisKey = buildEbcaRedisKey(entityClass, entity.id);

    let componentInstance: C | null = null;

    const data = await this.redisClient.hGet(redisKey, componentName);
    if (data) {
      try {
        const plainObject = this.parseStoredComponent(data);
        if (!plainObject) {
          this.logger.warn(
            `Component ${componentName} in Redis has invalid payload, loading fallback sources.`,
          );
        } else {
          componentInstance = Object.assign(
            new componentClass(),
            plainObject as Partial<C>,
          );
          return componentInstance;
        }
      } catch (error) {
        this.logger.error(
          `Failed to parse component ${componentName} from Redis for ${entityName}:${entity.id}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    const componentOptions = getComponentOptions(componentClass);
    const persistentProperties = componentClass.getPersistentProperties();

    if (componentOptions?.isPersistent || persistentProperties.length > 0) {
      if (componentOptions?.isPersistent) {
        componentInstance =
          await this.persistenceManager.loadComponentFromJsonb(
            entity.id,
            entityClass,
            componentClass,
          );
      }

      if (!componentInstance && persistentProperties.length > 0) {
        const componentDataFromProjection =
          await this.persistenceManager.loadPersistentProperties(
            entity.id,
            entityClass,
            componentClass,
            persistentProperties,
          );
        if (componentDataFromProjection) {
          componentInstance = Object.assign(
            new componentClass(),
            componentDataFromProjection,
          );
        }
      }

      if (componentInstance) {
        await this.redisClient.hSet(
          redisKey,
          componentName,
          JSON.stringify(componentInstance),
        );
        return componentInstance;
      }
    }

    return null;
  }

  public async getCachedComponents<E extends BaseEntity>(
    entity: E,
  ): Promise<Array<{ componentName: string; component: BaseComponent }>> {
    const entityClass = entity.constructor as EntityConstructor<E>;
    const entityName = getEntityName(entityClass);
    const redisKey = buildEbcaRedisKey(entityClass, entity.id);
    const entries = await this.redisClient.hGetAll(redisKey);
    const components: Array<{
      componentName: string;
      component: BaseComponent;
    }> = [];

    for (const [componentName, data] of Object.entries(entries)) {
      const componentClass =
        this.componentConstructorsByName.get(componentName);
      if (!componentClass) {
        this.logger.warn(
          `Component constructor ${componentName} not registered for ${entityName}:${entity.id}.`,
        );
        continue;
      }
      if (this.isCommandComponentClass(componentClass)) {
        await this.redisClient.hDel(redisKey, componentName);
        continue;
      }

      try {
        const plainObject = this.parseStoredComponent(data);
        if (!plainObject) {
          continue;
        }
        components.push({
          componentName,
          component: Object.assign(new componentClass(), plainObject),
        });
      } catch (error) {
        this.logger.error(
          `Failed to parse component ${componentName} from Redis for ${entityName}:${entity.id}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    return components;
  }

  public async hasComponent<E extends BaseEntity, C extends BaseComponent>(
    entity: E,
    componentClass: ComponentConstructor<C>,
  ): Promise<boolean> {
    const entityClass = entity.constructor as EntityConstructor<E>;
    const componentName = getComponentName(componentClass);
    if (this.isCommandComponentClass(componentClass)) {
      return false;
    }
    const redisKey = buildEbcaRedisKey(entityClass, entity.id);
    const hasInRedis = await this.redisClient.hExists(redisKey, componentName);

    if (hasInRedis) {
      return true;
    }

    const componentOptions = getComponentOptions(componentClass);
    const persistentProperties = componentClass.getPersistentProperties();

    if (componentOptions?.isPersistent) {
      const componentFromJSONB =
        await this.persistenceManager.loadComponentFromJsonb(
          entity.id,
          entityClass,
          componentClass,
        );
      if (componentFromJSONB) {
        await this.redisClient.hSet(
          redisKey,
          componentName,
          JSON.stringify(componentFromJSONB),
        );
        return true;
      }
    }

    if (
      componentOptions?.isPersistent !== true &&
      persistentProperties.length > 0
    ) {
      const componentDataFromProjection =
        await this.persistenceManager.loadPersistentProperties(
          entity.id,
          entityClass,
          componentClass,
          persistentProperties,
        );
      if (
        componentDataFromProjection &&
        Object.keys(componentDataFromProjection).length > 0
      ) {
        return true;
      }
    }

    return false;
  }

  private assignComponentWriteTimestamps(
    component: BaseComponent,
    now: number,
    existingComponent: BaseComponent | null,
  ): void {
    component.createdAt =
      existingComponent && typeof existingComponent.createdAt === 'number'
        ? existingComponent.createdAt
        : now;
    component.updatedAt = now;
  }

  private shouldPersistComponent(
    componentClass: ComponentConstructor<BaseComponent>,
  ): boolean {
    return (
      getComponentOptions(componentClass)?.isPersistent === true ||
      componentClass.getPersistentProperties().length > 0
    );
  }

  private async syncComponentLifecycleBatch<E extends BaseEntity>(
    entity: E,
    lifecycleSyncs: ComponentBatchLifecycleSync[],
  ): Promise<void> {
    await this.syncPersistedComponentLifecycleBatch(
      lifecycleSyncs.map((sync) => ({
        entity,
        component: sync.component,
        eventType: sync.eventType,
      })),
    );
  }

  private parseStoredComponent(data: string): Record<string, unknown> | null {
    const parsed: unknown = JSON.parse(data);
    if (!this.isRecord(parsed)) {
      this.logger.warn('Stored component payload is not an object.');
      return null;
    }
    return parsed;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private emitDelayed<C extends BaseCommandComponent>(
    topic: string,
    payload: { entityId: string; component: C },
    delayedAt: Date,
  ): void {
    const scheduleHeaders = headers();
    const scheduledTarget = `${EBCA_DELAYED_TOPIC_PREFIX}.${topic}`;
    scheduleHeaders.set('Nats-Schedule', `@at ${delayedAt.toISOString()}`);
    scheduleHeaders.set('Nats-Schedule-Target', scheduledTarget);
    this.natsClient.emit(
      `${EBCA_DELAYED_TOPIC_PREFIX}.schedule.${topic}`,
      new NatsRecordBuilder(payload).setHeaders(scheduleHeaders).build(),
    );
  }

  private areComponentsSemanticallyEqual(
    left: BaseComponent,
    right: BaseComponent,
  ): boolean {
    return (
      this.serializeComponentForComparison(left) ===
      this.serializeComponentForComparison(right)
    );
  }

  private havePersistentPropertiesChanged(
    left: BaseComponent,
    right: BaseComponent,
    persistentProperties: PersistentPropertyMetadata<BaseEntity>[],
  ): boolean {
    return (
      this.serializePersistentPropertiesForComparison(
        left,
        persistentProperties,
      ) !==
      this.serializePersistentPropertiesForComparison(
        right,
        persistentProperties,
      )
    );
  }

  private serializePersistentPropertiesForComparison(
    component: BaseComponent,
    persistentProperties: PersistentPropertyMetadata<BaseEntity>[],
  ): string {
    const comparable = this.toComparableComponentObject(component);
    const selected: ComponentComparableJsonObject = {};
    for (const property of persistentProperties) {
      const value = comparable[property.componentProperty];
      if (value !== undefined) {
        selected[property.componentProperty] = value;
      }
    }
    return JSON.stringify(this.sortComparableJsonValue(selected));
  }

  private serializeComponentForComparison(component: BaseComponent): string {
    const comparable = this.toComparableComponentObject(component);
    delete comparable.createdAt;
    delete comparable.updatedAt;
    return JSON.stringify(this.sortComparableJsonValue(comparable));
  }

  private toComparableComponentObject(
    component: BaseComponent,
  ): ComponentComparableJsonObject {
    return JSON.parse(
      JSON.stringify(component),
    ) as ComponentComparableJsonObject;
  }

  private isCommandComponentClass<C extends BaseComponent>(
    componentClass: ComponentConstructor<C>,
  ): boolean {
    return new componentClass() instanceof BaseCommandComponent;
  }

  private sortComparableJsonValue(
    value: ComponentComparableJsonValue,
  ): ComponentComparableJsonValue {
    if (Array.isArray(value)) {
      return value.map((item) => this.sortComparableJsonValue(item));
    }
    if (value !== null && typeof value === 'object') {
      const sorted: ComponentComparableJsonObject = {};
      for (const key of Object.keys(value).sort()) {
        sorted[key] = this.sortComparableJsonValue(value[key]);
      }
      return sorted;
    }
    return value;
  }
}
