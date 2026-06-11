import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export interface EbcaRestSwaggerOptions {
  readonly path?: string;
  readonly title?: string;
  readonly description?: string;
  readonly version?: string;
}

export function setupEbcaRestSwagger(
  app: INestApplication,
  options: EbcaRestSwaggerOptions = {},
): void {
  const documentConfig = new DocumentBuilder()
    .setTitle(options.title ?? 'EBCA REST API')
    .setDescription(
      options.description ??
        'Generic REST endpoints for EBCA inbound components and read queries.',
    )
    .setVersion(options.version ?? '0.0.1')
    .build();
  const document = SwaggerModule.createDocument(app, documentConfig);
  SwaggerModule.setup(options.path ?? 'docs', app, document);
}
