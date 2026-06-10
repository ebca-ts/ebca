import 'reflect-metadata';
import { Controller, Logger } from '@nestjs/common';
import { SystemConstructor, SystemOptions } from '../types/systems';
import { MetadataStorage } from './metadata.storage';
import { captureDecoratorSourceFile } from './decorator-source-file';

const logger = new Logger('SystemDecorator');

export const SYSTEM_METADATA_KEY = Symbol('system_metadata');

// Глобальный реестр для зарегистрированных систем
const REGISTERED_SYSTEMS: SystemConstructor<any>[] = [];
const SYSTEM_SOURCE_FILES = new Map<SystemConstructor<object>, string | null>();

/**
 * Декоратор для пометки класса как EBCA-системы.
 * Автоматически регистрирует систему для обнаружения SystemManager.
 * Класс должен быть также помечен @Injectable() или @Controller() для работы с NestJS DI.
 *
 * @param options Опции системы, опционально для переопределения имени.
 */
export function System(options?: SystemOptions) {
  return <T extends SystemConstructor<any>>(target: T) => {
    Controller()(target);
    Reflect.defineMetadata(SYSTEM_METADATA_KEY, options, target);
    REGISTERED_SYSTEMS.push(target);
    SYSTEM_SOURCE_FILES.set(target, captureDecoratorSourceFile());
    logger.debug(
      `Registered system: ${target.name} (Custom Name: ${options?.name || 'N/A'})`,
    );
  };
}

/**
 * Возвращает список всех автоматически зарегистрированных EBCA-систем.
 */
export function getRegisteredSystems(): SystemConstructor<any>[] {
  return REGISTERED_SYSTEMS;
}

export function getSystemSourceFile<T extends object>(
  target: SystemConstructor<T>,
): string | null {
  return SYSTEM_SOURCE_FILES.get(target) ?? null;
}

/**
 * Возвращает опции системы, определенные декоратором @System.
 * @param target Конструктор класса системы.
 */
export function getSystemOptions<T>(
  target: SystemConstructor<T>,
): SystemOptions | undefined {
  return MetadataStorage.getMetadata<SystemOptions>(
    SYSTEM_METADATA_KEY,
    target,
    { name: 'UnexpectedSystem' },
  );
}

/**
 * Возвращает фактическое имя системы, учитывая возможное переопределение через декоратор @System.
 * @param systemClass Конструктор класса системы.
 * @returns Строковое имя системы.
 */
export function getSystemName<T>(systemClass: SystemConstructor<T>): string {
  const options = getSystemOptions(systemClass);
  return options?.name || systemClass.name;
}
