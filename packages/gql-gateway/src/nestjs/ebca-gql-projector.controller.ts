import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, NatsContext, Payload } from '@nestjs/microservices';
import { EbcaGqlProjectionService } from '../services/ebca-gql-projection.service';
import { EbcaGqlSubscriptionRegistryService } from '../services/ebca-gql-subscription-registry.service';
import type { EbcaGqlEbcaProjectionPayload } from '../services/ebca-gql-projection.service';

@Controller()
export class EbcaGqlProjectorController {
  private readonly logger = new Logger(EbcaGqlProjectorController.name);

  constructor(
    private readonly projection: EbcaGqlProjectionService,
    private readonly subscriptions: EbcaGqlSubscriptionRegistryService,
  ) {}

  @EventPattern('ebca.>')
  async handleEbcaLifecycle(
    @Payload() data: EbcaGqlEbcaProjectionPayload,
    @Ctx() context: NatsContext,
  ): Promise<void> {
    const projection = await this.projection.resolveLifecycleProjection(
      context.getSubject(),
      data,
    );
    if (!projection) {
      return;
    }
    this.subscriptions.publish(projection);
    if (!projection.broadcast && projection.recipientIds.length === 0) {
      this.logger.debug(
        `Skipped EBCA GraphQL projection for ${projection.payload.componentName}: recipients not resolved.`,
      );
    }
  }
}
