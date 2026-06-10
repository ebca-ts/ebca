import { EbcaEventType } from '../ebca.helpers';

/**
 * Интерфейс для данных события EBCA, передаваемого через NATS.
 */
export interface EbcaEvent {
  entityId: string;
  componentName: string;
  eventType: EbcaEventType;
  payload?: Record<string, unknown> | string | null; // Расширяемый payload, может быть строкой (JSON), если это полный компонент
  timestamp: string; // ISO-формат времени события
  userId?: string; // ID пользователя, инициировавшего событие (из контекста)
}

/**
 * Тип для конструктора класса, который является EBCA-системой.
 * Он может быть любым классом, помеченным @Injectable() или @Controller().
 */
export type SystemConstructor<T = any> = {
  new (...args: any[]): T;
  name: string;
};

/**
 * Интерфейс для опций декоратора @System.
 */
export interface SystemOptions {
  name?: string; // Позволяет переопределить имя системы.
}
