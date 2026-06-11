import { DynamicModule, Module } from '@nestjs/common';
import { EBCA_HEALTHCHECK_OPTIONS } from './healthcheck.constants';
import { EbcaHealthcheckController } from './healthcheck.controller';
import { EbcaHealthcheckService } from './healthcheck.service';
import { EbcaHealthcheckModuleOptions } from './healthcheck.types';

@Module({})
export class EbcaHealthcheckModule {
  static register(
    options: EbcaHealthcheckModuleOptions = {},
  ): DynamicModule {
    return {
      module: EbcaHealthcheckModule,
      controllers: [EbcaHealthcheckController],
      providers: [
        {
          provide: EBCA_HEALTHCHECK_OPTIONS,
          useValue: options,
        },
        EbcaHealthcheckService,
      ],
      exports: [EbcaHealthcheckService],
    };
  }
}
