import type { TestingModule } from '@nestjs/testing';
import { ComponentManager } from '@ebca/core/component.manager';
import { BaseComponent } from '@ebca/core/bases/base.component';
import { BaseEntity } from '@ebca/core/bases/base.entity';
import { getComponentConstructorByName } from '@ebca/core/decorators/component.decorator';
import { getEntityConstructorByName } from '@ebca/core/decorators/entity.decorator';
import { ComponentConstructor } from '@ebca/core/types/componens';
import { EntityConstructor } from '@ebca/core/types/entities';

export type ComponentAdminOperation =
  | 'add'
  | 'get'
  | 'remove'
  | 'update'
  | 'upsert';

export type ComponentAdminJsonValue =
  | string
  | number
  | boolean
  | null
  | ComponentAdminJsonObject
  | ComponentAdminJsonValue[];

export interface ComponentAdminJsonObject {
  [key: string]: ComponentAdminJsonValue;
}

export interface ComponentAdminRequest {
  componentName: string;
  entityId: string;
  entityName: string;
  operation: ComponentAdminOperation;
  payload?: ComponentAdminJsonObject;
}

export interface ComponentAdminResult {
  component: ComponentAdminJsonObject | null;
  componentName: string;
  entityId: string;
  entityName: string;
  operation: ComponentAdminOperation;
  status: 'ok';
}

export type ComponentAdminRuntimeFactory =
  () => Promise<TestingModule> | TestingModule;

export interface ComponentAdminRuntimeOptions {
  readonly createTestingModule: ComponentAdminRuntimeFactory;
}

interface ComponentAdminRuntime {
  componentManager: ComponentManager;
  moduleRef: TestingModule;
}

export async function runComponentAdminOperation(
  request: ComponentAdminRequest,
  options: ComponentAdminRuntimeOptions,
): Promise<ComponentAdminResult> {
  const runtime = await createComponentAdminRuntime(options);
  try {
    return await executeComponentAdminOperation(
      runtime.componentManager,
      request,
    );
  } finally {
    await runtime.moduleRef.close();
  }
}

async function createComponentAdminRuntime(
  options: ComponentAdminRuntimeOptions,
): Promise<ComponentAdminRuntime> {
  const moduleRef = await options.createTestingModule();
  await moduleRef.init();
  return {
    componentManager: moduleRef.get(ComponentManager),
    moduleRef,
  };
}

async function executeComponentAdminOperation(
  componentManager: ComponentManager,
  request: ComponentAdminRequest,
): Promise<ComponentAdminResult> {
  const EntityClass = getEntityConstructorByName(request.entityName);
  const ComponentClass = getComponentConstructorByName(request.componentName);
  const entity = createEntityReference(EntityClass, request.entityId);

  if (request.operation === 'get') {
    const component = await componentManager.getComponent(
      entity,
      ComponentClass,
    );
    return createResult(request, toComponentJson(component));
  }

  if (request.operation === 'remove') {
    await componentManager.removeComponent(entity, ComponentClass);
    return createResult(request, null);
  }

  const component = createComponent(ComponentClass, request.payload ?? {});
  if (request.operation === 'add') {
    await componentManager.addComponent(entity, component);
    return createResult(request, toComponentJson(component));
  }
  if (request.operation === 'update') {
    await componentManager.updateComponent(entity, component);
    return createResult(request, toComponentJson(component));
  }

  await componentManager.upsertComponent(entity, component);
  return createResult(request, toComponentJson(component));
}

function createEntityReference(
  EntityClass: EntityConstructor<BaseEntity>,
  entityId: string,
): BaseEntity {
  const entity = new EntityClass();
  entity.id = entityId;
  return entity;
}

function createComponent(
  ComponentClass: ComponentConstructor<BaseComponent>,
  payload: ComponentAdminJsonObject,
): BaseComponent {
  const component = Object.create(ComponentClass.prototype) as BaseComponent;
  return Object.assign(component, payload);
}

function createResult(
  request: ComponentAdminRequest,
  component: ComponentAdminJsonObject | null,
): ComponentAdminResult {
  return {
    component,
    componentName: request.componentName,
    entityId: request.entityId,
    entityName: request.entityName,
    operation: request.operation,
    status: 'ok',
  };
}

function toComponentJson(
  component: BaseComponent | null,
): ComponentAdminJsonObject | null {
  if (!component) {
    return null;
  }
  return JSON.parse(JSON.stringify(component)) as ComponentAdminJsonObject;
}
