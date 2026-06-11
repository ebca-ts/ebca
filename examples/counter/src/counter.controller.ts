import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ComponentManager } from '@ebca/core';
import { CounterEntity } from './counter.entity';
import {
  CounterValueComponent,
  IncrementCounterCommandComponent,
} from './counter.components';

interface IncrementCounterResponse {
  readonly entityId: string;
  readonly commandId: string;
  readonly amount: number;
  readonly status: 'accepted';
}

interface CounterStateResponse {
  readonly entityId: string;
  readonly value: number;
  readonly updatedAt: number | null;
  readonly lastCommandId: string | null;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Controller('counter')
export class CounterController {
  constructor(private readonly components: ComponentManager) {}

  @Post(':id/increment')
  async increment(
    @Param('id') id: string,
    @Body('amount') rawAmount?: number | string,
  ): Promise<IncrementCounterResponse> {
    const entityId = this.requireEntityId(id);
    const command = new IncrementCounterCommandComponent();
    command.commandId = randomUUID();
    command.amount = this.normalizeAmount(rawAmount);

    await this.components.addComponent(new CounterEntity(entityId), command);

    return {
      entityId,
      commandId: command.commandId,
      amount: command.amount,
      status: 'accepted',
    };
  }

  @Get(':id')
  async getCounter(@Param('id') id: string): Promise<CounterStateResponse> {
    const entityId = this.requireEntityId(id);
    const component = await this.components.getComponent(
      new CounterEntity(entityId),
      CounterValueComponent,
    );

    return {
      entityId,
      value: component?.value ?? 0,
      updatedAt: component?.updatedAt ?? null,
      lastCommandId: component?.lastCommandId ?? null,
    };
  }

  private requireEntityId(id: string): string {
    if (!UUID_PATTERN.test(id)) {
      throw new BadRequestException('counter id must be a UUID');
    }
    return id;
  }

  private normalizeAmount(rawAmount: number | string | undefined): number {
    if (rawAmount === undefined || rawAmount === '') {
      return 1;
    }
    const amount =
      typeof rawAmount === 'number' ? rawAmount : Number.parseInt(rawAmount, 10);
    return Number.isFinite(amount) ? amount : 1;
  }
}
