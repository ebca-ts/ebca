import 'reflect-metadata';

/**
 * Типизированный интерфейс для работы с метаданными.
 * Инкапсулирует вызовы Reflect и обеспечивает безопасность типов.
 */
export class MetadataStorage {
  private constructor() {}

  /**
   * Устанавливает метаданные для конструктора класса.
   * @param metadataKey Уникальный ключ метаданных.
   * @param metadataValue Значение метаданных.
   * @param target Конструктор класса, к которому привязываются метаданные.
   */
  public static defineMetadata<T>(
    metadataKey: unknown,
    metadataValue: T,
    target: object,
  ): void {
    Reflect.defineMetadata(metadataKey, metadataValue, target);
  }

  /**
   * Получает метаданные для конструктора класса.
   * Если метаданные отсутствуют, возвращает значение по умолчанию.
   * @param metadataKey Уникальный ключ метаданных.
   * @param target Конструктор класса.
   * @param defaultValue Значение по умолчанию, если метаданные не найдены.
   * @returns Значение метаданных или значение по умолчанию.
   */
  public static getMetadata<T>(
    metadataKey: unknown,
    target: object,
    defaultValue: T,
  ): T {
    const metadata: unknown = Reflect.getMetadata(metadataKey, target);
    if (metadata === undefined || metadata === null) {
      return defaultValue;
    }
    return metadata as T;
  }

  /**
   * Получает метаданные для конструктора класса.
   * Если метаданные отсутствуют, возвращает undefined.
   * @param metadataKey Уникальный ключ метаданных.
   * @param target Конструктор класса.
   * @returns Значение метаданных или undefined.
   */
  public static getMetadataOrNull<T>(
    metadataKey: unknown,
    target: object,
  ): T | undefined {
    const metadata: unknown = Reflect.getMetadata(metadataKey, target);
    if (metadata === undefined || metadata === null) {
      return undefined;
    }
    return metadata as T;
  }
}
