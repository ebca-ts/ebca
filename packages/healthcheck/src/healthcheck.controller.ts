import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { EbcaHealthcheckService } from './healthcheck.service';
import { EbcaHealthcheckReport } from './healthcheck.types';

interface HealthcheckHttpResponse {
  status(statusCode: number): HealthcheckHttpResponse;
}

@Controller('health')
export class EbcaHealthcheckController {
  constructor(private readonly healthcheck: EbcaHealthcheckService) {}

  @Get()
  async check(
    @Res({ passthrough: true }) response: HealthcheckHttpResponse,
  ): Promise<EbcaHealthcheckReport> {
    const report = await this.healthcheck.check();
    if (report.status !== 'ok') {
      response.status(HttpStatus.SERVICE_UNAVAILABLE);
    }
    return report;
  }
}
