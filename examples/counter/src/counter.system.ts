import { Logger } from '@nestjs/common';
import { Payload } from '@nestjs/microservices';
import {
  ComponentManager,
  EbcaEventType,
  EbcaPattern,
  System,
} from '@ebca/core';
import { CounterEntity } from './counter.entity';
import {
  CounterValueComponent,
  IncrementCounterCommandComponent,
} from './counter.components';

interface IncrementCounterPayload {
  readonly entityId: string;
  readonly component: IncrementCounterCommandComponent;
}

@System({ name: 'CounterSystem' })
export class CounterSystem {
  private readonly logger = new Logger(CounterSystem.name);

  constructor(private readonly components: ComponentManager) {}

  @EbcaPattern({
    entityClass: CounterEntity,
    eventType: EbcaEventType.COMPONENT_ADDED,
    componentClass: IncrementCounterCommandComponent,
  })
  async handleIncrement(
    @Payload() payload: IncrementCounterPayload,
  ): Promise<void> {
    const counter = new CounterEntity(payload.entityId);
    const command = payload.component;

    if (!Number.isFinite(command.amount) || command.amount <= 0) {
      command.reject('invalid_amount', { amount: command.amount });
      await this.components.updateComponent(counter, command);
      this.logger.warn(
        `Rejected counter increment: entity=${counter.id}, amount=${command.amount}.`,
      );
      return;
    }

    const current = await this.components.getComponent(
      counter,
      CounterValueComponent,
    );
    const next = current ?? new CounterValueComponent();
    next.value = (current?.value ?? 0) + command.amount;
    next.lastCommandId = command.commandId ?? null;

    await this.components.upsertComponent(counter, next);
    command.succeed();
    await this.components.updateComponent(counter, command);

    this.logger.log(
      `Counter incremented: entity=${counter.id}, amount=${command.amount}, value=${next.value}.`,
    );
  }
}
