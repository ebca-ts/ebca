import { BaseComponent } from '../bases/base.component';
import { BaseEntity } from '../bases/base.entity';
import { ComponentConstructor } from '../types/componens';
import { EntityConstructor } from '../types/entities';
import { SystemConstructor } from '../types/systems';

export type EbcaIOAccessKind = 'reads' | 'writes' | 'emits' | 'removes';

export type EbcaIOTarget =
  | ComponentConstructor<BaseComponent>
  | readonly [
      EntityConstructor<BaseEntity>,
      ComponentConstructor<BaseComponent>,
    ];

export interface EbcaIOOptions {
  reads?: EbcaIOTarget[];
  writes?: EbcaIOTarget[];
  emits?: EbcaIOTarget[];
  removes?: EbcaIOTarget[];
}

export interface EbcaIOMetadata {
  systemClass: SystemConstructor<object>;
  methodName: string;
  options: Required<EbcaIOOptions>;
}

const EMPTY_EBCA_IO: Required<EbcaIOOptions> = {
  reads: [],
  writes: [],
  emits: [],
  removes: [],
};

const EBCA_IO_METADATA: EbcaIOMetadata[] = [];

export function EbcaIO(options: EbcaIOOptions): MethodDecorator {
  return (target: object, propertyKey: string | symbol) => {
    EBCA_IO_METADATA.push({
      systemClass: target.constructor as SystemConstructor<object>,
      methodName: String(propertyKey),
      options: normalizeEbcaIOOptions(options),
    });
  };
}

export function getEbcaIOMetadata(): EbcaIOMetadata[] {
  return EBCA_IO_METADATA;
}

export function getEbcaIOForHandler(
  systemClass: SystemConstructor<object>,
  methodName: string,
): Required<EbcaIOOptions> {
  return (
    EBCA_IO_METADATA.find(
      (metadata) =>
        metadata.systemClass === systemClass && metadata.methodName === methodName,
    )?.options ?? EMPTY_EBCA_IO
  );
}

function normalizeEbcaIOOptions(options: EbcaIOOptions): Required<EbcaIOOptions> {
  return {
    reads: options.reads ?? [],
    writes: options.writes ?? [],
    emits: options.emits ?? [],
    removes: options.removes ?? [],
  };
}
