import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  Type,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ModuleRef } from '@nestjs/core';
import { getEbcaQueries } from '@ebca/core/decorators/ebca-query.decorator';
import type {
  EbcaQueryMetadata,
  EbcaQueryParamMetadata,
  EbcaQueryParamScalarValue,
} from '@ebca/core/types/queries';
import { EBCA_GQL_GATEWAY_OPTIONS } from '../tokens';
import type {
  EbcaGqlJsonObject,
  EbcaGqlJsonValue,
  EbcaGqlQueryPayload,
  EbcaGqlQueryResultPayload,
  EbcaGqlSerializableValue,
} from '../types/ebca-gql-gateway.contracts';
import type {
  EbcaGqlAuthenticatedIdentity,
  EbcaGqlGatewayResolvedOptions,
  EbcaGqlIdentity,
  EbcaGqlQueryContext,
  EbcaGqlQueryExecutionContext,
} from '../types/ebca-gql-gateway.options';
import { serializeEbcaGqlJsonValue } from '../utils/ebca-gql-json';

type EbcaGqlQueryParamValue =
  | EbcaQueryParamScalarValue
  | readonly EbcaQueryParamScalarValue[];

type EbcaGqlQueryParamsRecord = Record<
  string,
  EbcaGqlQueryParamValue | undefined
>;

type EbcaGqlQueryHandler = (
  params: object,
  context: EbcaGqlQueryContext,
) => Promise<EbcaGqlSerializableValue> | EbcaGqlSerializableValue;

type EbcaGqlQueryRepository = Record<string, EbcaGqlQueryHandler | undefined>;

@Injectable()
export class EbcaGqlQueryService {
  private readonly logger = new Logger(EbcaGqlQueryService.name);

  constructor(
    private readonly moduleRef: ModuleRef,
    @Inject(EBCA_GQL_GATEWAY_OPTIONS)
    private readonly options: EbcaGqlGatewayResolvedOptions,
  ) {}

  async executeQuery(
    payload: EbcaGqlQueryPayload,
    context: EbcaGqlQueryExecutionContext,
  ): Promise<EbcaGqlQueryResultPayload> {
    const requestId = context.requestId ?? randomUUID();
    const identity = this.resolveIdentity(context.identity);
    const metadata = this.resolveQueryMetadata(payload.name);
    const params = this.createParams(metadata, payload.params ?? {});
    const repository = this.resolveRepository(metadata);
    const methodName = metadata.methodName;
    const handler = repository[methodName];
    if (!handler) {
      throw new BadRequestException(
        `EBCA GraphQL query ${metadata.options.name} handler ${methodName} is not available.`,
      );
    }
    const result = await handler(params, {
      identity,
      requestId,
      queryName: metadata.options.name,
    });
    if (result === undefined) {
      throw new BadRequestException(
        `EBCA GraphQL query ${metadata.options.name} returned empty result.`,
      );
    }
    this.logger.debug(
      `Resolved EBCA GraphQL query ${metadata.options.name} for identity ${identity.identityId}.`,
    );
    return {
      kind: 'query.result',
      name: metadata.options.name,
      result: serializeEbcaGqlJsonValue(result),
    };
  }

  async executeNamedQuery(
    name: string,
    params: EbcaGqlJsonObject,
    context: EbcaGqlQueryExecutionContext,
  ): Promise<EbcaGqlJsonValue> {
    const payload = await this.executeQuery({ name, params }, context);
    return payload.result;
  }

  private resolveIdentity(
    identity: EbcaGqlIdentity,
  ): EbcaGqlAuthenticatedIdentity {
    return {
      identityId: identity.identityId,
      roles: identity.roles ?? this.options.defaultRoles,
    };
  }

  private resolveQueryMetadata(name: string): EbcaQueryMetadata {
    const metadata = getEbcaQueries().find(
      (query) => query.options.name === name,
    );
    if (!metadata) {
      throw new BadRequestException(`Unknown EBCA GraphQL query ${name}.`);
    }
    if (!metadata.options.gates.includes('gql')) {
      throw new BadRequestException(`EBCA query ${name} is not open for gql.`);
    }
    return metadata;
  }

  private resolveRepository(
    metadata: EbcaQueryMetadata,
  ): EbcaGqlQueryRepository {
    const repositoryClass =
      metadata.repositoryClass as Type<EbcaGqlQueryRepository>;
    try {
      return this.moduleRef.get(repositoryClass, { strict: false });
    } catch {
      throw new BadRequestException(
        `EBCA GraphQL query repository ${metadata.repositoryClass.name} is not registered in Nest module.`,
      );
    }
  }

  private createParams(
    metadata: EbcaQueryMetadata,
    rawParams: EbcaGqlJsonObject,
  ): object {
    if (!metadata.paramsClass) {
      return {};
    }
    const params = new metadata.paramsClass() as EbcaGqlQueryParamsRecord;
    for (const param of metadata.params) {
      params[param.propertyName] = this.normalizeParam(param, rawParams);
    }
    return params;
  }

  private normalizeParam(
    param: EbcaQueryParamMetadata,
    rawParams: EbcaGqlJsonObject,
  ): EbcaGqlQueryParamValue | undefined {
    const rawValue = rawParams[param.propertyName];
    if (rawValue === undefined || rawValue === null) {
      if (param.options.default !== undefined) {
        return param.options.default;
      }
      if (param.options.required) {
        throw new BadRequestException(
          `EBCA GraphQL query param ${param.propertyName} is required.`,
        );
      }
      return undefined;
    }
    if (param.options.array) {
      if (!this.isJsonArray(rawValue)) {
        throw new BadRequestException(
          `EBCA GraphQL query param ${param.propertyName} must be an array.`,
        );
      }
      return rawValue.map((item) => this.normalizeScalarParam(param, item));
    }
    if (this.isJsonArray(rawValue)) {
      throw new BadRequestException(
        `EBCA GraphQL query param ${param.propertyName} must be scalar.`,
      );
    }
    return this.normalizeScalarParam(param, rawValue);
  }

  private normalizeScalarParam(
    param: EbcaQueryParamMetadata,
    rawValue: EbcaGqlJsonValue,
  ): EbcaQueryParamScalarValue {
    if (typeof rawValue === 'object' && rawValue !== null) {
      throw new BadRequestException(
        `EBCA GraphQL query param ${param.propertyName} must be ${param.options.type}.`,
      );
    }
    const value = this.coerceScalarParam(param, rawValue);
    if (typeof value === 'number') {
      if (param.options.min !== undefined && value < param.options.min) {
        throw new BadRequestException(
          `EBCA GraphQL query param ${param.propertyName} is below minimum.`,
        );
      }
      if (param.options.max !== undefined && value > param.options.max) {
        throw new BadRequestException(
          `EBCA GraphQL query param ${param.propertyName} is above maximum.`,
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
        `EBCA GraphQL query param ${param.propertyName} has unsupported value.`,
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
          `EBCA GraphQL query param ${param.propertyName} must be string.`,
        );
      }
      return rawValue;
    }
    if (param.options.type === 'boolean') {
      if (typeof rawValue !== 'boolean') {
        throw new BadRequestException(
          `EBCA GraphQL query param ${param.propertyName} must be boolean.`,
        );
      }
      return rawValue;
    }
    if (param.options.type === 'number') {
      if (typeof rawValue !== 'number' || !Number.isFinite(rawValue)) {
        throw new BadRequestException(
          `EBCA GraphQL query param ${param.propertyName} must be finite number.`,
        );
      }
      return rawValue;
    }
    if (typeof rawValue !== 'string' && typeof rawValue !== 'number') {
      throw new BadRequestException(
        `EBCA GraphQL query param ${param.propertyName} must be date string or timestamp.`,
      );
    }
    const date = new Date(rawValue);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(
        `EBCA GraphQL query param ${param.propertyName} contains invalid date.`,
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
    value: EbcaGqlJsonValue,
  ): value is readonly EbcaGqlJsonValue[] {
    return Array.isArray(value);
  }
}
