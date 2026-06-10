import 'reflect-metadata';
import { BaseComponent } from '../bases/base.component';
import { ForbiddenException, Logger } from '@nestjs/common';
import { EbcaEventType } from '../ebca.helpers';
import { ComponentConstructor, ComponentOptions } from '../types/componens';
import { captureDecoratorSourceFile } from './decorator-source-file';

const logger = new Logger('ComponentDecorator');

export const COMPONENT_METADATA_KEY = Symbol('component_metadata');

type DelayedComponentDateValue = string | number | Date | null | undefined;

// Глобальный реестр для зарегистрированных компонентов
const REGISTERED_COMPONENTS: ComponentConstructor<BaseComponent>[] = [];
const COMPONENT_SOURCE_FILES = new Map<
  ComponentConstructor<BaseComponent>,
  string | null
>();

/**
 * Декоратор для пометки класса как EBCA-компонента.
 * Автоматически регистрирует компонент для обнаружения ComponentManager.
 *
 * @param options Опции компонента, такие как персистентность и права доступа.
 */
export function Component(options?: ComponentOptions) {
  return <T extends ComponentConstructor<BaseComponent>>(target: T) => {
    if (!options) {
      options = {};
    }
    if (options?.isPersistent === undefined) {
      options.isPersistent = false;
    }
    Reflect.defineMetadata(COMPONENT_METADATA_KEY, options, target);
    REGISTERED_COMPONENTS.push(target);
    COMPONENT_SOURCE_FILES.set(target, captureDecoratorSourceFile());
    logger.debug(
      `Registered component: ${target.name} (Persistent: ${options?.isPersistent || false}, Custom Name: ${options?.name || 'N/A'})`,
    );
  };
}

/**
 * Возвращает список всех автоматически зарегистрированных EBCA-компонентов.
 */
export function getRegisteredComponents(): ComponentConstructor<BaseComponent>[] {
  return REGISTERED_COMPONENTS;
}

export function getComponentSourceFile<T extends BaseComponent>(
  target: ComponentConstructor<T>,
): string | null {
  return COMPONENT_SOURCE_FILES.get(target) ?? null;
}

/**
 * Возвращает опции компонента, определенные декоратором @Component.
 * @param target Конструктор класса компонента.
 */
export function getComponentOptions<T extends BaseComponent>(
  target: ComponentConstructor<T>,
): ComponentOptions | undefined {
  const metadata: unknown = Reflect.getMetadata(COMPONENT_METADATA_KEY, target);
  if (!metadata || typeof metadata !== 'object') {
    return undefined;
  }
  return metadata as ComponentOptions;
}

export function resolveDelayedComponentAt(
  component: BaseComponent,
): Date | null {
  const componentClass =
    component.constructor as ComponentConstructor<BaseComponent>;
  const options = getComponentOptions(componentClass);
  const delayedBy = options?.delayedBy;
  if (!delayedBy) {
    return null;
  }

  const delayedValue = (component as Record<string, DelayedComponentDateValue>)[
    delayedBy
  ];
  if (delayedValue instanceof Date) {
    return delayedValue;
  }
  if (typeof delayedValue === 'string' || typeof delayedValue === 'number') {
    const delayedAt = new Date(delayedValue);
    if (!Number.isNaN(delayedAt.getTime())) {
      return delayedAt;
    }
  }
  throw new Error(
    `Delayed component ${options?.name ?? componentClass.name} has invalid ${delayedBy} value.`,
  );
}

/**
 * Проверяет права доступа для выполнения операции над компонентом.
 * @param componentClass Класс компонента.
 * @param operation Тип операции ('add' или 'remove').
 * @param userRoles Массив ролей текущего пользователя.
 * @throws ForbiddenException если у пользователя нет необходимых прав.
 */
export function checkComponentPermissions<T extends BaseComponent>(
  componentClass: ComponentConstructor<T>,
  operation: EbcaEventType,
  userRoles: string[],
): void {
  const options = getComponentOptions(componentClass);
  const requiredRoles = options?.permissions?.[operation];

  if (requiredRoles && requiredRoles.length > 0) {
    const hasPermission = userRoles.some((role) =>
      requiredRoles.includes(role),
    );
    if (!hasPermission) {
      logger.warn(
        `User tried to ${operation} component ${componentClass.name} without required roles. Required: ${requiredRoles.join(', ')}, User has: ${userRoles.join(', ')}`,
      );
      throw new ForbiddenException(
        `Insufficient permissions to ${operation} component ${componentClass.name}. Required roles: ${requiredRoles.join(', ')}.`,
      );
    }
  }
}

export function getComponentConstructorByName(
  componentName: string,
): ComponentConstructor<BaseComponent> {
  const constructor = REGISTERED_COMPONENTS.find((componentClass) => {
    if (componentClass.name === componentName) {
      return true;
    }
    const options = getComponentOptions(componentClass);
    return options?.name === componentName;
  });
  if (!constructor) {
    logger.warn(
      `Component constructor for ${componentName} not registered in ComponentManager.`,
    );
    throw new Error(
      `Component constructor ${componentName} not registered in ComponentManager.`,
    );
  }
  return constructor;
}
