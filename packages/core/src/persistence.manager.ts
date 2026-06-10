import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  DataSource,
  DeepPartial,
  EntityManager,
  FindOptionsWhere,
  Repository,
} from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { BaseComponent } from './bases/base.component';
import { PersistentPropertyMetadata } from './decorators/persistent-property.decorator';
import { BaseEntity } from './bases/base.entity';
import { getComponentName, getEntityName } from './ebca.helpers';
import { EntityConstructor } from './types/entities';
import { ComponentConstructor } from './types/componens';
import { getRegisteredComponents } from './decorators/component.decorator';

type PersistentColumnValue =
  | string
  | number
  | boolean
  | Date
  | null
  | PersistentColumnValue[]
  | { [key: string]: PersistentColumnValue };

type PersistentProjectionGuardValue = string | number | boolean | Date | null;

interface PersistentProjectionEqualityGuard<C extends BaseComponent> {
  componentProperty: Extract<keyof C, string>;
  expectedValue: PersistentProjectionGuardValue;
}

interface PersistentComponentSetEntry {
  componentName: string;
  component: BaseComponent;
  persistentProperties: PersistentPropertyMetadata<BaseEntity>[];
  persistJsonb: boolean;
}

@Injectable()
export class PersistenceManager implements OnModuleInit {
  private readonly logger = new Logger(PersistenceManager.name);

  // Маппинг имени компонента (строка из Class.name или опций) к конструктору класса компонента
  private componentConstructors: Map<
    string,
    ComponentConstructor<BaseComponent>
  > = new Map();

  constructor(private readonly dataSource: DataSource) {}

  public async transaction<T>(
    work: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return this.dataSource.transaction(work);
  }

  onModuleInit() {
    // Автоматическая регистрация компонентов для PersistenceManager
    // Это нужно для loadComponentFromJsonb, если компонент нужно будет десериализовать
    const registeredComponents = getRegisteredComponents();
    for (const ComponentClass of registeredComponents) {
      this.componentConstructors.set(
        getComponentName(ComponentClass),
        ComponentClass,
      );
      this.logger.debug(
        `Registered component in PersistenceManager: ${getComponentName(ComponentClass)}`,
      );
    }
    this.logger.log(
      'PersistenceManager initialized. Component constructors registered.',
    );
  }

  /**
   * Возвращает типизированный репозиторий для указанного класса сущности TypeORM.
   * @param EntityClass Конструктор класса сущности TypeORM.
   * @returns Репозиторий для TEntity или undefined, если конструктор не найден.
   */
  public getRepositoryForEntity<TEntity extends BaseEntity>(
    EntityClass: EntityConstructor<TEntity>,
  ): Repository<TEntity> | undefined {
    try {
      return this.dataSource.getRepository(EntityClass);
    } catch (error) {
      this.logger.error(
        `Failed to get repository for entity ${EntityClass.name}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return undefined;
    }
  }

  /**
   * Возвращает конструктор компонента по его строковому имени.
   * @param componentName Строковое имя компонента.
   * @returns Конструктор класса компонента или undefined.
   */
  private getComponentConstructorByName(
    componentName: string,
  ): ComponentConstructor<BaseComponent> | undefined {
    const constructor = this.componentConstructors.get(componentName);
    if (!constructor) {
      this.logger.warn(
        `Component constructor for ${componentName} not registered in PersistenceManager.`,
      );
    }
    return constructor;
  }

  /**
   * Определяет правильное условие WHERE для поиска целевой сущности TypeORM,
   * предполагая, что связь осуществляется по полю 'id' главной EBCA сущности.
   *
   * @param mainEntityId ID основной сущности (нашей BaseEntity).
   * @returns Объект FindOptionsWhere.
   */
  private getWhereClauseForTargetEntity<E extends BaseEntity>(
    mainEntityId: string,
  ): FindOptionsWhere<E> {
    // Согласно договоренности, мы предполагаем, что целевая TypeORM сущность
    // связана с основной EBCA сущностью через поле 'id'.
    // Если для какой-то сущности требуется иное поле (например, 'userId'),
    // это поле должно быть либо проецировано, либо связь должна быть обработана
    // на более высоком уровне или в специализированной системе.
    return { id: mainEntityId } as FindOptionsWhere<E>;
  }

  /**
   * Сохраняет значения свойств компонента в указанные поля целевых сущностей TypeORM (проекции).
   * Если целевая сущность не существует, она будет создана (если возможно).
   *
   * @param mainEntityId ID основной EBCA сущности (BaseEntity).
   * @param component Экземпляр компонента с персистентными свойствами.
   * @param persistentProperties Метаданные персистентных свойств компонента.
   */
  public async savePersistentProperties<E extends BaseEntity>(
    mainEntity: E,
    ebcaEntityClass: EntityConstructor<E>,
    component: BaseComponent,
    persistentProperties: PersistentPropertyMetadata<BaseEntity>[],
  ): Promise<void> {
    const mainEntityId = mainEntity.id;
    const propsForTargetEntity = this.scopePropertiesToEntity(
      persistentProperties,
      ebcaEntityClass,
    );
    if (propsForTargetEntity.length === 0) {
      return;
    }
    const targetEntityName = getEntityName(ebcaEntityClass);
    const repository = this.getRepositoryForEntity(ebcaEntityClass);
    if (!repository) {
      this.logger.warn(
        `No repository found for entity ${targetEntityName} during savePersistentProperties.`,
      );
      return;
    }

    const updateData = this.createPersistentPatch<E>(
      propsForTargetEntity,
      component,
    );

    try {
      const whereClause = this.getWhereClauseForTargetEntity<E>(mainEntityId);

      const targetEntity = await repository.findOne({
        where: whereClause,
      });

      if (targetEntity) {
        await repository
          .createQueryBuilder()
          .update(ebcaEntityClass)
          .set(updateData)
          .where(whereClause)
          .execute();
        this.logger.debug(
          `Updated ${targetEntityName} for main entity ${mainEntityId}. Properties: ${Object.keys(updateData).join(', ')}.`,
        );
      } else {
        const createData = {
          ...(mainEntity as DeepPartial<E>),
          ...updateData,
          id: mainEntityId,
        } as QueryDeepPartialEntity<E>;
        await repository
          .createQueryBuilder()
          .insert()
          .into(ebcaEntityClass)
          .values(createData)
          .execute();
        this.logger.debug(
          `Created new ${targetEntityName} for main entity ${mainEntityId}. Properties: ${Object.keys(updateData).join(', ')}.`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to save persistent properties for ${targetEntityName} (linked to ${mainEntityId})`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /**
   * Очищает (устанавливает в null) значения свойств компонента в указанных полях целевых сущностей TypeORM (проекции).
   *
   * @param mainEntityId ID основной EBCA сущности (BaseEntity).
   * @param persistentProperties Метаданные персистентных свойств компонента.
   */
  public async clearPersistentProperties<E extends BaseEntity>(
    mainEntityId: string,
    ebcaEntityClass: EntityConstructor<E>,
    persistentProperties: PersistentPropertyMetadata<BaseEntity>[],
  ): Promise<void> {
    const propsForTargetEntity = this.scopePropertiesToEntity(
      persistentProperties,
      ebcaEntityClass,
    );
    if (propsForTargetEntity.length === 0) {
      return;
    }
    const targetEntityName = getEntityName(ebcaEntityClass);
    const repository = this.getRepositoryForEntity(ebcaEntityClass);
    if (!repository) {
      this.logger.warn(
        `No repository found for entity ${targetEntityName} during clearPersistentProperties.`,
      );
      return;
    }

    const updateData: QueryDeepPartialEntity<E> = {};
    for (const propMeta of propsForTargetEntity) {
      const resolvedValue = this.resolveClearedColumnValue(
        repository,
        propMeta.entityProperty as string,
      );
      if (!resolvedValue.shouldSet) {
        continue;
      }
      Object.assign(updateData, {
        [propMeta.entityProperty as string]: resolvedValue.value,
      });
    }

    if (Object.keys(updateData).length === 0) {
      this.logger.warn(
        `Skipped clearPersistentProperties for ${targetEntityName} (linked to ${mainEntityId}) because no safe reset value was resolved.`,
      );
      return;
    }

    try {
      const whereClause = this.getWhereClauseForTargetEntity<E>(mainEntityId);
      await repository
        .createQueryBuilder()
        .update(ebcaEntityClass)
        .set(updateData)
        .where(whereClause)
        .execute();
      this.logger.debug(
        `Cleared persistent properties for ${targetEntityName} (linked to ${mainEntityId}).`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to clear persistent properties for ${targetEntityName} (linked to ${mainEntityId})`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private resolveClearedColumnValue<TEntity extends BaseEntity>(
    repository: Repository<TEntity>,
    propertyName: string,
  ): { shouldSet: boolean; value: unknown } {
    const column = repository.metadata.findColumnWithPropertyName(propertyName);
    if (!column) {
      return { shouldSet: true, value: null };
    }
    if (column.isNullable) {
      return { shouldSet: true, value: null };
    }
    if (column.default !== undefined) {
      return {
        shouldSet: true,
        value: this.resolveColumnDefaultValue(column.default),
      };
    }
    this.logger.warn(
      `Cannot clear non-nullable property ${repository.metadata.name}.${propertyName}: column default is missing.`,
    );
    return { shouldSet: false, value: null };
  }

  private resolveColumnDefaultValue(defaultValue: unknown): unknown {
    if (
      typeof defaultValue === 'string' &&
      defaultValue.startsWith("'") &&
      defaultValue.endsWith("'") &&
      defaultValue.length >= 2
    ) {
      return defaultValue.slice(1, -1);
    }
    return defaultValue;
  }

  /**
   * Загружает значения свойств компонента из указанных полей целевых сущностей TypeORM (проекции).
   *
   * @param mainEntityId ID основной EBCA сущности (BaseEntity).
   * @param componentClass Конструктор класса компонента.
   * @param persistentProperties Метаданные персистентных свойств компонента.
   * @returns Объект с загруженными свойствами компонента или null, если данных нет.
   */
  public async loadPersistentProperties<
    E extends BaseEntity,
    C extends BaseComponent,
  >(
    mainEntityId: string,
    ebcaEntityClass: EntityConstructor<E>,
    componentClass: ComponentConstructor<C>,
    persistentProperties: PersistentPropertyMetadata<BaseEntity>[],
  ): Promise<Record<string, unknown> | null> {
    const propsForTargetEntity = this.scopePropertiesToEntity(
      persistentProperties,
      ebcaEntityClass,
    );
    if (propsForTargetEntity.length === 0) {
      return null;
    }
    const componentData: Record<string, unknown> = {};
    let hasData = false;
    const targetEntityName = getEntityName(ebcaEntityClass);
    const repository = this.getRepositoryForEntity(ebcaEntityClass);
    if (!repository) {
      this.logger.warn(
        `No repository found for entity ${targetEntityName} during loadPersistentProperties.`,
      );
      return null;
    }

    const selectColumns = propsForTargetEntity.map((p) => p.entityProperty);
    const whereClause = this.getWhereClauseForTargetEntity<E>(mainEntityId);

    try {
      const entity = await repository.findOne({
        where: whereClause,
        select: selectColumns,
      });

      if (entity) {
        for (const propMeta of propsForTargetEntity) {
          const value = entity[propMeta.entityProperty];
          if (value !== undefined && value !== null) {
            componentData[propMeta.componentProperty] = value;
            hasData = true;
          }
        }
      }
    } catch (error) {
      this.logger.error(
        `Failed to load persistent properties from ${targetEntityName} (linked to ${mainEntityId}) for component ${getComponentName(componentClass)}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
    return hasData ? componentData : null;
  }

  public async loadJsonbComponentNames<E extends BaseEntity>(
    entityId: E['id'],
    ebcaEntityClass: EntityConstructor<E>,
  ): Promise<Set<string>> {
    const repository = this.getRepositoryForEntity(ebcaEntityClass);
    if (!repository) {
      this.logger.error(
        `Repository for EBCA entity ${ebcaEntityClass.name} not found for JSONB component name load.`,
      );
      throw new Error(
        `Repository for EBCA entity ${ebcaEntityClass.name} not found.`,
      );
    }
    const entity = await repository.findOne({
      where: this.getWhereClauseForTargetEntity<E>(entityId),
      select: ['components' as keyof E],
    });
    return new Set(Object.keys(entity?.components ?? {}));
  }

  public async tryUpdateComponentWithProjectionGuard<
    E extends BaseEntity,
    C extends BaseComponent,
  >(
    entity: E,
    ebcaEntityClass: EntityConstructor<E>,
    componentName: string,
    component: C,
    persistentProperties: PersistentPropertyMetadata<BaseEntity>[],
    persistJsonb: boolean,
    guard: PersistentProjectionEqualityGuard<C>,
  ): Promise<boolean> {
    const entityId = entity.id;
    const propsForTargetEntity = this.scopePropertiesToEntity(
      persistentProperties,
      ebcaEntityClass,
    );
    const guardProperty = propsForTargetEntity.find(
      (property) => property.componentProperty === guard.componentProperty,
    );
    if (!guardProperty) {
      throw new Error(
        `Component ${componentName} has no projected property ${guard.componentProperty} for ${getEntityName(ebcaEntityClass)} guard.`,
      );
    }

    const repository = this.getRepositoryForEntity(ebcaEntityClass);
    if (!repository) {
      this.logger.error(
        `Repository for EBCA entity ${ebcaEntityClass.name} not found for conditional projected write.`,
      );
      throw new Error(
        `Repository for EBCA entity ${ebcaEntityClass.name} not found.`,
      );
    }

    const idColumn = repository.metadata.findColumnWithPropertyName('id');
    const guardColumn = repository.metadata.findColumnWithPropertyName(
      guardProperty.entityProperty as string,
    );
    if (!idColumn || !guardColumn) {
      throw new Error(
        `Cannot resolve conditional write columns for ${getEntityName(ebcaEntityClass)}.${componentName}.`,
      );
    }

    const updateData = this.createPersistentPatch<E>(
      propsForTargetEntity,
      component,
    );
    const componentJsonbPatch = JSON.stringify({ [componentName]: component });

    if (persistJsonb) {
      Object.assign(
        updateData,
        this.createComponentJsonbMergePatch<E>(repository),
      );
    }

    try {
      const result = await repository
        .createQueryBuilder()
        .update(ebcaEntityClass)
        .set(updateData)
        .where(
          `${this.dataSource.driver.escape(idColumn.databaseName)} = :entityId`,
          { entityId },
        )
        .andWhere(
          `${this.dataSource.driver.escape(guardColumn.databaseName)} = :guardValue`,
          { guardValue: guard.expectedValue },
        )
        .setParameters({ componentJsonbPatch })
        .execute();
      const updated = (result.affected ?? 0) > 0;
      if (!updated) {
        this.logger.warn(
          `Conditional projected write lost for ${getEntityName(ebcaEntityClass)}:${entityId} component ${componentName}; ${String(guardProperty.entityProperty)} was not ${String(guard.expectedValue)}.`,
        );
      }
      return updated;
    } catch (error) {
      this.logger.error(
        `Failed conditional projected write for ${getEntityName(ebcaEntityClass)}:${entityId} component ${componentName}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  public async saveComponentSetInTransaction<E extends BaseEntity>(
    manager: EntityManager,
    entity: E,
    ebcaEntityClass: EntityConstructor<E>,
    entries: PersistentComponentSetEntry[],
  ): Promise<void> {
    const entityId = entity.id;
    const repository = manager.getRepository(ebcaEntityClass);
    const whereClause = this.getWhereClauseForTargetEntity<E>(entityId);
    const currentEntity = await repository.findOne({
      where: whereClause,
    });
    const updateData: QueryDeepPartialEntity<E> = {};
    const nextComponents = {
      ...(currentEntity?.components ?? entity.components ?? {}),
    };
    for (const entry of entries) {
      const propsForTargetEntity = this.scopePropertiesToEntity(
        entry.persistentProperties,
        ebcaEntityClass,
      );
      if (propsForTargetEntity.length > 0) {
        Object.assign(
          updateData,
          this.createPersistentPatch<E>(propsForTargetEntity, entry.component),
        );
      }
      if (entry.persistJsonb) {
        nextComponents[entry.componentName] = entry.component;
      }
    }
    Object.assign(updateData, this.createComponentsPatch<E>(nextComponents));
    if (currentEntity) {
      await repository.update(whereClause, updateData);
      this.logger.debug(
        `Updated component set for ${getEntityName(ebcaEntityClass)}:${entityId}.`,
      );
      return;
    }
    const createData = {
      ...(entity as DeepPartial<E>),
      ...updateData,
      id: entityId,
      components: nextComponents,
    } as QueryDeepPartialEntity<E>;
    await repository
      .createQueryBuilder()
      .insert()
      .into(ebcaEntityClass)
      .values(createData)
      .execute();
    this.logger.debug(
      `Created component set for ${getEntityName(ebcaEntityClass)}:${entityId}.`,
    );
  }

  /**
   * Сохраняет JSON-представление компонента в поле `components` сущности `BaseEntity`.
   *
   * @param entityId ID сущности.
   * @param ebcaEntityClass Конструктор EBCA сущности (наследует от BaseEntity).
   * @param componentName Имя компонента.
   * @param componentData Объект компонента.
   */
  public async saveComponentToJsonb<
    E extends BaseEntity,
    C extends BaseComponent,
  >(
    entity: E,
    ebcaEntityClass: EntityConstructor<E>,
    componentName: string,
    componentData: C,
  ): Promise<void> {
    const entityId = entity.id;
    const repository = this.getRepositoryForEntity(ebcaEntityClass);
    if (!repository) {
      this.logger.error(
        `Repository for EBCA entity ${ebcaEntityClass.name} not found for JSONB save.`,
      );
      throw new Error(
        `Repository for EBCA entity ${ebcaEntityClass.name} not found.`,
      );
    }

    try {
      // Загружаем сущность, чтобы обновить ее components JSONB поле

      const currentEntity = await repository.findOne({
        where: this.getWhereClauseForTargetEntity<E>(entityId),
      });

      if (!currentEntity) {
        const createData = {
          ...(entity as DeepPartial<E>),
          id: entityId,
          components: {
            [componentName]: componentData,
          },
        } as QueryDeepPartialEntity<E>;
        await repository
          .createQueryBuilder()
          .insert()
          .into(ebcaEntityClass)
          .values(createData)
          .execute();
        this.logger.log(
          `Created new EBCA Entity ${ebcaEntityClass.name}:${entityId} for JSONB component persistence as it was not found.`,
        );
        return;
      }

      const nextComponents = {
        ...currentEntity.components,
        [componentName]: componentData,
      };
      await repository
        .createQueryBuilder()
        .update(ebcaEntityClass)
        .set(this.createComponentsPatch<E>(nextComponents))
        .where(this.getWhereClauseForTargetEntity<E>(entityId))
        .execute();
      this.logger.debug(
        `Persisted component ${componentName} into JSONB for ${getEntityName(ebcaEntityClass)}:${entityId}.`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to save component ${componentName} to JSONB for ${getEntityName(ebcaEntityClass)}:${entityId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  /**
   * Загружает JSON-представление компонента из поля `components` сущности `BaseEntity`.
   *
   * @param entityId ID сущности.
   * @param ebcaEntityClass Конструктор EBCA сущности (наследует от BaseEntity).
   * @param componentClass Конструктор класса компонента.
   * @returns Экземпляр компонента или null.
   */
  public async loadComponentFromJsonb<
    E extends BaseEntity,
    C extends BaseComponent,
  >(
    entityId: E['id'],
    ebcaEntityClass: EntityConstructor<E>,
    componentClass: ComponentConstructor<C>,
  ): Promise<C | null> {
    const componentName = getComponentName(componentClass);
    const repository = this.getRepositoryForEntity(ebcaEntityClass);
    if (!repository) {
      this.logger.error(
        `Repository for EBCA entity ${ebcaEntityClass.name} not found for JSONB load.`,
      );
      return null;
    }

    try {
      const currentEntity = await repository.findOne({
        where: this.getWhereClauseForTargetEntity<E>(entityId),
        select: ['components'],
      });

      if (
        currentEntity &&
        currentEntity.components &&
        currentEntity.components[componentName]
      ) {
        const plainObject = currentEntity.components[componentName];
        // Восстанавливаем экземпляр компонента
        return Object.assign(new componentClass(), plainObject);
      }
    } catch (error) {
      this.logger.error(
        `Failed to load component ${componentName} from JSONB for ${getEntityName(ebcaEntityClass)}:${entityId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
    return null;
  }

  /**
   * Удаляет JSON-представление компонента из поля `components` сущности `BaseEntity`.
   *
   * @param entityId ID сущности.
   * @param ebcaEntityClass Конструктор EBCA сущности (наследует от BaseEntity).
   * @param componentClass Конструктор класса компонента.
   * @returns Удаленный экземпляр компонента или null, если не найден.
   */
  public async removeComponentFromJsonb<
    E extends BaseEntity,
    C extends BaseComponent,
  >(
    entityId: E['id'],
    ebcaEntityClass: EntityConstructor<E>,
    componentClass: ComponentConstructor<C>,
  ): Promise<C | null> {
    const componentName = getComponentName(componentClass);
    const repository = this.getRepositoryForEntity(ebcaEntityClass);
    if (!repository) {
      this.logger.error(
        `Repository for EBCA entity ${ebcaEntityClass.name} not found for JSONB remove.`,
      );
      return null;
    }

    try {
      const currentEntity = await repository.findOne({
        where: this.getWhereClauseForTargetEntity<E>(entityId),
      });
      if (
        currentEntity &&
        currentEntity.components &&
        currentEntity.components[componentName]
      ) {
        const removedComponentData = currentEntity.components[componentName]; // Сохраняем для возврата и лога

        const restComponents = { ...currentEntity.components };
        delete restComponents[componentName];
        currentEntity.components = restComponents as Record<
          ComponentConstructor<BaseComponent>['name'],
          BaseComponent
        >;
        await repository
          .createQueryBuilder()
          .update(ebcaEntityClass)
          .set(this.createComponentsPatch<E>(restComponents))
          .where(this.getWhereClauseForTargetEntity<E>(entityId))
          .execute();
        this.logger.debug(
          `Removed component ${componentName} from JSONB for ${getEntityName(ebcaEntityClass)}:${entityId}.`,
        );
        return Object.assign(new componentClass(), removedComponentData); // Возвращаем десериализованный компонент
      }
    } catch (error) {
      this.logger.error(
        `Failed to remove component ${componentName} from JSONB for ${getEntityName(ebcaEntityClass)}:${entityId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
    return null;
  }

  private createComponentsPatch<E extends BaseEntity>(
    components: E['components'],
  ): QueryDeepPartialEntity<E> {
    const patch: Partial<E> = {};
    patch.components = components;
    return patch as QueryDeepPartialEntity<E>;
  }

  private createComponentJsonbMergePatch<E extends BaseEntity>(
    repository: Repository<E>,
  ): QueryDeepPartialEntity<E> {
    const componentsColumn =
      repository.metadata.findColumnWithPropertyName('components');
    if (!componentsColumn) {
      throw new Error(
        `Cannot resolve components column for ${repository.metadata.name}.`,
      );
    }
    const patch: Partial<E> = {};
    Object.assign(patch, {
      components: () =>
        `COALESCE(${this.dataSource.driver.escape(componentsColumn.databaseName)}, '{}'::jsonb) || CAST(:componentJsonbPatch AS jsonb)`,
    });
    return patch as QueryDeepPartialEntity<E>;
  }

  private createPersistentPatch<E extends BaseEntity>(
    propsForTargetEntity: PersistentPropertyMetadata<BaseEntity>[],
    component: BaseComponent,
  ): QueryDeepPartialEntity<E> {
    const patch: QueryDeepPartialEntity<E> = {};
    const componentValues = component as BaseComponent &
      Record<string, PersistentColumnValue>;
    for (const propMeta of propsForTargetEntity) {
      Object.assign(patch, {
        [propMeta.entityProperty as string]:
          componentValues[propMeta.componentProperty],
      });
    }
    return patch;
  }

  private scopePropertiesToEntity<E extends BaseEntity>(
    properties: PersistentPropertyMetadata<BaseEntity>[],
    ebcaEntityClass: EntityConstructor<E>,
  ): PersistentPropertyMetadata<BaseEntity>[] {
    const entityName = getEntityName(ebcaEntityClass);
    return properties.filter((property) => {
      return getEntityName(property.entityClass) === entityName;
    });
  }
}
