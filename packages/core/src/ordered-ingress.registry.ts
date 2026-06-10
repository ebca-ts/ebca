import { BaseComponent } from './bases/base.component';
import { BaseEntity } from './bases/base.entity';
import { EbcaEventType } from './ebca.helpers';
import { ComponentConstructor } from './types/componens';
import { EntityConstructor } from './types/entities';
import { SystemConstructor } from './types/systems';

export interface EbcaOrderedIngressKeyContext<
  C extends BaseComponent = BaseComponent,
> {
  entityId: string;
  entityName: string;
  eventType: EbcaEventType;
  componentName: string;
  component: C;
  originalTopic: string;
}

export interface EbcaOrderedIngressOptions<
  C extends BaseComponent = BaseComponent,
> {
  name: string;
  partitions: number;
  key: (context: EbcaOrderedIngressKeyContext<C>) => string;
  streamName?: string;
  subjectPrefix?: string;
  ackWaitMs?: number;
  maxDeliver?: number;
  publishTimeoutMs?: number;
}

export interface EbcaOrderedIngressRule {
  systemClass: SystemConstructor;
  methodName: string;
  topic: string;
  entityClass: EntityConstructor<BaseEntity>;
  eventType: EbcaEventType;
  componentClass: ComponentConstructor<BaseComponent>;
  ingress: EbcaOrderedIngressOptions;
}

export interface EbcaOrderedIngressPublishContext<
  C extends BaseComponent = BaseComponent,
> {
  entityClass: EntityConstructor<BaseEntity>;
  entityId: string;
  eventType: EbcaEventType;
  componentClass: ComponentConstructor<C>;
  component: C;
  payload: {
    entityId: string;
    component: C;
  };
  originalTopic: string;
}

export interface EbcaOrderedIngressPacket<
  C extends BaseComponent = BaseComponent,
> {
  pattern: string;
  data: {
    entityId: string;
    component: C;
  };
  id?: string;
}

export interface EbcaOrderedIngressEnvelope<
  C extends BaseComponent = BaseComponent,
> {
  schemaVersion: 1;
  commandId: string;
  originalTopic: string;
  ingressName: string;
  partitionKey: string;
  partition: number;
  entityName: string;
  entityId: string;
  eventType: EbcaEventType;
  componentName: string;
  publishedAt: string;
  packet: EbcaOrderedIngressPacket<C>;
}

const EBCA_ORDERED_INGRESS_RULES: EbcaOrderedIngressRule[] = [];

export function registerEbcaOrderedIngressRule(
  rule: EbcaOrderedIngressRule,
): void {
  EBCA_ORDERED_INGRESS_RULES.push(rule);
}

export function getEbcaOrderedIngressRules(): EbcaOrderedIngressRule[] {
  return EBCA_ORDERED_INGRESS_RULES;
}
