export type EbcaHealthcheckStatus = 'ok' | 'error';

export interface EbcaDependencyHealth {
  readonly status: EbcaHealthcheckStatus;
  readonly latencyMs: number;
  readonly error?: string;
}

export interface EbcaHealthcheckReport {
  readonly status: EbcaHealthcheckStatus;
  readonly checkedAt: string;
  readonly dependencies: Record<string, EbcaDependencyHealth>;
}

export interface EbcaHealthcheckEnabledChecks {
  readonly database?: boolean;
  readonly redis?: boolean;
  readonly nats?: boolean;
}

export interface EbcaHealthcheckRedisOptions {
  readonly url?: string;
  readonly urlConfigKey?: string;
  readonly host?: string;
  readonly hostConfigKey?: string;
  readonly port?: number;
  readonly portConfigKey?: string;
  readonly password?: string;
  readonly passwordConfigKey?: string;
  readonly database?: number;
  readonly databaseConfigKey?: string;
}

export interface EbcaHealthcheckNatsOptions {
  readonly servers?: readonly string[];
  readonly serversConfigKey?: string;
}

export interface EbcaHealthcheckDatabaseOptions {
  readonly query?: string;
}

export interface EbcaHealthcheckModuleOptions {
  readonly checks?: EbcaHealthcheckEnabledChecks;
  readonly timeoutMs?: number;
  readonly timeoutMsConfigKey?: string;
  readonly database?: EbcaHealthcheckDatabaseOptions;
  readonly redis?: EbcaHealthcheckRedisOptions;
  readonly nats?: EbcaHealthcheckNatsOptions;
}
