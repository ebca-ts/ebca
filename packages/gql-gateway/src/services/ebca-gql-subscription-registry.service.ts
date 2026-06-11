import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { EBCA_GQL_GATEWAY_OPTIONS } from '../tokens';
import type {
  EbcaGqlComponentSubscriptionPayload,
  EbcaGqlEbcaComponentPayload,
} from '../types/ebca-gql-gateway.contracts';
import type {
  EbcaGqlAuthenticatedIdentity,
  EbcaGqlGatewayResolvedOptions,
} from '../types/ebca-gql-gateway.options';
import type { EbcaGqlResolvedProjection } from './ebca-gql-projection.service';

type EbcaGqlSubscriptionResolver = (
  result: IteratorResult<EbcaGqlEbcaComponentPayload>,
) => void;

interface EbcaGqlSubscriptionRecord {
  readonly id: string;
  readonly identity: EbcaGqlAuthenticatedIdentity;
  readonly filter: EbcaGqlComponentSubscriptionPayload;
  readonly queue: EbcaGqlEbcaComponentPayload[];
  pending: EbcaGqlSubscriptionResolver | null;
  closed: boolean;
}

@Injectable()
export class EbcaGqlSubscriptionRegistryService {
  private readonly logger = new Logger(EbcaGqlSubscriptionRegistryService.name);
  private readonly subscriptions = new Map<string, EbcaGqlSubscriptionRecord>();

  constructor(
    @Inject(EBCA_GQL_GATEWAY_OPTIONS)
    private readonly options: EbcaGqlGatewayResolvedOptions,
  ) {}

  subscribe(
    identity: EbcaGqlAuthenticatedIdentity,
    filter: EbcaGqlComponentSubscriptionPayload,
  ): AsyncIterableIterator<EbcaGqlEbcaComponentPayload> {
    const record: EbcaGqlSubscriptionRecord = {
      id: randomUUID(),
      identity,
      filter,
      queue: [],
      pending: null,
      closed: false,
    };
    this.subscriptions.set(record.id, record);
    this.logger.debug(
      `Opened EBCA GraphQL component subscription ${record.id} for identity ${identity.identityId}.`,
    );
    const iterator: AsyncIterableIterator<EbcaGqlEbcaComponentPayload> = {
      next: () => this.next(record),
      return: () => this.close(record),
      throw: (error?: Error) => this.throw(record, error),
      [Symbol.asyncIterator]: () => iterator,
    };
    return iterator;
  }

  publish(projection: EbcaGqlResolvedProjection): void {
    for (const record of this.subscriptions.values()) {
      if (!this.canReceive(record, projection)) {
        continue;
      }
      this.push(record, projection.payload);
    }
  }

  private next(
    record: EbcaGqlSubscriptionRecord,
  ): Promise<IteratorResult<EbcaGqlEbcaComponentPayload>> {
    if (record.closed) {
      return Promise.resolve({
        done: true,
        value: undefined as never,
      });
    }
    const queued = record.queue.shift();
    if (queued) {
      return Promise.resolve({
        done: false,
        value: queued,
      });
    }
    return new Promise((resolve) => {
      record.pending = resolve;
    });
  }

  private close(
    record: EbcaGqlSubscriptionRecord,
  ): Promise<IteratorResult<EbcaGqlEbcaComponentPayload>> {
    record.closed = true;
    this.subscriptions.delete(record.id);
    const pending = record.pending;
    record.pending = null;
    const result: IteratorResult<EbcaGqlEbcaComponentPayload> = {
      done: true,
      value: undefined as never,
    };
    if (pending) {
      pending(result);
    }
    this.logger.debug(
      `Closed EBCA GraphQL component subscription ${record.id} for identity ${record.identity.identityId}.`,
    );
    return Promise.resolve(result);
  }

  private throw(
    record: EbcaGqlSubscriptionRecord,
    error?: Error,
  ): Promise<IteratorResult<EbcaGqlEbcaComponentPayload>> {
    void this.close(record);
    return Promise.reject(
      error ?? new Error('EBCA GraphQL component subscription closed.'),
    );
  }

  private push(
    record: EbcaGqlSubscriptionRecord,
    payload: EbcaGqlEbcaComponentPayload,
  ): void {
    const pending = record.pending;
    if (pending) {
      record.pending = null;
      pending({
        done: false,
        value: payload,
      });
      return;
    }
    if (
      record.queue.length >= this.options.limits.maxSubscriptionQueueSize
    ) {
      record.queue.shift();
      this.logger.warn(
        `Dropped stale EBCA GraphQL subscription event for identity ${record.identity.identityId}: queue limit reached.`,
      );
    }
    record.queue.push(payload);
  }

  private canReceive(
    record: EbcaGqlSubscriptionRecord,
    projection: EbcaGqlResolvedProjection,
  ): boolean {
    if (projection.broadcast) {
      return this.matchesFilter(record.filter, projection.payload);
    }
    if (!projection.recipientIds.includes(record.identity.identityId)) {
      return false;
    }
    return this.matchesFilter(record.filter, projection.payload);
  }

  private matchesFilter(
    filter: EbcaGqlComponentSubscriptionPayload,
    payload: EbcaGqlEbcaComponentPayload,
  ): boolean {
    if (filter.entityName && filter.entityName !== payload.entityName) {
      return false;
    }
    if (filter.entityId && filter.entityId !== payload.entityId) {
      return false;
    }
    if (
      filter.componentNames &&
      filter.componentNames.length > 0 &&
      !filter.componentNames.includes(payload.componentName)
    ) {
      return false;
    }
    return true;
  }
}
