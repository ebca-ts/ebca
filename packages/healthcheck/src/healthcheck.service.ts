import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { connect, NatsConnection } from 'nats';
import { createClient, RedisClientOptions } from 'redis';
import { DataSource } from 'typeorm';
import { EBCA_HEALTHCHECK_OPTIONS } from './healthcheck.constants';
import {
  EbcaDependencyHealth,
  EbcaHealthcheckModuleOptions,
  EbcaHealthcheckReport,
  EbcaHealthcheckStatus,
} from './healthcheck.types';

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_DATABASE_QUERY = 'SELECT 1';
const DEFAULT_REDIS_HOST = 'localhost';
const DEFAULT_REDIS_PORT = 6379;
const DEFAULT_TIMEOUT_CONFIG_KEY = 'HEALTHCHECK_TIMEOUT_MS';
const DEFAULT_REDIS_URL_CONFIG_KEY = 'REDIS_URL';
const DEFAULT_REDIS_HOST_CONFIG_KEY = 'REDIS_HOST';
const DEFAULT_REDIS_PORT_CONFIG_KEY = 'REDIS_PORT';
const DEFAULT_REDIS_PASSWORD_CONFIG_KEY = 'REDIS_PASSWORD';
const DEFAULT_REDIS_DATABASE_CONFIG_KEY = 'REDIS_DATABASE';
const DEFAULT_NATS_SERVERS_CONFIG_KEY = 'NATS_SERVERS';
const DEFAULT_NATS_SERVERS = ['nats://localhost:4222'];

@Injectable()
export class EbcaHealthcheckService {
  private readonly logger = new Logger(EbcaHealthcheckService.name);

  constructor(
    @Inject(EBCA_HEALTHCHECK_OPTIONS)
    private readonly options: EbcaHealthcheckModuleOptions,
    @Optional() private readonly dataSource?: DataSource,
    @Optional() private readonly configService?: ConfigService,
  ) {}

  async check(): Promise<EbcaHealthcheckReport> {
    const checks: Array<Promise<readonly [string, EbcaDependencyHealth]>> = [];

    if (this.isCheckEnabled('database')) {
      checks.push(this.measure('database', () => this.checkDatabase()));
    }
    if (this.isCheckEnabled('redis')) {
      checks.push(this.measure('redis', () => this.checkRedis()));
    }
    if (this.isCheckEnabled('nats')) {
      checks.push(this.measure('nats', () => this.checkNats()));
    }

    const entries = await Promise.all(checks);
    const dependencies = Object.fromEntries(entries);
    const status: EbcaHealthcheckStatus = entries.every(
      ([, health]) => health.status === 'ok',
    )
      ? 'ok'
      : 'error';

    return {
      status,
      checkedAt: new Date().toISOString(),
      dependencies,
    };
  }

  private isCheckEnabled(
    check: keyof NonNullable<EbcaHealthcheckModuleOptions['checks']>,
  ): boolean {
    return this.options.checks?.[check] !== false;
  }

  private async measure(
    name: string,
    operation: () => Promise<void>,
  ): Promise<readonly [string, EbcaDependencyHealth]> {
    const startedAt = Date.now();
    try {
      await operation();
      return [
        name,
        {
          status: 'ok',
          latencyMs: Date.now() - startedAt,
        },
      ];
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`${name} healthcheck failed: ${message}`);
      return [
        name,
        {
          status: 'error',
          latencyMs: Date.now() - startedAt,
          error: message,
        },
      ];
    }
  }

  private async checkDatabase(): Promise<void> {
    if (!this.dataSource) {
      throw new Error('TypeORM DataSource provider is not available');
    }
    await this.withTimeout(
      this.dataSource
        .query(this.options.database?.query ?? DEFAULT_DATABASE_QUERY)
        .then(() => undefined),
      'database',
    );
  }

  private async checkRedis(): Promise<void> {
    const client = createClient(this.resolveRedisOptions());

    try {
      await this.withTimeout(client.connect().then(() => undefined), 'redis connect');
      await this.withTimeout(client.ping().then(() => undefined), 'redis ping');
    } finally {
      if (client.isOpen) {
        client.destroy();
      }
    }
  }

  private async checkNats(): Promise<void> {
    let connection: NatsConnection | null = null;

    try {
      connection = await this.withTimeout(
        connect({
          servers: this.resolveNatsServers(),
          timeout: this.resolveTimeoutMs(),
          maxReconnectAttempts: 0,
        }),
        'nats connect',
      );
      await this.withTimeout(connection.flush(), 'nats flush');
    } finally {
      if (connection) {
        await connection.close();
      }
    }
  }

  private resolveRedisOptions(): RedisClientOptions {
    const timeoutMs = this.resolveTimeoutMs();
    const redisOptions = this.options.redis;
    const url =
      redisOptions?.url ??
      this.getConfigString(
        redisOptions?.urlConfigKey ?? DEFAULT_REDIS_URL_CONFIG_KEY,
      );
    const password =
      redisOptions?.password ??
      this.getConfigString(
        redisOptions?.passwordConfigKey ?? DEFAULT_REDIS_PASSWORD_CONFIG_KEY,
      );
    const database =
      redisOptions?.database ??
      this.getConfigNumber(
        redisOptions?.databaseConfigKey ?? DEFAULT_REDIS_DATABASE_CONFIG_KEY,
      );

    if (url) {
      return {
        url,
        password,
        database,
        socket: {
          connectTimeout: timeoutMs,
          reconnectStrategy: false,
        },
      };
    }

    return {
      password,
      database,
      socket: {
        host:
          redisOptions?.host ??
          this.getConfigString(
            redisOptions?.hostConfigKey ?? DEFAULT_REDIS_HOST_CONFIG_KEY,
          ) ??
          DEFAULT_REDIS_HOST,
        port:
          redisOptions?.port ??
          this.getConfigNumber(
            redisOptions?.portConfigKey ?? DEFAULT_REDIS_PORT_CONFIG_KEY,
          ) ??
          DEFAULT_REDIS_PORT,
        connectTimeout: timeoutMs,
        reconnectStrategy: false,
      },
    };
  }

  private resolveNatsServers(): string[] {
    const configuredServers =
      this.options.nats?.servers ??
      this.getConfigStringArray(
        this.options.nats?.serversConfigKey ?? DEFAULT_NATS_SERVERS_CONFIG_KEY,
      );
    const servers = [...(configuredServers ?? [])]
      .map((server) => server.trim())
      .filter((server) => server.length > 0);
    return servers.length > 0 ? servers : DEFAULT_NATS_SERVERS;
  }

  private resolveTimeoutMs(): number {
    const timeout =
      this.options.timeoutMs ??
      this.getConfigNumber(
        this.options.timeoutMsConfigKey ?? DEFAULT_TIMEOUT_CONFIG_KEY,
      ) ??
      DEFAULT_TIMEOUT_MS;
    return Number.isFinite(timeout) && timeout > 0
      ? timeout
      : DEFAULT_TIMEOUT_MS;
  }

  private getConfigString(key: string): string | undefined {
    const value = this.configService?.get<string | number | boolean>(key);
    if (typeof value === 'string') {
      const normalized = value.trim();
      return normalized.length > 0 ? normalized : undefined;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    return undefined;
  }

  private getConfigNumber(key: string): number | undefined {
    const value = this.configService?.get<string | number>(key);
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : undefined;
    }
    if (typeof value === 'string') {
      const parsed = Number.parseInt(value, 10);
      return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
  }

  private getConfigStringArray(key: string): readonly string[] | undefined {
    const value = this.configService?.get<string | readonly string[]>(key);
    if (Array.isArray(value)) {
      return value;
    }
    if (typeof value === 'string') {
      return value.split(',');
    }
    return undefined;
  }

  private async withTimeout<T>(
    operation: Promise<T>,
    name: string,
  ): Promise<T> {
    let timeout: NodeJS.Timeout | undefined;
    const timeoutMs = this.resolveTimeoutMs();
    const timeoutPromise = new Promise<T>((resolve, reject) => {
      timeout = setTimeout(() => {
        reject(new Error(`${name} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    try {
      return await Promise.race([operation, timeoutPromise]);
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }
}
