import { BadRequestException } from '@nestjs/common';
import {
  ComponentManager,
  EbcaQuery,
  EbcaQueryParam,
  EbcaReadRepository,
} from '@ebca/core';
import { CounterValueComponent } from './counter.components';
import { CounterEntity } from './counter.entity';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class CounterStateParams {
  @EbcaQueryParam({ required: true })
  entityId: string;
}

export interface CounterStateResult {
  readonly entityId: string;
  readonly value: number;
  readonly updatedAt: number | null;
  readonly lastCommandId: string | null;
}

@EbcaReadRepository({ name: 'CounterReadRepository' })
export class CounterReadRepository {
  constructor(private readonly components: ComponentManager) {}

  @EbcaQuery({
    name: 'counterState',
    gates: ['rest'],
    entityClass: CounterEntity,
    components: [CounterValueComponent],
  })
  async counterState(params: CounterStateParams): Promise<CounterStateResult> {
    if (!UUID_PATTERN.test(params.entityId)) {
      throw new BadRequestException('entityId must be a UUID');
    }
    const component = await this.components.getComponent(
      new CounterEntity(params.entityId),
      CounterValueComponent,
    );

    return {
      entityId: params.entityId,
      value: component?.value ?? 0,
      updatedAt: component?.updatedAt ?? null,
      lastCommandId: component?.lastCommandId ?? null,
    };
  }
}
