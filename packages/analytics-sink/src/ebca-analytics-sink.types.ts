import { BaseComponent } from '@ebca/core';

export type EbcaAnalyticsEventPayloadValue =
  | string
  | number
  | boolean
  | null
  | EbcaAnalyticsEventPayloadValue[]
  | { [key: string]: EbcaAnalyticsEventPayloadValue };

export type EbcaAnalyticsEventPayload = {
  [key: string]: EbcaAnalyticsEventPayloadValue;
};

export interface EbcaAnalyticsLifecyclePayload {
  component?: BaseComponent;
  previousComponent?: BaseComponent;
}

export interface EbcaAnalyticsSinkModuleOptions {
  batchSize?: number;
  flushIntervalMs?: number;
  maxBufferSize?: number;
  verboseFlushLog?: boolean;
}

export interface EbcaAnalyticsSinkResolvedOptions {
  batchSize: number;
  flushIntervalMs: number;
  maxBufferSize: number | null;
  verboseFlushLog: boolean;
}
