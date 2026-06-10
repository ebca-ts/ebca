import { Controller, Inject, Logger } from '@nestjs/common';
import { Ctx, EventPattern, NatsContext, Payload } from '@nestjs/microservices';
import {
  EBCA_WS_GATEWAY_EMITTER,
  type EbcaWsGatewayEmitterToken,
} from './tokens';
import { EbcaWsProjectionService } from './services/ebca-ws-projection.service';
import type { EbcaWsEbcaProjectionPayload } from './services/ebca-ws-projection.service';

@Controller()
export class EbcaWsProjectorController {
  private readonly logger = new Logger(EbcaWsProjectorController.name);

  constructor(
    private readonly projection: EbcaWsProjectionService,
    @Inject(EBCA_WS_GATEWAY_EMITTER)
    private readonly gateway: EbcaWsGatewayEmitterToken,
  ) {}

  @EventPattern('ebca.>')
  async handleEbcaLifecycle(
    @Payload() data: EbcaWsEbcaProjectionPayload,
    @Ctx() context: NatsContext,
  ): Promise<void> {
    const projection = await this.projection.resolveLifecycleProjection(
      context.getSubject(),
      data,
    );
    if (!projection) {
      return;
    }
    if (projection.broadcast) {
      this.gateway.emitToAll(
        projection.payload.componentName,
        projection.payload,
      );
      return;
    }
    for (const identityId of projection.recipientIds) {
      this.gateway.emitToIdentity(
        identityId,
        projection.payload.componentName,
        projection.payload,
      );
    }
    if (projection.recipientIds.length === 0) {
      this.logger.debug(
        `Skipped EBCA websocket projection for ${projection.payload.componentName}: recipients not resolved.`,
      );
    }
  }
}
