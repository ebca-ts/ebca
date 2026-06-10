import { Inject, Logger, Type } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
} from '@nestjs/websockets';
import { randomUUID } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import { EBCA_WS_AUTH_ADAPTER, EBCA_WS_GATEWAY_OPTIONS } from './tokens';
import type {
  EbcaWsClientEnvelope,
  EbcaWsClientHelloPayload,
  EbcaWsComponentMutationPayload,
  EbcaWsQueryPayload,
  EbcaWsRequestComponentsPayload,
  EbcaWsEbcaComponentPayload,
  EbcaWsOutboundEnvelope,
  EbcaWsOutboundPayload,
  EbcaWsErrorPayload,
  EbcaWsEbcaComponentBatchPayload,
} from './types/ebca-ws-gateway.contracts';
import type {
  EbcaWsAuthAdapter,
  EbcaWsAuthenticatedIdentity,
  EbcaWsGatewayResolvedOptions,
} from './types/ebca-ws-gateway.options';
import { EbcaWsComponentMutationService } from './services/ebca-ws-component-mutation.service';
import { EbcaWsComponentRequestService } from './services/ebca-ws-component-request.service';
import { EbcaWsQueryService } from './services/ebca-ws-query.service';

export class EbcaWsGatewayBase
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(EbcaWsGatewayBase.name);
  private readonly authenticatedIdentities = new Map<
    string,
    EbcaWsAuthenticatedIdentity
  >();
  private readonly pendingAuthenticatedIdentities = new Map<
    string,
    Promise<EbcaWsAuthenticatedIdentity | null>
  >();
  private server: Server | null = null;

  constructor(
    protected readonly options: EbcaWsGatewayResolvedOptions,
    protected readonly authAdapter: EbcaWsAuthAdapter,
    protected readonly componentRequest: EbcaWsComponentRequestService,
    protected readonly componentMutation: EbcaWsComponentMutationService,
    protected readonly queryService: EbcaWsQueryService,
  ) {}

  afterInit(server: Server): void {
    this.server = server;
  }

  async handleConnection(client: Socket): Promise<void> {
    const identity = await this.resolveAuthenticatedIdentity(client);
    if (!identity) {
      this.emitError(
        client,
        undefined,
        'auth_token_required',
        'Valid auth token is required.',
      );
      client.disconnect(true);
      this.logger.warn(
        `Rejected EBCA websocket client ${client.id}: auth token is missing or invalid.`,
      );
      return;
    }
    this.authenticatedIdentities.set(client.id, identity);
    this.bindClientEvents(client);
    this.logger.debug(
      `EBCA websocket client connected: ${client.id}, identity=${identity.identityId}.`,
    );
  }

  handleDisconnect(client: Socket): void {
    this.authenticatedIdentities.delete(client.id);
    this.pendingAuthenticatedIdentities.delete(client.id);
    this.logger.debug(`EBCA websocket client disconnected: ${client.id}.`);
  }

  emitToIdentity(
    identityId: string,
    type: string,
    payload: EbcaWsEbcaComponentPayload,
    requestId?: string,
  ): void {
    const server = this.server;
    if (!server) {
      this.logger.warn(
        `Skipped EBCA websocket emit ${type}: server not ready.`,
      );
      return;
    }
    server
      .to(this.identityRoom(identityId))
      .emit(
        this.options.eventNames.serverEvent,
        this.createEnvelope(identityId, type, payload, requestId),
      );
  }

  emitToAll(
    type: string,
    payload: EbcaWsEbcaComponentPayload,
    requestId?: string,
  ): void {
    const server = this.server;
    if (!server) {
      this.logger.warn(
        `Skipped EBCA websocket broadcast ${type}: server not ready.`,
      );
      return;
    }
    server.emit(
      this.options.eventNames.serverEvent,
      this.createEnvelope(
        this.options.broadcastIdentityId,
        type,
        payload,
        requestId,
      ),
    );
  }

  private bindClientEvents(client: Socket): void {
    client.on(
      this.options.eventNames.hello,
      (payload: EbcaWsClientHelloPayload | null) => {
        void this.handleHello(client, payload);
      },
    );
    client.on(
      this.options.eventNames.componentRequest,
      (
        envelope: EbcaWsClientEnvelope<EbcaWsRequestComponentsPayload> | null,
      ) => {
        void this.handleComponentRequest(client, envelope);
      },
    );
    client.on(
      this.options.eventNames.component,
      (
        envelope: EbcaWsClientEnvelope<EbcaWsComponentMutationPayload> | null,
      ) => {
        void this.handleComponentMutation(client, envelope);
      },
    );
    client.on(
      this.options.eventNames.query,
      (envelope: EbcaWsClientEnvelope<EbcaWsQueryPayload> | null) => {
        void this.handleQuery(client, envelope);
      },
    );
  }

  private async handleHello(
    client: Socket,
    payload: EbcaWsClientHelloPayload | null,
  ): Promise<void> {
    const identity = await this.resolveAuthenticatedIdentity(client);
    if (!identity) {
      this.emitError(
        client,
        payload?.requestId,
        'auth_token_required',
        'Valid auth token is required.',
      );
      client.disconnect(true);
      return;
    }
    const requestedIdentityId = payload?.[this.options.identityField];
    if (requestedIdentityId && requestedIdentityId !== identity.identityId) {
      this.logger.warn(
        `Ignored EBCA websocket hello identity mismatch: client=${client.id}, payload=${requestedIdentityId}, auth=${identity.identityId}.`,
      );
    }
    await client.join(this.identityRoom(identity.identityId));
    this.logger.debug(
      `EBCA websocket client ${client.id} joined identity room ${identity.identityId}.`,
    );
  }

  private async handleComponentRequest(
    client: Socket,
    envelope: EbcaWsClientEnvelope<EbcaWsRequestComponentsPayload> | null,
  ): Promise<void> {
    const identity = await this.resolveAuthenticatedIdentity(client);
    if (
      !identity ||
      !envelope ||
      !envelope.requestId ||
      !Array.isArray(envelope.payload?.targets)
    ) {
      this.emitError(
        client,
        envelope?.requestId,
        'invalid_component_request_envelope',
        'Valid auth token, requestId and payload.targets are required.',
      );
      return;
    }
    try {
      const startedAt = Date.now();
      const components = await this.componentRequest.resolveRequestedComponents(
        identity,
        envelope.payload,
      );
      this.emitComponentBatchToClient(
        client,
        identity.identityId,
        components,
        envelope.requestId,
      );
      this.logger.debug(
        `Resolved EBCA websocket component request for identity ${identity.identityId}: targets=${envelope.payload.targets.length}, components=${components.length}, durationMs=${Date.now() - startedAt}.`,
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to resolve component request.';
      this.emitError(
        client,
        envelope.requestId,
        'component_request_failed',
        message,
      );
      this.logger.error(
        `Failed EBCA websocket component request for identity ${identity.identityId}: ${message}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private async handleComponentMutation(
    client: Socket,
    envelope: EbcaWsClientEnvelope<EbcaWsComponentMutationPayload> | null,
  ): Promise<void> {
    const identity = await this.resolveAuthenticatedIdentity(client);
    if (
      !identity ||
      !envelope ||
      !envelope.requestId ||
      !envelope.payload?.entityName ||
      !envelope.payload.entityId ||
      !envelope.payload.componentName ||
      !envelope.payload.operation
    ) {
      this.emitError(
        client,
        envelope?.requestId,
        'invalid_component_envelope',
        'Valid auth token, requestId and component mutation payload are required.',
      );
      return;
    }
    try {
      await this.componentMutation.applyMutation(identity, envelope.payload);
      this.logger.debug(
        `Accepted EBCA websocket component ${envelope.payload.operation} ${envelope.payload.componentName} for identity ${identity.identityId}.`,
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to apply component mutation.';
      this.emitError(
        client,
        envelope.requestId,
        'component_mutation_failed',
        message,
      );
      this.logger.error(
        `Failed EBCA websocket component mutation for identity ${identity.identityId}: ${message}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private async handleQuery(
    client: Socket,
    envelope: EbcaWsClientEnvelope<EbcaWsQueryPayload> | null,
  ): Promise<void> {
    const identity = await this.resolveAuthenticatedIdentity(client);
    if (
      !identity ||
      !envelope ||
      !envelope.requestId ||
      !envelope.payload?.name
    ) {
      this.emitError(
        client,
        envelope?.requestId,
        'invalid_query_envelope',
        'Valid auth token, requestId and query payload are required.',
      );
      return;
    }
    try {
      const payload = await this.queryService.executeQuery(
        identity,
        envelope.requestId,
        envelope.payload,
      );
      this.emitPayloadToClient(
        client,
        identity.identityId,
        payload.kind,
        payload,
        envelope.requestId,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to resolve query.';
      this.emitError(client, envelope.requestId, 'query_failed', message);
      this.logger.error(
        `Failed EBCA websocket query for identity ${identity.identityId}: ${message}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private emitComponentBatchToClient(
    client: Socket,
    identityId: string,
    components: readonly EbcaWsEbcaComponentPayload[],
    requestId: string,
  ): void {
    const payload: EbcaWsEbcaComponentBatchPayload = {
      kind: 'component.batch',
      components,
    };
    this.emitPayloadToClient(
      client,
      identityId,
      payload.kind,
      payload,
      requestId,
    );
  }

  private emitPayloadToClient(
    client: Socket,
    identityId: string,
    type: string,
    payload: EbcaWsOutboundPayload,
    requestId?: string,
  ): void {
    client.emit(
      this.options.eventNames.serverEvent,
      this.createEnvelope(identityId, type, payload, requestId),
    );
  }

  private emitError(
    client: Socket,
    requestId: string | undefined,
    code: string,
    message: string,
  ): void {
    const payload: EbcaWsErrorPayload = {
      requestId,
      code,
      message,
    };
    client.emit(this.options.eventNames.serverError, payload);
  }

  private createEnvelope(
    identityId: string,
    type: string,
    payload: EbcaWsOutboundPayload,
    requestId?: string,
  ): EbcaWsOutboundEnvelope {
    const envelope: EbcaWsOutboundEnvelope = {
      eventId: randomUUID(),
      type,
      emittedAt: new Date().toISOString(),
      requestId,
      payload,
    };
    envelope[this.options.identityField] = identityId;
    return envelope;
  }

  private identityRoom(identityId: string): string {
    return `${this.options.identityRoomPrefix}:${identityId}`;
  }

  private async resolveAuthenticatedIdentity(
    client: Socket,
  ): Promise<EbcaWsAuthenticatedIdentity | null> {
    const cachedIdentity = this.authenticatedIdentities.get(client.id);
    if (cachedIdentity) {
      return cachedIdentity;
    }
    const pendingIdentity = this.pendingAuthenticatedIdentities.get(client.id);
    if (pendingIdentity) {
      return pendingIdentity;
    }
    const resolvedIdentity = Promise.resolve(
      this.authAdapter.resolveIdentity({
        clientId: client.id,
        token: this.resolveHandshakeToken(client),
        auth: this.resolveHandshakeAuth(client),
        headers: client.handshake.headers,
      }),
    )
      .then((identity) => {
        if (!identity) {
          return null;
        }
        const authenticatedIdentity: EbcaWsAuthenticatedIdentity = {
          identityId: identity.identityId,
          roles: identity.roles ?? this.options.defaultRoles,
        };
        this.authenticatedIdentities.set(client.id, authenticatedIdentity);
        return authenticatedIdentity;
      })
      .finally(() => {
        this.pendingAuthenticatedIdentities.delete(client.id);
      });
    this.pendingAuthenticatedIdentities.set(client.id, resolvedIdentity);
    return resolvedIdentity;
  }

  private resolveHandshakeAuth(
    client: Socket,
  ): Record<string, string | readonly string[] | undefined> {
    return client.handshake.auth as Record<
      string,
      string | readonly string[] | undefined
    >;
  }

  private resolveHandshakeToken(client: Socket): string | null {
    const auth = this.resolveHandshakeAuth(client);
    const authToken = auth.token;
    if (typeof authToken === 'string' && authToken.trim().length > 0) {
      return authToken.trim();
    }
    return this.extractBearerToken(client.handshake.headers.authorization);
  }

  private extractBearerToken(
    authorization: string | readonly string[] | undefined,
  ): string | null {
    let header: string | undefined;
    if (typeof authorization === 'string') {
      header = authorization;
    } else if (authorization && authorization.length > 0) {
      const firstHeader = authorization[0];
      header = typeof firstHeader === 'string' ? firstHeader : undefined;
    }
    if (!header?.startsWith('Bearer ')) {
      return null;
    }
    const token = header.slice('Bearer '.length).trim();
    return token.length > 0 ? token : null;
  }
}

export function createEbcaWsGatewayClass(
  options: Pick<EbcaWsGatewayResolvedOptions, 'namespace' | 'corsOrigin'>,
): Type<EbcaWsGatewayBase> {
  @WebSocketGateway({
    namespace: options.namespace,
    cors: {
      origin: options.corsOrigin,
    },
  })
  class ConfiguredEbcaWsGateway extends EbcaWsGatewayBase {
    constructor(
      @Inject(EBCA_WS_GATEWAY_OPTIONS)
      gatewayOptions: EbcaWsGatewayResolvedOptions,
      @Inject(EBCA_WS_AUTH_ADAPTER)
      authAdapter: EbcaWsAuthAdapter,
      componentRequest: EbcaWsComponentRequestService,
      componentMutation: EbcaWsComponentMutationService,
      queryService: EbcaWsQueryService,
    ) {
      super(
        gatewayOptions,
        authAdapter,
        componentRequest,
        componentMutation,
        queryService,
      );
    }
  }
  return ConfiguredEbcaWsGateway;
}
