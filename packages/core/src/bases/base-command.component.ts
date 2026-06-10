import { BaseComponent } from './base.component';

export enum CommandComponentStatus {
  PENDING = 'pending',
  SUCCEEDED = 'succeeded',
  REJECTED = 'rejected',
}

export enum CommandComponentSource {
  SYSTEM = 'system',
  WEBSOCKET = 'websocket',
}

export type CommandFailureDetailValue =
  | string
  | number
  | boolean
  | null
  | CommandFailureDetailValue[]
  | { [key: string]: CommandFailureDetailValue };

export type CommandFailureDetails = {
  [key: string]: CommandFailureDetailValue;
};

export abstract class BaseCommandComponent<
  TReason extends string = string,
  TFailureDetails extends object = CommandFailureDetails,
> extends BaseComponent {
  public commandId?: string;
  public callbackQueryId?: string;
  public commandSource: CommandComponentSource = CommandComponentSource.SYSTEM;
  public status: CommandComponentStatus = CommandComponentStatus.PENDING;
  public reason: TReason | null = null;
  public failureDetails: TFailureDetails | null = null;

  public reject(reason: TReason, failureDetails: TFailureDetails): void {
    this.status = CommandComponentStatus.REJECTED;
    this.reason = reason;
    this.failureDetails = failureDetails;
  }

  public succeed(): void {
    this.status = CommandComponentStatus.SUCCEEDED;
    this.reason = null;
    this.failureDetails = null;
  }

  public resetCommandState(): void {
    this.status = CommandComponentStatus.PENDING;
    this.reason = null;
    this.failureDetails = null;
  }
}
