import 'reflect-metadata';
import { ConsoleLogger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Transport } from '@nestjs/microservices';
import { CounterModule } from './counter.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(CounterModule, {
    logger: new ConsoleLogger({ timestamp: true }),
  });
  const config = app.get(ConfigService);
  app.connectMicroservice({
    transport: Transport.NATS,
    options: {
      servers: config.getOrThrow<string[]>('NATS_SERVERS'),
      queue: 'ebca-example-counter',
    },
  });
  await app.init();
  await app.startAllMicroservices();
  await app.listen(Number.parseInt(config.get<string>('PORT', '3000'), 10));
}

bootstrap().catch((error: Error) => {
  console.error('Counter example failed to start:', error);
  process.exit(1);
});
