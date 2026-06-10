import { Global, Module } from '@nestjs/common';
import { ComponentManager } from './component.manager';
import { EbcaDelayedStreamBootstrap } from './delayed-stream.bootstrap';
import { EbcaOrderedIngressService } from './ordered-ingress.service';
import { PersistenceManager } from './persistence.manager';

@Global()
@Module({
  providers: [
    EbcaDelayedStreamBootstrap,
    EbcaOrderedIngressService,
    PersistenceManager,
    ComponentManager,
  ],
  exports: [ComponentManager],
})
export class EbcaModule {}
