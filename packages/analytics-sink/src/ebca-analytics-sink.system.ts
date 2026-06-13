import {
  Controller,
  Inject,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { Ctx, EventPattern, NatsContext, Payload } from '@nestjs/microservices';
import { InjectRepository } from '@nestjs/typeorm';
import { BaseComponent, EbcaEventType } from '@ebca/core';
import { Repository } from 'typeorm';
import {
  EBCA_ANALYTICS_SINK_DEFAULT_BATCH_SIZE,
  EBCA_ANALYTICS_SINK_DEFAULT_FLUSH_INTERVAL_MS,
  EBCA_ANALYTICS_SINK_OPTIONS,
} from './ebca-analytics-sink.constants';
import { EbcaAnalyticsEventEntity } from './ebca-analytics-event.entity';
import {
  EbcaAnalyticsEventPayload,
  EbcaAnalyticsLifecyclePayload,
  EbcaAnalyticsSinkModuleOptions,
  EbcaAnalyticsSinkResolvedOptions,
} from './ebca-analytics-sink.types';

const EBCA_EVENT_TYPES: readonly string[] = Object.values(EbcaEventType);

@Controller()
export class EbcaAnalyticsSinkSystem
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly logger = new Logger(EbcaAnalyticsSinkSystem.name);
  private readonly eventBuffer: Array<Partial<EbcaAnalyticsEventEntity>> = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private flushPromise: Promise<boolean> | null = null;
  private droppedByBufferLimit = 0;

  constructor(
    @InjectRepository(EbcaAnalyticsEventEntity)
    private readonly eventRepository: Repository<EbcaAnalyticsEventEntity>,
    @Inject(EBCA_ANALYTICS_SINK_OPTIONS)
    private readonly options: EbcaAnalyticsSinkResolvedOptions,
  ) {}

  onModuleInit(): void {
    this.flushTimer = setInterval(() => {
      this.flush().catch((error) => {
        this.logger.error('Scheduled EBCA analytics flush failed.', error);
      });
    }, this.options.flushIntervalMs);
    this.flushTimer.unref?.();
  }

  async onApplicationShutdown(signal?: string): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    this.logger.log(
      `Application shutting down with signal: ${signal ?? 'unknown'}. Flushing EBCA analytics events.`,
    );

    const flushed = await this.drainBufferedEvents();
    if (flushed) {
      this.logger.log('EBCA analytics events flushed.');
    }
  }

  @EventPattern('ebca.>')
  handleEbcaLifecycle(
    @Payload()
    payload: EbcaAnalyticsLifecyclePayload,
    @Ctx()
    context: NatsContext,
  ): void {
    const event = this.buildEvent(payload, context.getSubject());
    if (!event) {
      return;
    }

    if (!this.enqueueEvent(event)) {
      return;
    }

    if (
      this.eventBuffer.length >= this.options.batchSize ||
      (this.options.maxBufferSize !== null &&
        this.eventBuffer.length >= this.options.maxBufferSize)
    ) {
      this.flush().catch((error) => {
        this.logger.error('Threshold EBCA analytics flush failed.', error);
      });
    }
  }

  private buildEvent(
    payload: EbcaAnalyticsLifecyclePayload,
    topic: string,
  ): Partial<EbcaAnalyticsEventEntity> | null {
    const parts = topic.split('.');
    if (parts.length < 5 || parts[0] !== 'ebca') {
      this.logger.warn(`Ignored malformed EBCA analytics topic: ${topic}`);
      return null;
    }

    const [, entityName, entityId, eventType, ...componentNameParts] = parts;
    if (!this.isEbcaEventType(eventType)) {
      this.logger.warn(`Ignored EBCA analytics topic with bad event type: ${topic}`);
      return null;
    }

    return {
      event_timestamp: new Date(),
      event_type: eventType,
      entity_name: entityName,
      entity_id: entityId,
      component_name: componentNameParts.join('.'),
      component_payload: this.serializeComponent(
        payload.component ?? payload.previousComponent,
      ),
    };
  }

  private enqueueEvent(event: Partial<EbcaAnalyticsEventEntity>): boolean {
    if (
      this.options.maxBufferSize !== null &&
      this.eventBuffer.length >= this.options.maxBufferSize
    ) {
      this.droppedByBufferLimit += 1;
      if (
        this.droppedByBufferLimit === 1 ||
        this.droppedByBufferLimit % this.options.maxBufferSize === 0
      ) {
        this.logger.error(
          `Dropped EBCA analytics event because buffer reached maxBufferSize=${this.options.maxBufferSize}. dropped=${this.droppedByBufferLimit}`,
        );
      }
      return false;
    }

    this.eventBuffer.push(event);
    return true;
  }

  private isEbcaEventType(value: string): value is EbcaEventType {
    return EBCA_EVENT_TYPES.includes(value);
  }

  private serializeComponent(
    component: BaseComponent | undefined,
  ): EbcaAnalyticsEventPayload {
    if (!component) {
      return {};
    }

    return JSON.parse(JSON.stringify(component)) as EbcaAnalyticsEventPayload;
  }

  private async flush(): Promise<boolean> {
    if (this.flushPromise) {
      return this.flushPromise;
    }

    this.flushPromise = this.flushBufferedEvents();
    try {
      return await this.flushPromise;
    } finally {
      this.flushPromise = null;
    }
  }

  private async drainBufferedEvents(): Promise<boolean> {
    let flushed = true;
    do {
      flushed = await this.flush();
      if (!flushed) {
        return false;
      }
    } while (this.eventBuffer.length > 0);

    return true;
  }

  private async flushBufferedEvents(): Promise<boolean> {
    if (this.eventBuffer.length === 0) {
      return true;
    }

    const eventsToInsert = this.eventBuffer.splice(0, this.eventBuffer.length);

    try {
      if (this.options.verboseFlushLog) {
        this.logger.verbose(
          `Flushing ${eventsToInsert.length} EBCA analytics events.`,
        );
      }
      await this.eventRepository.save(eventsToInsert);
      return true;
    } catch (error) {
      this.eventBuffer.unshift(...eventsToInsert);
      this.logger.error('Failed to flush EBCA analytics events.', error);
      return false;
    }
  }
}

export function resolveEbcaAnalyticsSinkOptions(
  options: EbcaAnalyticsSinkModuleOptions,
): EbcaAnalyticsSinkResolvedOptions {
  return {
    batchSize:
      options.batchSize && options.batchSize > 0
        ? Math.floor(options.batchSize)
        : EBCA_ANALYTICS_SINK_DEFAULT_BATCH_SIZE,
    flushIntervalMs:
      options.flushIntervalMs && options.flushIntervalMs > 0
        ? Math.floor(options.flushIntervalMs)
        : EBCA_ANALYTICS_SINK_DEFAULT_FLUSH_INTERVAL_MS,
    maxBufferSize:
      options.maxBufferSize && options.maxBufferSize >= 1
        ? Math.floor(options.maxBufferSize)
        : null,
    verboseFlushLog: options.verboseFlushLog ?? false,
  };
}
