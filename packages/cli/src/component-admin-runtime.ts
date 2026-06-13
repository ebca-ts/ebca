import { resolve, sep } from 'node:path';
import { Type } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ComponentManager } from '@ebca/core/component.manager';
import type { ComponentAdminRuntimeFactory } from './admin-component-crud';

export type RuntimeModuleCollection =
  | readonly Type<object>[]
  | (() => readonly Type<object>[]);

type RuntimeMetadataLoader = (
  options: ProjectRuntimeMetadataOptions,
) =>
  | Promise<ProjectRuntimeMetadataResult | void>
  | ProjectRuntimeMetadataResult
  | void;

type RuntimeModuleExportValue =
  | ComponentAdminRuntimeFactory
  | RuntimeMetadataLoader
  | RuntimeModuleCollection
  | Type<object>
  | object
  | string
  | number
  | boolean
  | symbol
  | null
  | undefined;

export interface ProjectRuntimeMetadataOptions {
  introspectionOnly: boolean;
}

export interface ProjectRuntimeMetadataResult {
  readonly rootModules?: RuntimeModuleCollection;
  readonly startModules?: RuntimeModuleCollection;
  readonly modules?: RuntimeModuleCollection;
}

export interface RuntimeMetadataModule {
  createEbcaComponentAdminTestingModule?: ComponentAdminRuntimeFactory;
  loadProjectRuntimeMetadata?: RuntimeMetadataLoader;
  readonly ebcaRuntimeModules?: RuntimeModuleCollection;
  readonly rootModules?: RuntimeModuleCollection;
  readonly startModules?: RuntimeModuleCollection;
  readonly [key: string]: RuntimeModuleExportValue;
}

interface ComponentAdminModuleCandidate {
  readonly moduleClass: Type<object>;
  readonly source: string;
}

export function resolveComponentAdminRuntimeFactory(
  runtimeModule: RuntimeMetadataModule,
  projectMetadata: ProjectRuntimeMetadataResult | void,
): ComponentAdminRuntimeFactory {
  if (runtimeModule.createEbcaComponentAdminTestingModule) {
    return runtimeModule.createEbcaComponentAdminTestingModule;
  }

  return () =>
    compileAutoDetectedComponentAdminModule(runtimeModule, projectMetadata);
}

async function compileAutoDetectedComponentAdminModule(
  runtimeModule: RuntimeMetadataModule,
  projectMetadata: ProjectRuntimeMetadataResult | void,
): Promise<TestingModule> {
  const candidates = resolveComponentAdminModuleCandidates(
    runtimeModule,
    projectMetadata,
  );
  const failures: string[] = [];

  for (const candidate of candidates) {
    try {
      const moduleRef = await Test.createTestingModule({
        imports: [candidate.moduleClass],
      }).compile();
      if (hasComponentManager(moduleRef)) {
        return moduleRef;
      }
      await moduleRef.close();
      failures.push(`${formatCandidate(candidate)}: ComponentManager not found`);
    } catch (error) {
      failures.push(`${formatCandidate(candidate)}: ${formatError(error)}`);
    }
  }

  throw new Error(formatComponentAdminRuntimeError(candidates, failures));
}

function resolveComponentAdminModuleCandidates(
  runtimeModule: RuntimeMetadataModule,
  projectMetadata: ProjectRuntimeMetadataResult | void,
): ComponentAdminModuleCandidate[] {
  const seen = new Set<Type<object>>();
  const candidates: ComponentAdminModuleCandidate[] = [];

  appendCandidatesFromModuleCollection(
    candidates,
    seen,
    projectMetadata?.rootModules,
    'loadProjectRuntimeMetadata().rootModules',
  );
  appendCandidatesFromModuleCollection(
    candidates,
    seen,
    projectMetadata?.startModules,
    'loadProjectRuntimeMetadata().startModules',
  );
  appendCandidatesFromModuleCollection(
    candidates,
    seen,
    projectMetadata?.modules,
    'loadProjectRuntimeMetadata().modules',
  );
  appendCandidatesFromModuleCollection(
    candidates,
    seen,
    runtimeModule.ebcaRuntimeModules,
    'runtime module ebcaRuntimeModules',
  );
  appendCandidatesFromModuleCollection(
    candidates,
    seen,
    runtimeModule.rootModules,
    'runtime module rootModules',
  );
  appendCandidatesFromModuleCollection(
    candidates,
    seen,
    runtimeModule.startModules,
    'runtime module startModules',
  );
  appendCandidatesFromExports(candidates, seen, runtimeModule, 'runtime module');
  appendCandidatesFromLoadedProjectModules(candidates, seen);

  return candidates;
}

function appendCandidatesFromModuleCollection(
  candidates: ComponentAdminModuleCandidate[],
  seen: Set<Type<object>>,
  moduleCollection: RuntimeModuleCollection | undefined,
  source: string,
): void {
  if (!moduleCollection) {
    return;
  }

  const moduleClasses =
    typeof moduleCollection === 'function'
      ? moduleCollection()
      : moduleCollection;
  for (const moduleClass of moduleClasses) {
    if (!isNestModuleClass(moduleClass) || seen.has(moduleClass)) {
      continue;
    }
    seen.add(moduleClass);
    candidates.push({ moduleClass, source });
  }
}

function appendCandidatesFromLoadedProjectModules(
  candidates: ComponentAdminModuleCandidate[],
  seen: Set<Type<object>>,
): void {
  for (const cachedModule of Object.values(require.cache)) {
    if (!cachedModule || !isProjectModulePath(cachedModule.filename)) {
      continue;
    }
    appendCandidatesFromExports(
      candidates,
      seen,
      cachedModule.exports as RuntimeMetadataModule,
      cachedModule.filename,
    );
  }
}

function appendCandidatesFromExports(
  candidates: ComponentAdminModuleCandidate[],
  seen: Set<Type<object>>,
  exportsObject: RuntimeMetadataModule,
  source: string,
): void {
  for (const value of Object.values(exportsObject)) {
    if (!isNestModuleClass(value) || seen.has(value)) {
      continue;
    }
    seen.add(value);
    candidates.push({ moduleClass: value, source });
  }
}

function isProjectModulePath(filename: string): boolean {
  const cwd = resolve(process.cwd());
  const normalized = resolve(filename);
  return (
    (normalized === cwd || normalized.startsWith(`${cwd}${sep}`)) &&
    !normalized.includes(`${sep}node_modules${sep}`)
  );
}

function isNestModuleClass(value: RuntimeModuleExportValue): value is Type<object> {
  return (
    typeof value === 'function' &&
    (Reflect.hasMetadata('imports', value) ||
      Reflect.hasMetadata('providers', value) ||
      Reflect.hasMetadata('controllers', value) ||
      Reflect.hasMetadata('exports', value))
  );
}

function hasComponentManager(moduleRef: TestingModule): boolean {
  try {
    moduleRef.get(ComponentManager, { strict: false });
    return true;
  } catch {
    return false;
  }
}

function formatComponentAdminRuntimeError(
  candidates: readonly ComponentAdminModuleCandidate[],
  failures: readonly string[],
): string {
  const lines = [
    'Component admin command could not auto-detect a Nest module with ComponentManager.',
    'Return { rootModules: [AppModule] } from loadProjectRuntimeMetadata(), export ebcaRuntimeModules/rootModules, or export createEbcaComponentAdminTestingModule() for custom overrides.',
  ];

  if (candidates.length === 0) {
    lines.push(
      'No Nest module candidates were found in runtime metadata, runtime exports, or loaded project modules.',
    );
    return lines.join('\n');
  }

  lines.push('Tried module candidates:');
  lines.push(...failures.map((failure) => `- ${failure}`));
  return lines.join('\n');
}

function formatCandidate(candidate: ComponentAdminModuleCandidate): string {
  return `${candidate.moduleClass.name} from ${candidate.source}`;
}

function formatError(error: object): string {
  return error instanceof Error ? error.message : String(error);
}
