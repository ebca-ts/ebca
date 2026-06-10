import { BadRequestException, Injectable, Logger, Type } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { getEbcaQueries } from '@ebca/core/decorators/ebca-query.decorator';
import type {
  EbcaQueryMetadata,
  EbcaQueryParamMetadata,
  EbcaQueryParamScalarValue,
} from '@ebca/core/types/queries';
import type {
  EbcaWsJsonObject,
  EbcaWsJsonValue,
  EbcaWsQueryPayload,
  EbcaWsQueryResultPayload,
} from '../types/ebca-ws-gateway.contracts';
import type {
  EbcaWsAuthenticatedIdentity,
  EbcaWsQueryContext,
} from '../types/ebca-ws-gateway.options';
import { serializeEbcaWsJsonValue } from '../utils/ebca-ws-json';

type EbcaWsQueryParamValue =
  | EbcaQueryParamScalarValue
  | readonly EbcaQueryParamScalarValue[];

type EbcaWsQueryParamsRecord = Record<
  string,
  EbcaWsQueryParamValue | undefined
>;

type EbcaWsQueryResult = EbcaWsJsonValue;

type EbcaWsQueryHandler = (
  params: object,
  context: EbcaWsQueryContext,
) => Promise<EbcaWsQueryResult> | EbcaWsQueryResult;

type EbcaWsQueryRepository = Record<string, EbcaWsQueryHandler | undefined>;

@Injectable()
export class EbcaWsQueryService {
  private readonly logger = new Logger(EbcaWsQueryService.name);

  constructor(private readonly moduleRef: ModuleRef) {}

  async executeQuery(
    identity: EbcaWsAuthenticatedIdentity,
    requestId: string,
    payload: EbcaWsQueryPayload,
  ): Promise<EbcaWsQueryResultPayload> {
    const metadata = this.resolveQueryMetadata(payload.name);
    const params = this.createParams(metadata, payload.params ?? {});
    const repository = this.resolveRepository(metadata);
    const methodName = metadata.methodName;
    if (!repository[methodName]) {
      throw new BadRequestException(
        `EBCA query ${metadata.options.name} handler ${methodName} is not available.`,
      );
    }
    const result = await repository[methodName]?.(params, {
      identity,
      requestId,
      queryName: metadata.options.name,
    });
    if (result === undefined) {
      throw new BadRequestException(
        `EBCA query ${metadata.options.name} returned empty result.`,
      );
    }
    this.logger.debug(
      `Resolved EBCA websocket query ${metadata.options.name} for identity ${identity.identityId}.`,
    );
    return {
      kind: 'query.result',
      name: metadata.options.name,
      result: serializeEbcaWsJsonValue(result),
    };
  }

  private resolveQueryMetadata(name: string): EbcaQueryMetadata {
    const metadata = getEbcaQueries().find(
      (query) => query.options.name === name,
    );
    if (!metadata) {
      throw new BadRequestException(`Unknown EBCA query ${name}.`);
    }
    if (!metadata.options.gates.includes('ws')) {
      throw new BadRequestException(`EBCA query ${name} is not open for ws.`);
    }
    return metadata;
  }

  private resolveRepository(
    metadata: EbcaQueryMetadata,
  ): EbcaWsQueryRepository {
    const repositoryClass =
      metadata.repositoryClass as Type<EbcaWsQueryRepository>;
    try {
      return this.moduleRef.get(repositoryClass, { strict: false });
    } catch {
      throw new BadRequestException(
        `EBCA query repository ${metadata.repositoryClass.name} is not registered in Nest module.`,
      );
    }
  }

  private createParams(
    metadata: EbcaQueryMetadata,
    rawParams: EbcaWsJsonObject,
  ): object {
    if (!metadata.paramsClass) {
      return {};
    }
    const params = new metadata.paramsClass() as EbcaWsQueryParamsRecord;
    for (const param of metadata.params) {
      params[param.propertyName] = this.normalizeParam(param, rawParams);
    }
    return params;
  }

  private normalizeParam(
    param: EbcaQueryParamMetadata,
    rawParams: EbcaWsJsonObject,
  ): EbcaWsQueryParamValue | undefined {
    const rawValue = rawParams[param.propertyName];
    if (rawValue === undefined || rawValue === null) {
      if (param.options.default !== undefined) {
        return param.options.default;
      }
      if (param.options.required) {
        throw new BadRequestException(
          `EBCA query param ${param.propertyName} is required.`,
        );
      }
      return undefined;
    }
    if (param.options.array) {
      if (!this.isJsonArray(rawValue)) {
        throw new BadRequestException(
          `EBCA query param ${param.propertyName} must be an array.`,
        );
      }
      return rawValue.map((item) => this.normalizeScalarParam(param, item));
    }
    if (this.isJsonArray(rawValue)) {
      throw new BadRequestException(
        `EBCA query param ${param.propertyName} must be scalar.`,
      );
    }
    return this.normalizeScalarParam(param, rawValue);
  }

  private normalizeScalarParam(
    param: EbcaQueryParamMetadata,
    rawValue: EbcaWsJsonValue,
  ): EbcaQueryParamScalarValue {
    if (typeof rawValue === 'object' && rawValue !== null) {
      throw new BadRequestException(
        `EBCA query param ${param.propertyName} must be ${param.options.type}.`,
      );
    }
    const value = this.coerceScalarParam(param, rawValue);
    if (typeof value === 'number') {
      if (param.options.min !== undefined && value < param.options.min) {
        throw new BadRequestException(
          `EBCA query param ${param.propertyName} is below minimum.`,
        );
      }
      if (param.options.max !== undefined && value > param.options.max) {
        throw new BadRequestException(
          `EBCA query param ${param.propertyName} is above maximum.`,
        );
      }
    }
    if (
      param.options.values &&
      !param.options.values.some(
        (allowedValue) =>
          this.queryParamValueKey(allowedValue) ===
          this.queryParamValueKey(value),
      )
    ) {
      throw new BadRequestException(
        `EBCA query param ${param.propertyName} has unsupported value.`,
      );
    }
    return value;
  }

  private coerceScalarParam(
    param: EbcaQueryParamMetadata,
    rawValue: string | number | boolean | null,
  ): EbcaQueryParamScalarValue {
    if (rawValue === null) {
      return null;
    }
    if (param.options.type === 'string') {
      if (typeof rawValue !== 'string') {
        throw new BadRequestException(
          `EBCA query param ${param.propertyName} must be string.`,
        );
      }
      return rawValue;
    }
    if (param.options.type === 'boolean') {
      if (typeof rawValue !== 'boolean') {
        throw new BadRequestException(
          `EBCA query param ${param.propertyName} must be boolean.`,
        );
      }
      return rawValue;
    }
    if (param.options.type === 'number') {
      if (typeof rawValue !== 'number' || !Number.isFinite(rawValue)) {
        throw new BadRequestException(
          `EBCA query param ${param.propertyName} must be finite number.`,
        );
      }
      return rawValue;
    }
    if (typeof rawValue !== 'string' && typeof rawValue !== 'number') {
      throw new BadRequestException(
        `EBCA query param ${param.propertyName} must be date string or timestamp.`,
      );
    }
    const date = new Date(rawValue);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(
        `EBCA query param ${param.propertyName} contains invalid date.`,
      );
    }
    return date;
  }

  private queryParamValueKey(value: EbcaQueryParamScalarValue): string {
    if (value instanceof Date) {
      return value.toISOString();
    }
    return String(value);
  }

  private isJsonArray(
    value: EbcaWsJsonValue,
  ): value is readonly EbcaWsJsonValue[] {
    return Array.isArray(value);
  }
}
