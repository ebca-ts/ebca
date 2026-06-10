import { BaseComponent } from '../bases/base.component';
import { BaseEntity } from '../bases/base.entity';
import { ComponentConstructor } from './componens';
import { EntityConstructor } from './entities';

export type EbcaQueryGate = 'ws' | 'rest' | 'gql' | 'grpc';
export type EbcaQueryParamType = 'string' | 'number' | 'boolean' | 'date';

export type EbcaQueryParamScalarValue = string | number | boolean | Date | null;

export interface EbcaQueryParamOptions {
  type?: EbcaQueryParamType;
  required?: boolean;
  default?: EbcaQueryParamScalarValue | readonly EbcaQueryParamScalarValue[];
  min?: number;
  max?: number;
  values?: readonly EbcaQueryParamScalarValue[];
  array?: boolean;
}

export interface EbcaReadRepositoryOptions {
  name?: string;
}

export interface EbcaReadRepositoryMetadataOptions {
  name: string;
}

export interface EbcaQueryOptions {
  name: string;
  gates?: readonly EbcaQueryGate[];
  entityClass: EntityConstructor<BaseEntity>;
  components?: readonly ComponentConstructor<BaseComponent>[];
}

export interface EbcaQueryMetadataOptions {
  name: string;
  gates: readonly EbcaQueryGate[];
  entityClass: EntityConstructor<BaseEntity>;
  components: readonly ComponentConstructor<BaseComponent>[];
}

export interface EbcaQueryParamMetadataOptions extends EbcaQueryParamOptions {
  type: EbcaQueryParamType;
  required: boolean;
  array: boolean;
}

export interface EbcaReadRepositoryClass<T extends object = object> {
  readonly name: string;
  readonly prototype: T;
}

export interface EbcaQueryParamsClass<T extends object = object> {
  new (): T;
  readonly name: string;
  readonly prototype: T;
}

export interface EbcaReadRepositoryMetadata {
  repositoryClass: EbcaReadRepositoryClass;
  options: EbcaReadRepositoryMetadataOptions;
  sourceFile: string | null;
}

export interface EbcaQueryParamMetadata {
  paramsClass: EbcaQueryParamsClass;
  propertyName: string;
  options: EbcaQueryParamMetadataOptions;
}

export interface EbcaQueryMetadata {
  repositoryClass: EbcaReadRepositoryClass;
  methodName: string;
  options: EbcaQueryMetadataOptions;
  paramsClass: EbcaQueryParamsClass | null;
  params: readonly EbcaQueryParamMetadata[];
  sourceFile: string | null;
}
