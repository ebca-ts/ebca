import KeyvRedis from '@keyv/redis';
import { CacheModule } from '@nestjs/cache-manager';
import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { EbcaModule } from '@ebca/core';
import { EbcaHealthcheckModule } from '@ebca/healthcheck';
import { CounterController } from './counter.controller';
import { CounterEntity } from './counter.entity';
import { CounterSystem } from './counter.system';

interface CounterAppConfig {
  readonly PORT: string;
  readonly DATABASE_URL: string;
  readonly REDIS_URL: string;
  readonly NATS_SERVERS: string[];
}

const DEFAULT_NATS_SERVERS = [
  'nats://localhost:4222',
  'nats://localhost:4223',
  'nats://localhost:4224',
];

function normalizeNatsServers(value: string | undefined): string[] {
  const servers = (value ?? DEFAULT_NATS_SERVERS.join(','))
    .split(',')
    .map((server) => server.trim())
    .filter((server) => server.length > 0);

  return servers.length > 0 ? servers : DEFAULT_NATS_SERVERS;
}

function validateConfig(config: Record<string, string | undefined>): CounterAppConfig {
  return {
    PORT: config.PORT ?? '3000',
    DATABASE_URL:
      config.DATABASE_URL ??
      'postgresql://ebca:ebca@localhost:5432/ebca_counter',
    REDIS_URL: config.REDIS_URL ?? 'redis://localhost:6379',
    NATS_SERVERS: normalizeNatsServers(config.NATS_SERVERS),
  };
}

@Global()
@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: 'NATS_SERVICE',
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.NATS,
          options: {
            servers: config.getOrThrow<string[]>('NATS_SERVERS'),
            queue: 'ebca-example-counter',
          },
        }),
      },
    ]),
  ],
  exports: [ClientsModule],
})
class CounterTransportModule {}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['examples/counter/.env', '.env'],
      validate: validateConfig,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService): TypeOrmModuleOptions => ({
        type: 'postgres',
        url: config.getOrThrow<string>('DATABASE_URL'),
        entities: [CounterEntity],
        synchronize: true,
        logging: ['warn', 'error'],
      }),
    }),
    CacheModule.registerAsync({
      isGlobal: true,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        stores: [
          new KeyvRedis({
            url: config.getOrThrow<string>('REDIS_URL'),
          }),
        ],
        ttl: 3_600_000,
      }),
    }),
    CounterTransportModule,
    EbcaModule,
    EbcaHealthcheckModule.register(),
  ],
  controllers: [CounterController, CounterSystem],
})
export class CounterModule {}
