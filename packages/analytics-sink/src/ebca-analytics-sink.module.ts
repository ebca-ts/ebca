import { DynamicModule, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EBCA_ANALYTICS_SINK_OPTIONS } from './ebca-analytics-sink.constants';
import {
  EbcaAnalyticsSinkSystem,
  resolveEbcaAnalyticsSinkOptions,
} from './ebca-analytics-sink.system';
import { EbcaAnalyticsEventEntity } from './ebca-analytics-event.entity';
import { EbcaAnalyticsSinkModuleOptions } from './ebca-analytics-sink.types';

@Module({})
export class EbcaAnalyticsSinkModule {
  static register(options: EbcaAnalyticsSinkModuleOptions = {}): DynamicModule {
    return {
      module: EbcaAnalyticsSinkModule,
      imports: [TypeOrmModule.forFeature([EbcaAnalyticsEventEntity])],
      controllers: [EbcaAnalyticsSinkSystem],
      providers: [
        {
          provide: EBCA_ANALYTICS_SINK_OPTIONS,
          useValue: resolveEbcaAnalyticsSinkOptions(options),
        },
      ],
      exports: [TypeOrmModule],
    };
  }
}
