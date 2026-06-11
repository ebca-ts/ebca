import {
  Body,
  Controller,
  Get,
  Inject,
  Optional,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBody,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import {
  getEbcaQueries,
  getEbcaReadRepositories,
} from '@ebca/core/decorators/ebca-query.decorator';
import {
  getComponentOptions,
  getRegisteredComponents,
} from '@ebca/core/decorators/component.decorator';
import { getComponentName } from '@ebca/core/ebca.helpers';
import { EBCA_REST_AUTH_ADAPTER, EBCA_REST_GATEWAY_OPTIONS } from './tokens';
import type {
  EbcaRestAuthAdapterToken,
  EbcaRestGatewayOptionsToken,
} from './tokens';
import { EbcaRestComponentMutationService } from './services/ebca-rest-component-mutation.service';
import { EbcaRestQueryService } from './services/ebca-rest-query.service';
import {
  EbcaRestComponentMutationBody,
  EbcaRestComponentMutationOperation,
  EbcaRestComponentMutationResponse,
  EbcaRestJsonObject,
  EbcaRestMetaResponse,
  EbcaRestQueryBody,
  EbcaRestQueryResponse,
} from './types/ebca-rest-gateway.contracts';
import type {
  EbcaRestAuthenticatedIdentity,
  EbcaRestHttpRequest,
} from './types/ebca-rest-gateway.options';

@ApiTags('EBCA REST')
@ApiExtraModels(
  EbcaRestComponentMutationBody,
  EbcaRestComponentMutationResponse,
  EbcaRestQueryBody,
  EbcaRestQueryResponse,
)
@Controller('ebca')
export class EbcaRestGatewayController {
  constructor(
    @Inject(EBCA_REST_GATEWAY_OPTIONS)
    private readonly options: EbcaRestGatewayOptionsToken,
    @Optional()
    @Inject(EBCA_REST_AUTH_ADAPTER)
    private readonly authAdapter: EbcaRestAuthAdapterToken | null,
    private readonly componentMutations: EbcaRestComponentMutationService,
    private readonly queries: EbcaRestQueryService,
  ) {}

  @Get('meta')
  @ApiOperation({ summary: 'List REST-open EBCA components and queries.' })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        queries: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              repositoryName: { type: 'string' },
              params: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    type: { type: 'string' },
                    required: { type: 'boolean' },
                    array: { type: 'boolean' },
                  },
                },
              },
            },
          },
        },
        inboundComponents: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              entityName: { type: 'string' },
              componentName: { type: 'string' },
              operations: {
                type: 'array',
                items: { type: 'string' },
              },
              fields: {
                type: 'array',
                items: { type: 'string' },
              },
            },
          },
        },
      },
    },
  })
  async meta(): Promise<EbcaRestMetaResponse> {
    const restQueries = getEbcaQueries().filter((query) =>
      query.options.gates.includes('rest'),
    );
    const repositories = getEbcaReadRepositories();
    const inboundComponents = getRegisteredComponents()
      .map((componentClass) => ({
        componentName: getComponentName(componentClass),
        operations: getComponentOptions(componentClass)?.inbound?.operations,
        fields: getComponentOptions(componentClass)?.inbound?.fields,
        expose: getComponentOptions(componentClass)?.inbound?.expose,
      }))
      .filter((component) => component.expose)
      .map((component) => ({
        entityName: '*',
        componentName: component.componentName,
        operations: component.operations ?? ['upsert'],
        fields: component.fields ?? [],
      }));

    return {
      queries: restQueries.map((query) => ({
        name: query.options.name,
        repositoryName:
          repositories.find(
            (repository) => repository.repositoryClass === query.repositoryClass,
          )?.options.name ?? query.repositoryClass.name,
        params: query.params.map((param) => ({
          name: param.propertyName,
          type: param.options.type,
          required: param.options.required,
          array: param.options.array,
        })),
      })),
      inboundComponents,
    };
  }

  @Post('components/:entityName/:entityId/:componentName/:operation')
  @ApiOperation({ summary: 'Apply an exposed EBCA component mutation.' })
  @ApiParam({ name: 'entityName', example: 'CounterEntity' })
  @ApiParam({
    name: 'entityId',
    example: '11111111-1111-4111-8111-111111111111',
  })
  @ApiParam({ name: 'componentName', example: 'IncrementCounterCommandComponent' })
  @ApiParam({ name: 'operation', enum: ['add', 'update', 'upsert', 'remove'] })
  @ApiBody({ type: EbcaRestComponentMutationBody })
  @ApiOkResponse({ type: EbcaRestComponentMutationResponse })
  async mutateComponent(
    @Req() request: EbcaRestHttpRequest,
    @Param('entityName') entityName: string,
    @Param('entityId') entityId: string,
    @Param('componentName') componentName: string,
    @Param('operation') operation: EbcaRestComponentMutationOperation,
    @Body() body: EbcaRestComponentMutationBody,
  ): Promise<EbcaRestComponentMutationResponse> {
    return this.componentMutations.applyMutation(
      await this.resolveIdentity(request),
      {
        entityName,
      entityId,
      componentName,
      operation,
      component: body?.component,
      },
    );
  }

  @Get('queries/:name')
  @ApiOperation({ summary: 'Execute an EBCA REST query using URL params.' })
  @ApiParam({ name: 'name', example: 'counterState' })
  @ApiOkResponse({ type: EbcaRestQueryResponse })
  async getQuery(
    @Req() request: EbcaRestHttpRequest,
    @Param('name') name: string,
    @Query() params: Record<string, string | readonly string[] | undefined>,
  ): Promise<EbcaRestQueryResponse> {
    return this.queries.executeQuery(await this.resolveIdentity(request), {
      name,
      params: this.normalizeQueryParams(params),
    });
  }

  @Post('queries/:name')
  @ApiOperation({ summary: 'Execute an EBCA REST query using JSON params.' })
  @ApiParam({ name: 'name', example: 'counterState' })
  @ApiBody({ type: EbcaRestQueryBody })
  @ApiOkResponse({ type: EbcaRestQueryResponse })
  async postQuery(
    @Req() request: EbcaRestHttpRequest,
    @Param('name') name: string,
    @Body() body: EbcaRestQueryBody,
  ): Promise<EbcaRestQueryResponse> {
    return this.queries.executeQuery(await this.resolveIdentity(request), {
      name,
      params: body?.params ?? {},
    });
  }

  private async resolveIdentity(
    request: EbcaRestHttpRequest,
  ): Promise<EbcaRestAuthenticatedIdentity> {
    const resolved = this.authAdapter
      ? await this.authAdapter.resolveIdentity({ request })
      : {
          identityId: this.options.defaultIdentityId,
          roles: this.options.defaultRoles,
        };
    if (!resolved || resolved.identityId.trim().length === 0) {
      throw new UnauthorizedException('Valid REST identity is required.');
    }
    return {
      identityId: resolved.identityId,
      roles: resolved.roles ?? this.options.defaultRoles,
    };
  }

  private normalizeQueryParams(
    params: Record<string, string | readonly string[] | undefined>,
  ): EbcaRestJsonObject {
    return Object.fromEntries(
      Object.entries(params).flatMap(([key, value]) => {
        if (value === undefined) {
          return [];
        }
        if (Array.isArray(value)) {
          return [value.length === 1 ? [key, value[0]] : [key, value]];
        }
        return [[key, value]];
      }),
    );
  }
}
