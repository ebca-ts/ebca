import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import {
  AckPolicy,
  connect,
  DeliverPolicy,
  DiscardPolicy,
  headers,
  JSONCodec,
  ReplayPolicy,
  RetentionPolicy,
  StorageType,
} from 'nats';
import type {
  Codec,
  Consumer,
  ConsumerConfig,
  JetStreamClient,
  JetStreamManager,
  MsgHdrs,
  NatsConnection,
  StreamConfig,
} from 'nats';
import { BaseCommandComponent } from './bases/base-command.component';
import { BaseComponent } from './bases/base.component';
import { EbcaEventType, getComponentName, getEntityName } from './ebca.helpers';
import { getEbcaOrderedIngressRules } from './ordered-ingress.registry';
import type {
  EbcaOrderedIngressEnvelope,
  EbcaOrderedIngressPacket,
  EbcaOrderedIngressPublishContext,
  EbcaOrderedIngressRule,
} from './ordered-ingress.registry';
import { ComponentConstructor } from './types/componens';
import { EntityConstructor } from './types/entities';
import { BaseEntity } from './bases/base.entity';

const DEFAULT_ORDERED_INGRESS_SUBJECT_PREFIX = 'ebca.ingress';
const DEFAULT_ORDERED_INGRESS_PARTITIONS = 16;
const DEFAULT_ORDERED_INGRESS_ACK_WAIT_MS = 60_000;
const DEFAULT_ORDERED_INGRESS_MAX_DELIVER = 5;
const DEFAULT_ORDERED_INGRESS_PUBLISH_TIMEOUT_MS = 5_000;
const DEFAULT_NATS_SERVERS = ['nats://nats:4222'];

interface ResolvedOrderedIngressRule {
  rule: EbcaOrderedIngressRule;
  streamName: string;
  subjectPrefix: string;
  partitions: number;
  ackWaitMs: number;
  maxDeliver: number;
  publishTimeoutMs: number;
}

@Injectable()
export class EbcaOrderedIngressService
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly logger = new Logger(EbcaOrderedIngressService.name);
  private readonly envelopeCodec: Codec<EbcaOrderedIngressEnvelope> =
    JSONCodec<EbcaOrderedIngressEnvelope>();
  private readonly packetCodec: Codec<EbcaOrderedIngressPacket> =
    JSONCodec<EbcaOrderedIngressPacket>();
  private readonly ruleByPublishKey = new Map<
    string,
    ResolvedOrderedIngressRule
  >();
  private readonly consumerLoops: Promise<void>[] = [];
  private natsConnection: NatsConnection | null = null;
  private jetStream: JetStreamClient | null = null;
  private jetStreamManager: JetStreamManager | null = null;
  private shuttingDown = false;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const rules = getEbcaOrderedIngressRules();
    if (rules.length === 0) {
      return;
    }
    this.registerRules(rules);
    await this.ensureConnection();
    await this.ensureStreamsAndConsumers();
    this.startConsumerLoops();
  }

  async onApplicationShutdown(): Promise<void> {
    this.shuttingDown = true;
    await Promise.allSettled(this.consumerLoops);
    if (this.natsConnection) {
      await this.natsConnection.drain();
      this.natsConnection = null;
      this.jetStream = null;
      this.jetStreamManager = null;
    }
  }

  async publishIfConfigured<C extends BaseComponent>(
    context: EbcaOrderedIngressPublishContext<C>,
  ): Promise<boolean> {
    const rule = this.ruleByPublishKey.get(
      this.createPublishKey(
        context.entityClass,
        context.eventType,
        context.componentClass,
      ),
    );
    if (!rule) {
      return false;
    }
    if (!(context.component instanceof BaseCommandComponent)) {
      throw new Error(
        `Ordered ingress ${rule.rule.ingress.name} can publish only command components.`,
      );
    }

    const entityName = getEntityName(context.entityClass);
    const componentName = getComponentName(context.componentClass);
    const partitionKey = rule.rule.ingress
      .key({
        entityId: context.entityId,
        entityName,
        eventType: context.eventType,
        componentName,
        component: context.component,
        originalTopic: context.originalTopic,
      })
      .trim();
    if (!partitionKey) {
      throw new Error(
        `Ordered ingress ${rule.rule.ingress.name} produced an empty partition key for ${entityName}:${context.entityId}.${componentName}.`,
      );
    }

    const partition = this.resolvePartition(partitionKey, rule.partitions);
    const commandId =
      context.component.commandId ??
      `${rule.rule.ingress.name}:${partition}:${randomUUID()}`;
    context.component.commandId = commandId;
    const subject = this.createIngressSubject(rule, partition);
    const envelope: EbcaOrderedIngressEnvelope<C> = {
      schemaVersion: 1,
      commandId,
      originalTopic: context.originalTopic,
      ingressName: rule.rule.ingress.name,
      partitionKey,
      partition,
      entityName,
      entityId: context.entityId,
      eventType: context.eventType,
      componentName,
      publishedAt: new Date().toISOString(),
      packet: {
        pattern: context.originalTopic,
        data: context.payload,
      },
    };

    await this.ensureConnection();
    await this.requireJetStream().publish(
      subject,
      this.envelopeCodec.encode(envelope),
      {
        msgID: commandId,
        timeout: rule.publishTimeoutMs,
        headers: this.createIngressHeaders(envelope),
      },
    );
    this.logger.debug(
      `Queued ordered EBCA ingress: ingress=${rule.rule.ingress.name}, partition=${partition}, key=${partitionKey}, commandId=${commandId}, topic=${context.originalTopic}.`,
    );
    return true;
  }

  private registerRules(rules: EbcaOrderedIngressRule[]): void {
    const ingressNames = new Set<string>();
    for (const rule of rules) {
      if (!(new rule.componentClass() instanceof BaseCommandComponent)) {
        throw new Error(
          `Ordered ingress ${rule.ingress.name} can be attached only to command components.`,
        );
      }
      const resolved = this.resolveRule(rule);
      const key = this.createPublishKey(
        rule.entityClass,
        rule.eventType,
        rule.componentClass,
      );
      const existing = this.ruleByPublishKey.get(key);
      if (existing) {
        throw new Error(
          `Duplicate ordered ingress rules for ${key}: ${existing.rule.ingress.name} and ${rule.ingress.name}.`,
        );
      }
      this.ruleByPublishKey.set(key, resolved);
      ingressNames.add(rule.ingress.name);
    }
    this.logger.log(
      `Registered ordered EBCA ingress rules: ${rules.length}, ingress=${[...ingressNames].join(',')}.`,
    );
  }

  private resolveRule(
    rule: EbcaOrderedIngressRule,
  ): ResolvedOrderedIngressRule {
    const partitions = this.normalizePositiveInteger(
      rule.ingress.partitions,
      DEFAULT_ORDERED_INGRESS_PARTITIONS,
    );
    return {
      rule,
      streamName:
        rule.ingress.streamName ??
        `EBCA_INGRESS_${this.normalizeNatsName(rule.ingress.name)}`,
      subjectPrefix:
        rule.ingress.subjectPrefix ?? DEFAULT_ORDERED_INGRESS_SUBJECT_PREFIX,
      partitions,
      ackWaitMs: this.normalizePositiveInteger(
        rule.ingress.ackWaitMs,
        DEFAULT_ORDERED_INGRESS_ACK_WAIT_MS,
      ),
      maxDeliver: this.normalizePositiveInteger(
        rule.ingress.maxDeliver,
        DEFAULT_ORDERED_INGRESS_MAX_DELIVER,
      ),
      publishTimeoutMs: this.normalizePositiveInteger(
        rule.ingress.publishTimeoutMs,
        DEFAULT_ORDERED_INGRESS_PUBLISH_TIMEOUT_MS,
      ),
    };
  }

  private async ensureConnection(): Promise<void> {
    if (this.natsConnection && this.jetStream && this.jetStreamManager) {
      return;
    }
    this.natsConnection = await connect({ servers: this.resolveNatsServers() });
    this.jetStream = this.natsConnection.jetstream();
    this.jetStreamManager = await this.natsConnection.jetstreamManager();
  }

  private async ensureStreamsAndConsumers(): Promise<void> {
    const rulesByStream = new Map<string, ResolvedOrderedIngressRule>();
    for (const rule of this.ruleByPublishKey.values()) {
      rulesByStream.set(rule.streamName, rule);
    }
    for (const rule of rulesByStream.values()) {
      await this.ensureStream(rule);
      for (let partition = 0; partition < rule.partitions; partition += 1) {
        await this.ensureConsumer(rule, partition);
      }
    }
  }

  private async ensureStream(rule: ResolvedOrderedIngressRule): Promise<void> {
    const config: Partial<StreamConfig> = {
      name: rule.streamName,
      subjects: [`${rule.subjectPrefix}.${rule.rule.ingress.name}.*`],
      retention: RetentionPolicy.Limits,
      storage: StorageType.File,
      discard: DiscardPolicy.Old,
      max_msgs: -1,
      max_bytes: -1,
      max_age: 0,
      num_replicas: 3,
      duplicate_window: 120_000_000_000,
    };
    const manager = this.requireJetStreamManager();
    try {
      await manager.streams.info(rule.streamName);
      await manager.streams.update(rule.streamName, config);
      return;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Non-error value thrown';
      if (this.isNotFoundMessage(errorMessage)) {
        await manager.streams.add(config);
        this.logger.log(
          `Created ordered EBCA ingress stream ${rule.streamName} for ${config.subjects?.join(',')}.`,
        );
        return;
      }
      throw error;
    }
  }

  private async ensureConsumer(
    rule: ResolvedOrderedIngressRule,
    partition: number,
  ): Promise<void> {
    const durableName = this.createConsumerName(rule, partition);
    const config: Partial<ConsumerConfig> = {
      durable_name: durableName,
      name: durableName,
      ack_policy: AckPolicy.Explicit,
      deliver_policy: DeliverPolicy.All,
      replay_policy: ReplayPolicy.Instant,
      filter_subject: this.createIngressSubject(rule, partition),
      max_ack_pending: 1,
      max_deliver: rule.maxDeliver,
      ack_wait: rule.ackWaitMs * 1_000_000,
      max_waiting: 1,
    };
    const manager = this.requireJetStreamManager();
    try {
      await manager.consumers.info(rule.streamName, durableName);
      await manager.consumers.update(rule.streamName, durableName, config);
      return;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Non-error value thrown';
      if (this.isNotFoundMessage(errorMessage)) {
        await manager.consumers.add(rule.streamName, config);
        return;
      }
      throw error;
    }
  }

  private startConsumerLoops(): void {
    const rulesByStream = new Map<string, ResolvedOrderedIngressRule>();
    for (const rule of this.ruleByPublishKey.values()) {
      rulesByStream.set(rule.streamName, rule);
    }
    for (const rule of rulesByStream.values()) {
      for (let partition = 0; partition < rule.partitions; partition += 1) {
        this.consumerLoops.push(this.consumePartition(rule, partition));
      }
    }
  }

  private async consumePartition(
    rule: ResolvedOrderedIngressRule,
    partition: number,
  ): Promise<void> {
    const consumer = await this.resolveConsumer(rule, partition);
    while (!this.shuttingDown) {
      try {
        const message = await consumer.next({ expires: 1000 });
        if (!message) {
          continue;
        }
        const envelope = this.envelopeCodec.decode(message.data);
        await this.replayEnvelope(rule, envelope);
        message.ack();
      } catch (error) {
        if (this.shuttingDown) {
          return;
        }
        const message =
          error instanceof Error
            ? (error.stack ?? error.message)
            : 'Non-error value thrown';
        this.logger.warn(
          `Ordered EBCA ingress partition failed: ingress=${rule.rule.ingress.name}, partition=${partition}: ${message}.`,
        );
      }
    }
  }

  private async resolveConsumer(
    rule: ResolvedOrderedIngressRule,
    partition: number,
  ): Promise<Consumer> {
    return this.requireJetStream().consumers.get(
      rule.streamName,
      this.createConsumerName(rule, partition),
    );
  }

  private async replayEnvelope(
    rule: ResolvedOrderedIngressRule,
    envelope: EbcaOrderedIngressEnvelope,
  ): Promise<void> {
    const replayHeaders = headers();
    replayHeaders.set('Ebca-Ordered-Ingress-Replay', '1');
    replayHeaders.set('Ebca-Ingress-Name', envelope.ingressName);
    replayHeaders.set('Ebca-Partition-Key', envelope.partitionKey);
    replayHeaders.set('Ebca-Partition', String(envelope.partition));
    replayHeaders.set('Ebca-Command-Id', envelope.commandId);
    await this.requireNatsConnection().request(
      envelope.originalTopic,
      this.packetCodec.encode({
        ...envelope.packet,
        id: envelope.commandId,
      }),
      {
        timeout: Math.max(1000, rule.ackWaitMs - 1000),
        headers: replayHeaders,
      },
    );
  }

  private createIngressHeaders(envelope: EbcaOrderedIngressEnvelope): MsgHdrs {
    const ingressHeaders = headers();
    ingressHeaders.set('Ebca-Ingress-Name', envelope.ingressName);
    ingressHeaders.set('Ebca-Partition-Key', envelope.partitionKey);
    ingressHeaders.set('Ebca-Partition', String(envelope.partition));
    ingressHeaders.set('Ebca-Original-Topic', envelope.originalTopic);
    ingressHeaders.set('Ebca-Command-Id', envelope.commandId);
    return ingressHeaders;
  }

  private createPublishKey(
    entityClass: EntityConstructor<BaseEntity>,
    eventType: EbcaEventType,
    componentClass: ComponentConstructor<BaseComponent>,
  ): string {
    return `${getEntityName(entityClass)}.${eventType}.${getComponentName(componentClass)}`;
  }

  private createIngressSubject(
    rule: ResolvedOrderedIngressRule,
    partition: number,
  ): string {
    return `${rule.subjectPrefix}.${rule.rule.ingress.name}.${partition}`;
  }

  private createConsumerName(
    rule: ResolvedOrderedIngressRule,
    partition: number,
  ): string {
    return `${this.normalizeNatsName(rule.rule.ingress.name)}_p${partition}`;
  }

  private resolvePartition(partitionKey: string, partitions: number): number {
    let hash = 2166136261;
    for (let index = 0; index < partitionKey.length; index += 1) {
      hash ^= partitionKey.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return Math.abs(hash >>> 0) % partitions;
  }

  private normalizeNatsName(value: string): string {
    return value
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .toUpperCase();
  }

  private normalizePositiveInteger(
    value: number | undefined,
    fallback: number,
  ): number {
    if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
      return value;
    }
    return fallback;
  }

  private resolveNatsServers(): string[] {
    const configured = this.configService.get<string[] | string>(
      'NATS_SERVERS',
    );
    if (Array.isArray(configured)) {
      return configured.length > 0 ? configured : DEFAULT_NATS_SERVERS;
    }
    if (typeof configured === 'string') {
      const servers = configured
        .split(',')
        .map((server) => server.trim())
        .filter((server) => server.length > 0);
      return servers.length > 0 ? servers : DEFAULT_NATS_SERVERS;
    }
    return DEFAULT_NATS_SERVERS;
  }

  private requireNatsConnection(): NatsConnection {
    if (!this.natsConnection) {
      throw new Error('Ordered ingress NATS connection is not initialized.');
    }
    return this.natsConnection;
  }

  private requireJetStream(): JetStreamClient {
    if (!this.jetStream) {
      throw new Error('Ordered ingress JetStream client is not initialized.');
    }
    return this.jetStream;
  }

  private requireJetStreamManager(): JetStreamManager {
    if (!this.jetStreamManager) {
      throw new Error('Ordered ingress JetStream manager is not initialized.');
    }
    return this.jetStreamManager;
  }

  private isNotFoundMessage(message: string): boolean {
    return message.includes('not found') || message.includes('404');
  }
}
