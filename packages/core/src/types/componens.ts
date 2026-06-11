import { EbcaEventType } from '../ebca.helpers';
import { BaseComponent } from '../bases/base.component';
import { PersistentPropertyMetadata } from '../decorators/persistent-property.decorator';
import { BaseEntity } from '../bases/base.entity';

/**
 * Тип для конструктора класса, который расширяет `BaseComponent`.
 */
export type ComponentConstructorArgument =
  | string
  | number
  | boolean
  | null
  | Date
  | ComponentConstructorArgument[]
  | { [key: string]: ComponentConstructorArgument };

export type ComponentConstructor<T extends BaseComponent> = {
  new (...args: never[]): T;
  name: string;
  getPersistentProperties(): PersistentPropertyMetadata<BaseEntity>[];
};

/**
 * Интерфейс для прав доступа к компоненту.
 * Определяет, какие роли могут добавлять или удалять этот компонент.
 */
export interface ComponentPermissions {
  [EbcaEventType.COMPONENT_ADDED]?: string[];
  [EbcaEventType.COMPONENT_REMOVED]?: string[];
  [EbcaEventType.COMPONENT_UPDATED]?: string[];
}

export type ComponentWebsocketAudience = 'owner' | 'city' | 'world';
export type ComponentInboundOperation = 'add' | 'update' | 'upsert' | 'remove';
export type ComponentInboundEntityIdMode = 'explicit' | 'playerId';

export interface ComponentWebsocketProjectionOptions {
  expose?: boolean;
  audience?: ComponentWebsocketAudience;
  ownerField?: string;
  ownerComponent?: string;
  cityField?: string;
  lifecycleKinds?: EbcaEventType[];
}

export interface ComponentInboundOptions {
  expose?: boolean;
  operations?: ComponentInboundOperation[];
  entityId?: ComponentInboundEntityIdMode;
  ownerField?: string;
  ownerComponent?: string;
  roles?: string[];
  fields?: string[];
}

export interface ComponentOptions {
  isPersistent?: boolean;
  permissions?: ComponentPermissions;
  inbound?: ComponentInboundOptions;
  websocket?: ComponentWebsocketProjectionOptions;
  delayedBy?: string;
  name?: string;
}
