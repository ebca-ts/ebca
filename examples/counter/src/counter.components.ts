import {
  BaseCommandComponent,
  BaseComponent,
  Component,
} from '@ebca/core';

export type IncrementCounterRejectReason = 'invalid_amount';

export interface IncrementCounterFailureDetails {
  readonly amount: number;
}

@Component({
  inbound: {
    expose: true,
    operations: ['add'],
    entityId: 'explicit',
  },
})
export class IncrementCounterCommandComponent extends BaseCommandComponent<
  IncrementCounterRejectReason,
  IncrementCounterFailureDetails
> {
  amount = 1;
}

@Component({ isPersistent: true })
export class CounterValueComponent extends BaseComponent {
  value = 0;
  lastCommandId: string | null = null;
}
