import { BadRequestException, Injectable, Logger, Type } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ModuleRef } from '@nestjs/core';
import { getEbcaQueries } from '@ebca/core/decorators/ebca-query.decorator';
import type {
  EbcaQueryMetadata,
  EbcaQueryParamMetadata,
  EbcaQueryParamScalarValue,
} from '@ebca/core/types/queries';
import type {
  EbcaRestJsonObject,
  EbcaRestJsonValue,
  EbcaRestQueryPayload,
  EbcaRestQueryResultPayload,
} from '../types/ebca-rest-gateway.contracts';
import type {
  EbcaRestAuthenticatedIdentity,
  EbcaRestQueryContext,
} from '../types/ebca-rest-gateway.options';
import { serializeEbcaRestJsonValue } from '../utils/ebca-rest-json';

type EbcaRestQueryParamValue =
  | EbcaQueryParamScalarValue
  | readonly EbcaQueryParamScalarValue[];

type EbcaRestQueryParamsRecord = Record<
  string,
  EbcaRestQueryParamValue | undefined
>;

type EbcaRestQueryHandler = (
  params: object,
  context: EbcaRestQueryContext,
) => Promise<EbcaRestJsonValue> | EbcaRestJsonValue;

type EbcaRestQueryRepository = Record<
  string,
  EbcaRestQueryHandler | undefined
>;

@Injectable()
export class EbcaRestQueryService {
  private readonly logger = new Logger(EbcaRestQueryService.name);

  constructor(private readonly moduleRef: ModuleRef) {}

  async executeQuery(
    identity: EbcaRestAuthenticatedIdentity,
    payload: EbcaRestQueryPayload,
    requestId: string = randomUUID(),
  ): Promise<EbcaRestQueryResultPayload> {
    const metadata = this.resolveQueryMetadata(payload.name);
    const params = this.createParams(metadata, payload.params ?? {});
    const repository = this.resolveRepository(metadata);
    const methodName = metadata.methodName;
    const handler = repository[methodName];
    if (!handler) {
      throw new BadRequestException(
        `EBCA REST query ${metadata.options.name} handler ${methodName} is not available.`,
      );
    }
    const result = await handler.call(repository, params, {
      identity,
      requestId,
      queryName: metadata.options.name,
    });
    if (result === undefined) {
      throw new BadRequestException(
        `EBCA REST query ${metadata.options.name} returned empty result.`,
      );
    }
    this.logger.debug(
      `Resolved EBCA REST query ${metadata.options.name} for identity ${identity.identityId}.`,
    );
    return {
      kind: 'query.result',
      name: metadata.options.name,
      result: serializeEbcaRestJsonValue(result),
    };
  }

  private resolveQueryMetadata(name: string): EbcaQueryMetadata {
    const metadata = getEbcaQueries().find(
      (query) => query.options.name === name,
    );
    if (!metadata) {
      throw new BadRequestException(`Unknown EBCA REST query ${name}.`);
    }
    if (!metadata.options.gates.includes('rest')) {
      throw new BadRequestException(`EBCA query ${name} is not open for rest.`);
    }
    return metadata;
  }

  private resolveRepository(
    metadata: EbcaQueryMetadata,
  ): EbcaRestQueryRepository {
    const repositoryClass =
      metadata.repositoryClass as Type<EbcaRestQueryRepository>;
    try {
      return this.moduleRef.get(repositoryClass, { strict: false });
    } catch {
      throw new BadRequestException(
        `EBCA REST query repository ${metadata.repositoryClass.name} is not registered in Nest module.`,
      );
    }
  }

  private createParams(
    metadata: EbcaQueryMetadata,
    rawParams: EbcaRestJsonObject,
  ): object {
    if (!metadata.paramsClass) {
      return {};
    }
    const params = new metadata.paramsClass() as EbcaRestQueryParamsRecord;
    for (const param of metadata.params) {
      params[param.propertyName] = this.normalizeParam(param, rawParams);
    }
    return params;
  }

  private normalizeParam(
    param: EbcaQueryParamMetadata,
    rawParams: EbcaRestJsonObject,
  ): EbcaRestQueryParamValue | undefined {
    const rawValue = rawParams[param.propertyName];
    if (rawValue === undefined || rawValue === null) {
      if (param.options.default !== undefined) {
        return param.options.default;
      }
      if (param.options.required) {
        throw new BadRequestException(
          `EBCA REST query param ${param.propertyName} is required.`,
        );
      }
      return undefined;
    }
    if (param.options.array) {
      if (Array.isArray(rawValue)) {
        return rawValue.map((item) => this.normalizeScalarParam(param, item));
      }
      return [this.normalizeScalarParam(param, rawValue)];
    }
    if (Array.isArray(rawValue)) {
      throw new BadRequestException(
        `EBCA REST query param ${param.propertyName} must be scalar.`,
      );
    }
    return this.normalizeScalarParam(param, rawValue);
  }

  private normalizeScalarParam(
    param: EbcaQueryParamMetadata,
    rawValue: EbcaRestJsonValue,
  ): EbcaQueryParamScalarValue {
    if (typeof rawValue === 'object' && rawValue !== null) {
      throw new BadRequestException(
        `EBCA REST query param ${param.propertyName} must be ${param.options.type}.`,
      );
    }
    const value = this.coerceScalarParam(param, rawValue);
    if (typeof value === 'number') {
      if (param.options.min !== undefined && value < param.options.min) {
        throw new BadRequestException(
          `EBCA REST query param ${param.propertyName} is below minimum.`,
        );
      }
      if (param.options.max !== undefined && value > param.options.max) {
        throw new BadRequestException(
          `EBCA REST query param ${param.propertyName} is above maximum.`,
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
        `EBCA REST query param ${param.propertyName} has unsupported value.`,
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
          `EBCA REST query param ${param.propertyName} must be string.`,
        );
      }
      return rawValue;
    }
    if (param.options.type === 'boolean') {
      if (rawValue === 'true') {
        return true;
      }
      if (rawValue === 'false') {
        return false;
      }
      if (typeof rawValue !== 'boolean') {
        throw new BadRequestException(
          `EBCA REST query param ${param.propertyName} must be boolean.`,
        );
      }
      return rawValue;
    }
    if (param.options.type === 'number') {
      if (typeof rawValue === 'string') {
        const parsed = Number(rawValue);
        if (Number.isFinite(parsed)) {
          return parsed;
        }
      }
      if (typeof rawValue !== 'number' || !Number.isFinite(rawValue)) {
        throw new BadRequestException(
          `EBCA REST query param ${param.propertyName} must be finite number.`,
        );
      }
      return rawValue;
    }
    if (typeof rawValue !== 'string' && typeof rawValue !== 'number') {
      throw new BadRequestException(
        `EBCA REST query param ${param.propertyName} must be date string or timestamp.`,
      );
    }
    const date = new Date(rawValue);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(
        `EBCA REST query param ${param.propertyName} contains invalid date.`,
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
}
