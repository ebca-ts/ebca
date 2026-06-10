import 'reflect-metadata';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Logger } from '@nestjs/common';
import { EbcaEventType } from '@ebca/core/ebca.helpers';
import type {
  ComponentAdminJsonObject,
  ComponentAdminOperation,
  ComponentAdminRequest,
  ComponentAdminRuntimeFactory,
} from './admin-component-crud';
import {
  EbcaRuntimeGraphFormat,
  formatEbcaRuntimeGraph,
} from './runtime-graph';
import {
  buildEbcaRuntimeReport,
  formatEbcaRuntimeReport,
} from './runtime-report';
import type { EbcaRuntimeReportKind } from './runtime-report';
import {
  filterEbcaRuntimeLinks,
  formatEbcaRuntimeLinks,
  formatEbcaRuntimeRegistry,
  inspectEbcaRuntime,
} from './runtime-inspector';
import { compileEbcaRuntimeInspectionModule } from './testing-module';

type CliProcessDirection = 'forward' | 'reverse' | 'both';

interface CliOptions {
  command:
    | 'component'
    | 'contract'
    | 'graph'
    | 'links'
    | 'registry'
    | 'report'
    | 'help';
  componentName?: string;
  contractKind?: 'websocket';
  depth: number;
  domainName?: string;
  entityName?: string;
  entityId?: string;
  eventType?: EbcaEventType;
  graphFormat: EbcaRuntimeGraphFormat;
  json: boolean;
  metadataOnly: boolean;
  operation?: ComponentAdminOperation;
  payload?: ComponentAdminJsonObject;
  outputPath?: string;
  processDirection: CliProcessDirection;
  reportKind: EbcaRuntimeReportKind;
  runtimeModulePath?: string;
  systemName?: string;
  verbose: boolean;
  withIO: boolean;
}

async function main(): Promise<void> {
  configureCliLogger();
  const options = parseOptions(process.argv.slice(2));
  if (options.command === 'help') {
    printHelp();
    return;
  }

  if (options.command === 'component') {
    const runtimeModule = await loadRuntimeMetadata(options.runtimeModulePath, {
      loadProjectMetadata: false,
    });
    const admin = await import('./admin-component-crud.js');
    const result = await admin.runComponentAdminOperation(
      readComponentAdminRequest(options),
      {
        createTestingModule: resolveComponentAdminRuntimeFactory(runtimeModule),
      },
    );
    print(JSON.stringify(result, null, 2));
    return;
  }

  await loadRuntimeMetadata(options.runtimeModulePath, {
    loadProjectMetadata: true,
  });

  const snapshot = inspectEbcaRuntime();
  if (options.command === 'contract') {
    if (options.contractKind !== 'websocket') {
      throw new Error('Contract command requires one of: websocket.');
    }
    const generator = await import('./websocket-contract-generator.js');
    const result = generator.generateWebsocketContract(snapshot, {
      outputPath: options.outputPath,
    });
    if (options.json) {
      print(
        JSON.stringify(
          {
            outputPath: result.outputPath,
            stats: result.stats,
          },
          null,
          2,
        ),
      );
      return;
    }
    if (result.outputPath) {
      print(
        `Generated websocket contract: ${result.outputPath} (${result.stats.byteLength} bytes, ${result.stats.queryCount} queries).`,
      );
      return;
    }
    print(result.code);
    return;
  }

  if (!options.metadataOnly) {
    const moduleRef = await compileEbcaRuntimeInspectionModule();
    await moduleRef.close();
  }

  if (options.command === 'registry') {
    print(
      options.json
        ? JSON.stringify(snapshot, null, 2)
        : formatEbcaRuntimeRegistry(snapshot),
    );
    return;
  }

  if (options.command === 'report') {
    const reportOptions = {
      componentName: options.componentName,
      depth: options.depth,
      domainName: options.domainName,
      entityName: options.entityName,
      eventType: options.eventType,
      kind: options.reportKind,
      processDirection: options.processDirection,
      systemName: options.systemName,
      verbose: options.verbose,
    };
    const report = buildEbcaRuntimeReport(snapshot, reportOptions);
    print(
      options.json
        ? JSON.stringify(report, null, 2)
        : formatEbcaRuntimeReport(report, reportOptions),
    );
    return;
  }

  const links = filterEbcaRuntimeLinks(snapshot.links, {
    componentName: options.componentName,
    entityName: options.entityName,
    eventType: options.eventType,
    systemName: options.systemName,
  });
  if (options.command === 'graph') {
    print(
      formatEbcaRuntimeGraph(links, {
        format: options.graphFormat,
        includeIO: options.withIO,
      }),
    );
    return;
  }

  print(
    options.json
      ? JSON.stringify(links, null, 2)
      : formatEbcaRuntimeLinks(links, { includeIO: options.withIO }),
  );
}

function configureCliLogger(): void {
  if (process.env.EBCA_CLI_DEBUG === '1') {
    return;
  }
  Logger.overrideLogger(false);
}

function parseOptions(args: string[]): CliOptions {
  if (args.includes('--help') || args.includes('-h')) {
    return {
      command: 'help',
      depth: 3,
      graphFormat: 'mermaid',
      json: false,
      metadataOnly: false,
      processDirection: 'forward',
      reportKind: 'summary',
      verbose: false,
      withIO: false,
    };
  }
  const first = args[0] ?? 'links';
  const command = first.startsWith('--') ? 'links' : normalizeCommand(first);
  const hasComponentSubcommand =
    command === 'component' && args[1]?.startsWith('--') === false;
  const hasContractSubcommand =
    command === 'contract' && args[1]?.startsWith('--') === false;
  const hasReportSubcommand =
    command === 'report' && args[1]?.startsWith('--') === false;
  const operation = hasComponentSubcommand
    ? parseComponentAdminOperation(args[1])
    : undefined;
  let optionArgs = first.startsWith('--') ? args : args.slice(1);
  if (
    !first.startsWith('--') &&
    (hasComponentSubcommand || hasContractSubcommand || hasReportSubcommand)
  ) {
    optionArgs = args.slice(2);
  }
  const reportKind = hasReportSubcommand ? parseReportKind(args[1]) : 'summary';
  return {
    command,
    componentName: readOptionValue(optionArgs, '--component'),
    contractKind: hasContractSubcommand
      ? parseContractKind(args[1])
      : undefined,
    depth: parseDepth(readOptionValue(optionArgs, '--depth'), reportKind),
    domainName: readOptionValue(optionArgs, '--domain'),
    entityName: readOptionValue(optionArgs, '--entity'),
    entityId: readOptionValue(optionArgs, '--id'),
    eventType: parseEventType(readOptionValue(optionArgs, '--event')),
    graphFormat: parseGraphFormat(readOptionValue(optionArgs, '--format')),
    json: optionArgs.includes('--json'),
    metadataOnly: optionArgs.includes('--metadata-only'),
    operation,
    outputPath: readOptionValue(optionArgs, '--out'),
    payload: parseJsonPayload(readOptionValue(optionArgs, '--payload')),
    processDirection: parseProcessDirection(
      readOptionValue(optionArgs, '--direction'),
    ),
    reportKind,
    runtimeModulePath:
      readOptionValue(optionArgs, '--runtime-module') ??
      process.env.EBCA_RUNTIME_MODULE,
    systemName: readOptionValue(optionArgs, '--system'),
    verbose: optionArgs.includes('--verbose'),
    withIO: optionArgs.includes('--with-io'),
  };
}

async function loadRuntimeMetadata(
  runtimeModulePath: string | undefined,
  options: RuntimeMetadataLoadOptions,
): Promise<RuntimeMetadataModule> {
  if (!runtimeModulePath) {
    throw new Error(
      'EBCA runtime module is required. Pass --runtime-module <path> or set EBCA_RUNTIME_MODULE.',
    );
  }
  const runtimeModule = (await import(
    resolveRuntimeModuleSpecifier(runtimeModulePath)
  )) as RuntimeMetadataModule;
  if (options.loadProjectMetadata && runtimeModule.loadProjectRuntimeMetadata) {
    await runtimeModule.loadProjectRuntimeMetadata({
      introspectionOnly: true,
    });
  }
  return runtimeModule;
}

interface RuntimeMetadataLoadOptions {
  loadProjectMetadata: boolean;
}

interface ProjectRuntimeMetadataOptions {
  introspectionOnly: boolean;
}

interface RuntimeMetadataModule {
  createEbcaComponentAdminTestingModule?: ComponentAdminRuntimeFactory;
  loadProjectRuntimeMetadata?: (
    options: ProjectRuntimeMetadataOptions,
  ) => Promise<void> | void;
}

function resolveComponentAdminRuntimeFactory(
  runtimeModule: RuntimeMetadataModule,
): ComponentAdminRuntimeFactory {
  if (!runtimeModule.createEbcaComponentAdminTestingModule) {
    throw new Error(
      'Component admin command requires runtime module export createEbcaComponentAdminTestingModule().',
    );
  }
  return runtimeModule.createEbcaComponentAdminTestingModule;
}

function resolveRuntimeModuleSpecifier(runtimeModulePath: string): string {
  if (runtimeModulePath.startsWith('.') || runtimeModulePath.startsWith('/')) {
    return pathToFileURL(resolve(process.cwd(), runtimeModulePath)).href;
  }
  return runtimeModulePath;
}

function normalizeCommand(value: string): CliOptions['command'] {
  if (
    value === 'component' ||
    value === 'contract' ||
    value === 'graph' ||
    value === 'links' ||
    value === 'registry' ||
    value === 'report' ||
    value === 'help' ||
    value === '--help' ||
    value === '-h'
  ) {
    return value === '--help' || value === '-h' ? 'help' : value;
  }
  return 'help';
}

function parseReportKind(value: string | undefined): EbcaRuntimeReportKind {
  if (
    value === 'boundary-risks' ||
    value === 'boundary-diagnostics' ||
    value === 'command-flows' ||
    value === 'command-contracts' ||
    value === 'commands' ||
    value === 'cycles' ||
    value === 'domains' ||
    value === 'empty-io' ||
    value === 'fanout' ||
    value === 'io-coverage' ||
    value === 'multi-writers' ||
    value === 'owners' ||
    value === 'process' ||
    value === 'risks' ||
    value === 'summary' ||
    value === 'tests'
  ) {
    return value;
  }
  throw new Error(
    'Report command requires one of: summary, domains, fanout, commands, command-flows, command-contracts, owners, risks, boundary-risks, boundary-diagnostics, multi-writers, tests, empty-io, io-coverage, process, cycles.',
  );
}

function parseContractKind(value: string | undefined): 'websocket' | undefined {
  if (value === 'websocket') {
    return value;
  }
  return undefined;
}

function parseDepth(
  value: string | undefined,
  reportKind: EbcaRuntimeReportKind,
): number {
  if (!value) {
    return reportKind === 'cycles' ? 8 : 3;
  }
  const depth = Number.parseInt(value, 10);
  if (!Number.isInteger(depth) || depth < 0) {
    throw new Error('--depth must be a non-negative integer.');
  }
  return depth;
}

function parseProcessDirection(value: string | undefined): CliProcessDirection {
  if (!value || value === 'forward') {
    return 'forward';
  }
  if (value === 'reverse' || value === 'both') {
    return value;
  }
  throw new Error('--direction must be one of: forward, reverse, both.');
}

function parseGraphFormat(value: string | undefined): EbcaRuntimeGraphFormat {
  if (value === 'dot') {
    return 'dot';
  }
  return 'mermaid';
}

function parseComponentAdminOperation(
  value: string | undefined,
): ComponentAdminOperation | undefined {
  if (
    value === 'add' ||
    value === 'get' ||
    value === 'remove' ||
    value === 'update' ||
    value === 'upsert'
  ) {
    return value;
  }
  return undefined;
}

function readOptionValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) {
    return undefined;
  }
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    return undefined;
  }
  return value;
}

function parseEventType(value: string | undefined): EbcaEventType | undefined {
  if (!value) {
    return undefined;
  }
  const addedEventType = String(EbcaEventType.COMPONENT_ADDED);
  const updatedEventType = String(EbcaEventType.COMPONENT_UPDATED);
  const removedEventType = String(EbcaEventType.COMPONENT_REMOVED);
  if (value === addedEventType || value === 'added') {
    return EbcaEventType.COMPONENT_ADDED;
  }
  if (value === updatedEventType || value === 'updated') {
    return EbcaEventType.COMPONENT_UPDATED;
  }
  if (value === removedEventType || value === 'removed') {
    return EbcaEventType.COMPONENT_REMOVED;
  }
  return undefined;
}

function parseJsonPayload(
  value: string | undefined,
): ComponentAdminJsonObject | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = JSON.parse(value) as ComponentAdminJsonObject;
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error('--payload must be a JSON object.');
  }
  return parsed;
}

function readComponentAdminRequest(options: CliOptions): ComponentAdminRequest {
  if (!options.operation) {
    throw new Error(
      'Component admin command requires one of: get, add, update, upsert, remove.',
    );
  }
  if (!options.entityName) {
    throw new Error('Component admin command requires --entity.');
  }
  if (!options.entityId) {
    throw new Error('Component admin command requires --id.');
  }
  if (!options.componentName) {
    throw new Error('Component admin command requires --component.');
  }
  if (
    options.operation !== 'get' &&
    options.operation !== 'remove' &&
    !options.payload
  ) {
    throw new Error(
      'Component add/update/upsert requires --payload JSON object.',
    );
  }
  return {
    componentName: options.componentName,
    entityId: options.entityId,
    entityName: options.entityName,
    operation: options.operation,
    payload: options.payload,
  };
}

function printHelp(): void {
  print(
    [
      'EBCA runtime tools',
      '',
      'Usage:',
      '  bun run ebca -- --help',
      '  bun run ebca -- registry [--json] [--metadata-only]',
      '  bun run ebca -- links [--component Name] [--entity Name] [--system Name] [--event added|updated|removed] [--json] [--metadata-only]',
      '  bun run ebca -- graph [--format mermaid|dot] [--with-io] [--component Name] [--entity Name] [--system Name] [--event added|updated|removed] [--metadata-only]',
      '  bun run ebca -- report [summary|domains|fanout|commands|command-flows|command-contracts|owners|risks|boundary-risks|boundary-diagnostics|multi-writers|tests|empty-io|io-coverage|process|cycles] [--component Name] [--entity Name] [--system Name] [--domain Name] [--depth N] [--direction forward|reverse|both] [--verbose] [--json] [--metadata-only]',
      '  bun run ebca -- contract websocket [--out path] [--json]',
      '  bun run ebca -- component get --entity EntityName --id entity-id --component ComponentName',
      '  bun run ebca -- component add --entity EntityName --id entity-id --component ComponentName --payload \'{"field":"value"}\'',
      '  bun run ebca -- component update --entity EntityName --id entity-id --component ComponentName --payload \'{"field":"value"}\'',
      '  bun run ebca -- component upsert --entity EntityName --id entity-id --component ComponentName --payload \'{"field":"value"}\'',
      '  bun run ebca -- component remove --entity EntityName --id entity-id --component ComponentName',
      '',
      'Commands:',
      '  registry   Print registered EBCA entities, components, systems and links.',
      '  links      Print entity + lifecycle + component -> system.handler links.',
      '  graph      Print EBCA runtime links as Mermaid or DOT graph.',
      '  report     Print architecture-oriented EBCA reports for source-file domains, fan-out, command chains, IO coverage, boundary risks and process depth.',
      '  contract   Generate transport contracts from EBCA runtime metadata and explicit @EbcaType/@EbcaEnum declarations.',
      '  component  Manual component CRUD through real ComponentManager.',
      '',
      'Options:',
      '  --json           Print machine-readable JSON where supported.',
      '  --verbose        Print full report entries where compact text is the default.',
      '  --metadata-only  Skip lightweight Nest testing module compile for registry/links/graph.',
      '  --with-io        Include declared @EbcaIO reads/writes/emits/removes.',
      '  --format         Graph format for graph command: mermaid or dot.',
      '  --domain         Filter report links by substring across system/entity/component/IO names; this is not an ownership policy.',
      '  --depth          Process report recursion depth, default 3.',
      '  --direction      Process report direction: forward, reverse or both.',
      '  --component      Filter or select component class name.',
      '  --entity         Filter or select entity class name.',
      '  --id             Entity id for component admin commands.',
      '  --system         Filter system name for links.',
      '  --event          Filter links by added, updated or removed.',
      '  --payload        JSON object payload for component add/update/upsert.',
      '  --out            Output file for contract generation; stdout is used when omitted.',
      '  --runtime-module Runtime metadata module path imported before reading EBCA registry.',
      '',
      'Notes:',
      '  registry/links use runtime decorator metadata; system/entity domains are inferred from source files.',
      '  EBCA_RUNTIME_MODULE can provide the runtime metadata module for package scripts.',
      '  @EbcaIO entries may be ComponentClass or [EntityClass, ComponentClass] for explicit target entity.',
      '  @EbcaIO Component targets mean trigger entity; tuple [EntityClass, ComponentClass] targets explicit cross-entity IO.',
      '  Due components are treated as delayed command/input intents by report commands.',
      '  contract websocket emits only runtime EBCA names plus declarations exposed through @EbcaType/@EbcaEnum.',
      '  component commands require runtime env for CockroachDB, Redis and NATS and are intended to run inside Docker.',
      '  set EBCA_CLI_DEBUG=1 to print Nest decorator registration logs.',
    ].join('\n'),
  );
}

function print(value: string): void {
  process.stdout.write(`${value}\n`);
}

main().catch((error: Error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
