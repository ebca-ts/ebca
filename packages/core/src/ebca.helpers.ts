import { BaseComponent } from './bases/base.component';
import { BaseEntity } from './bases/base.entity';
import { getEntityOptions } from './decorators/entity.decorator';
import {
  getComponentConstructorByName,
  getComponentOptions,
} from './decorators/component.decorator';
import {
  ComponentConstructor,
  ComponentConstructorArgument,
} from './types/componens';
import { EntityConstructor } from './types/entities';

type HydratableComponentConstructor<T extends BaseComponent> =
  ComponentConstructor<T> & {
    new (payload: ComponentConstructorArgument): T;
  };

export enum EbcaEventType {
  COMPONENT_ADDED = 'added',
  COMPONENT_REMOVED = 'removed',
  COMPONENT_UPDATED = 'updated',
}

// Обновлен интерфейс EbcaTopicParams для поддержки опциональных классов и wildcard entityId
interface EbcaTopicParams<
  E extends BaseEntity = BaseEntity,
  C extends BaseComponent = BaseComponent,
> {
  entityClass?: EntityConstructor<E>; // Сделано опциональным для wildcard
  eventType: EbcaEventType;
  componentClass?: ComponentConstructor<C>; // Сделано опциональным для wildcard
  entityId: E['id'] | '*'; // Теперь может быть конкретным ID или '*'
}

/**
 * Возвращает фактическое имя сущности, учитывая возможное переопределение через декоратор @Entity.
 * Если класс сущности не предоставлен, возвращает wildcard '*'.
 * @param entityClass Конструктор класса сущности (опционально).
 * @returns Строковое имя сущности или '*'.
 */
export function getEntityName<E extends BaseEntity>(
  entityClass?: EntityConstructor<E>,
): string {
  if (!entityClass) {
    return '*';
  }
  const options = getEntityOptions(entityClass);
  return options?.name || entityClass.name;
}

/**
 * Возвращает фактическое имя компонента, учитывая возможное переопределение через декоратор @Component.
 * Если класс компонента не предоставлен, возвращает wildcard '*'.
 * @param componentClass Конструктор класса компонента (опционально).
 * @returns Строковое имя компонента или '*'.
 */
export function getComponentName<C extends BaseComponent>(
  componentClass?: ComponentConstructor<C>,
): string {
  if (!componentClass) {
    return '*';
  }
  const options = getComponentOptions(componentClass);
  return options?.name || componentClass.name;
}

/**
 * Генерирует стандартизированный топик для NATS.
 * Позволяет подписываться на события как для конкретной сущности, так и для всех сущностей определенного типа.
 * @example
 * // Топик для события добавления компонента 'InChatComponent' для Player '123'
 * buildEbcaTopic({ entityClass: PlayerEntity, eventType: EbcaEventType.COMPONENT_ADDED, componentClass: InChatComponent, entityId: '123' })
 * // => 'ebca.PlayerEntity.123.added.InChatComponent'
 *
 * // Топик для подписки на добавление компонента 'InChatComponent' к ЛЮБОМУ Player (wildcard entityId)
 * buildEbcaTopic({ entityClass: PlayerEntity, eventType: EbcaEventType.COMPONENT_ADDED, componentClass: InChatComponent, entityId: '*' })
 * // => 'ebca.PlayerEntity.*.added.InChatComponent'
 *
 * // Топик для подписки на все события добавления компонентов для ЛЮБОЙ сущности и ЛЮБОГО компонента
 * buildEbcaTopic({ eventType: EbcaEventType.COMPONENT_ADDED, entityId: '*' })
 * // => 'ebca.*.*.added.*'
 */
export function buildEbcaTopic<E extends BaseEntity, C extends BaseComponent>({
  entityClass,
  eventType,
  componentClass,
  entityId,
}: EbcaTopicParams<E, C>): string {
  // Используем getEntityName и getComponentName для получения строкового имени класса
  return `ebca.${getEntityName(entityClass)}.${entityId}.${eventType}.${getComponentName(componentClass)}`;
}

/**
 * Генерирует стандартизированный ключ для хранения компонентов сущности в Redis.
 * Все компоненты одной сущности хранятся в одном Redis Hash.
 * @param entityClass - Класс сущности (e.g., typeof PlayerEntity).
 * @param entityId - UUID сущности.
 * @returns Строка ключа, например: 'ebca:PlayerEntity:a1b2-c3d4'
 */
export function buildEbcaRedisKey(
  entityClass: EntityConstructor<BaseEntity>,
  entityId: string,
): string {
  return `ebca:${getEntityName(entityClass)}:${entityId}`;
}

export function serializeComponent(component: BaseComponent): string {
  const payload = encodeURIComponent(JSON.stringify(component));
  const componentName = getComponentName(
    component.constructor as ComponentConstructor<BaseComponent>,
  );
  return `${componentName}:${payload}`;
}

export function deserializeComponent(data: string): BaseComponent {
  const separatorIndex = data.indexOf(':');
  if (separatorIndex < 0) {
    const Component = getComponentConstructorByName(data);
    return new Component();
  }

  const name = data.slice(0, separatorIndex);
  const payload = data.slice(separatorIndex + 1);
  const Component = getComponentConstructorByName(name);
  if (!payload) {
    return new Component();
  }
  const HydratableComponent =
    Component as HydratableComponentConstructor<BaseComponent>;

  try {
    return new HydratableComponent(
      JSON.parse(decodeURIComponent(payload)) as ComponentConstructorArgument,
    );
  } catch {
    try {
      return new HydratableComponent(
        JSON.parse(payload) as ComponentConstructorArgument,
      );
    } catch {
      return new Component();
    }
  }
}
