import {
  EbcaEventType,
  getComponentName,
  getEntityName,
} from '@ebca/core/ebca.helpers';
import { BaseComponent } from '@ebca/core/bases/base.component';
import { BaseCommandComponent } from '@ebca/core/bases/base-command.component';
import { BaseEntity } from '@ebca/core/bases/base.entity';
import {
  getComponentOptions,
  getComponentSourceFile,
  getRegisteredComponents,
} from '@ebca/core/decorators/component.decorator';
import {
  getEntitySourceFile,
  getRegisteredEntities,
} from '@ebca/core/decorators/entity.decorator';
import {
  getEbcaIOForHandler,
  type EbcaIOTarget as EbcaCoreIOTarget,
} from '@ebca/core/decorators/ebca-io.decorator';
import { getEbcaPatternSubscriptions } from '@ebca/core/decorators/ebca-pattern.decorator';
import {
  getRegisteredSystems,
  getSystemName,
  getSystemSourceFile,
} from '@ebca/core/decorators/system.decorator';
import type { ComponentConstructor } from '@ebca/core/types/componens';
import type { EntityConstructor } from '@ebca/core/types/entities';

export interface EbcaRuntimeSystemDescriptor {
  className: string;
  domainName: string;
  name: string;
  sourceFile: string | null;
}

export interface EbcaRuntimeEntityDescriptor {
  className: string;
  domainName: string;
  name: string;
  sourceFile: string | null;
}

export interface EbcaRuntimeComponentDescriptor {
  className: string;
  domainName: string;
  name: string;
  isPersistent: boolean;
  isCommand: boolean;
  inbound: boolean;
  websocket: boolean;
  delayedBy: string | null;
  sourceFile: string | null;
}

export interface EbcaRuntimeLink {
  systemClassName: string;
  systemDomainName: string;
  systemName: string;
  handlerName: string;
  topic: string;
  entityDomainName: string;
  entityName: string;
  entityId: string;
  eventType: EbcaEventType;
  componentName: string;
  io: EbcaRuntimeHandlerIO;
}

export interface EbcaRuntimeIOTarget {
  componentName: string;
  entityDomainName: string;
  entityName: string;
  explicitEntity: boolean;
}

export interface EbcaRuntimeHandlerIO {
  reads: EbcaRuntimeIOTarget[];
  writes: EbcaRuntimeIOTarget[];
  emits: EbcaRuntimeIOTarget[];
  removes: EbcaRuntimeIOTarget[];
}

export interface EbcaRuntimeSnapshot {
  entities: EbcaRuntimeEntityDescriptor[];
  components: EbcaRuntimeComponentDescriptor[];
  systems: EbcaRuntimeSystemDescriptor[];
  links: EbcaRuntimeLink[];
}

export interface EbcaRuntimeLinkFilter {
  componentName?: string;
  entityName?: string;
  eventType?: EbcaEventType;
  systemName?: string;
}

export function inspectEbcaRuntime(): EbcaRuntimeSnapshot {
  const entities = getRegisteredEntities()
    .map((entityClass) => {
      const sourceFile = getEntitySourceFile(entityClass);
      return {
        className: entityClass.name,
        domainName: inferRuntimeDomainName(sourceFile, entityClass.name),
        name: getEntityName(entityClass),
        sourceFile,
      } satisfies EbcaRuntimeEntityDescriptor;
    })
    .sort((left, right) => compareText(left.name, right.name));

  const components = getRegisteredComponents()
    .map((componentClass) => {
      const options = getComponentOptions(componentClass);
      const sourceFile = getComponentSourceFile(componentClass);
      return {
        className: componentClass.name,
        domainName: inferRuntimeDomainName(sourceFile, componentClass.name),
        name: getComponentName(componentClass),
        isPersistent: options?.isPersistent === true,
        isCommand: componentClass.prototype instanceof BaseCommandComponent,
        inbound: options?.inbound?.expose === true,
        websocket: options?.websocket?.expose === true,
        delayedBy: options?.delayedBy ?? null,
        sourceFile,
      } satisfies EbcaRuntimeComponentDescriptor;
    })
    .sort((left, right) => compareText(left.name, right.name));

  const systems = getRegisteredSystems()
    .map((systemClass) => {
      const sourceFile = getSystemSourceFile(systemClass);
      return {
        className: systemClass.name,
        domainName: inferRuntimeDomainName(sourceFile, systemClass.name),
        name: getSystemName(systemClass),
        sourceFile,
      } satisfies EbcaRuntimeSystemDescriptor;
    })
    .sort((left, right) => compareText(left.name, right.name));
  const systemByClassName = new Map(
    systems.map((system) => [system.className, system]),
  );

  const links = getEbcaPatternSubscriptions()
    .map((subscription) => {
      const io = getEbcaIOForHandler(
        subscription.systemClass,
        subscription.methodName,
      );
      const system = systemByClassName.get(subscription.systemClass.name);
      const triggerEntityClass = subscription.params.entityClass;
      const triggerEntitySourceFile = triggerEntityClass
        ? getEntitySourceFile(triggerEntityClass)
        : null;
      const triggerEntity = {
        className: triggerEntityClass?.name ?? '*',
        domainName: triggerEntityClass
          ? inferRuntimeDomainName(
              triggerEntitySourceFile,
              triggerEntityClass.name,
            )
          : 'wildcard',
        name: getEntityName(triggerEntityClass),
        sourceFile: triggerEntitySourceFile,
      } satisfies EbcaRuntimeEntityDescriptor;
      return {
        systemClassName: subscription.systemClass.name,
        systemDomainName:
          system?.domainName ??
          inferRuntimeDomainName(
            getSystemSourceFile(subscription.systemClass),
            subscription.systemClass.name,
          ),
        systemName: getSystemName(subscription.systemClass),
        handlerName: subscription.methodName,
        topic: subscription.topic,
        entityDomainName: triggerEntity.domainName,
        entityName: triggerEntity.name,
        entityId: subscription.params.entityId ?? '*',
        eventType: subscription.params.eventType,
        componentName: getComponentName(subscription.params.componentClass),
        io: {
          reads: io.reads.map((target) =>
            normalizeIOTarget(target, triggerEntity),
          ),
          writes: io.writes.map((target) =>
            normalizeIOTarget(target, triggerEntity),
          ),
          emits: io.emits.map((target) =>
            normalizeIOTarget(target, triggerEntity),
          ),
          removes: io.removes.map((target) =>
            normalizeIOTarget(target, triggerEntity),
          ),
        },
      } satisfies EbcaRuntimeLink;
    })
    .sort(compareLinks);

  return {
    entities,
    components,
    systems,
    links,
  };
}

export function filterEbcaRuntimeLinks(
  links: EbcaRuntimeLink[],
  filter: EbcaRuntimeLinkFilter,
): EbcaRuntimeLink[] {
  return links.filter(
    (link) =>
      matchesFilter(link.componentName, filter.componentName) &&
      matchesFilter(link.entityName, filter.entityName) &&
      matchesFilter(link.systemName, filter.systemName) &&
      (!filter.eventType || link.eventType === filter.eventType),
  );
}

export function formatEbcaRuntimeLinks(
  links: EbcaRuntimeLink[],
  options?: { includeIO?: boolean },
): string {
  if (links.length === 0) {
    return 'No EBCA runtime links matched filters.';
  }

  return links
    .map((link) => formatEbcaRuntimeLink(link, options?.includeIO === true))
    .join('\n');
}

export function formatEbcaRuntimeRegistry(
  snapshot: EbcaRuntimeSnapshot,
): string {
  return [
    `Entities: ${snapshot.entities.length}`,
    `Components: ${snapshot.components.length}`,
    `Systems: ${snapshot.systems.length}`,
    `Links: ${snapshot.links.length}`,
    '',
    'Entities:',
    ...snapshot.entities.map(
      (entity) =>
        `- ${entity.name} (${entity.className}, domain=${entity.domainName})`,
    ),
    '',
    'Systems:',
    ...snapshot.systems.map(
      (system) =>
        `- ${system.name} (${system.className}, domain=${system.domainName})`,
    ),
  ].join('\n');
}

export function inferRuntimeDomainName(
  sourceFile: string | null,
  className: string,
): string {
  if (className === '*') {
    return 'wildcard';
  }
  if (sourceFile) {
    const normalizedPath = sourceFile.replace(/\\/g, '/');
    const segments = normalizedPath
      .split('/')
      .filter((segment) => segment.length > 0);
    const appsIndex = segments.lastIndexOf('apps');
    const appName = appsIndex >= 0 ? segments[appsIndex + 1] : undefined;
    if (appName && appName !== 'common') {
      return appName;
    }
    const fileName = segments[segments.length - 1];
    if (fileName) {
      return normalizeDomainName(
        fileName
          .replace(/\.(entity|system|component|components|service)\.[^.]+$/, '')
          .replace(/\.[^.]+$/, ''),
      );
    }
  }
  return normalizeDomainName(
    className.replace(/(Entity|System|Component)$/, ''),
  );
}

function matchesFilter(value: string, filter: string | undefined): boolean {
  if (!filter) {
    return true;
  }
  return value.toLowerCase().includes(filter.toLowerCase());
}

function formatEbcaRuntimeLink(
  link: EbcaRuntimeLink,
  includeIO: boolean,
): string {
  const line = `${link.entityName}.${link.entityId} ${link.eventType} ${link.componentName} -> ${link.systemName}.${link.handlerName} (${link.topic})`;
  if (!includeIO || !hasDeclaredIO(link.io)) {
    return line;
  }
  return [
    line,
    ...formatIOGroup('reads', link.io.reads),
    ...formatIOGroup('writes', link.io.writes),
    ...formatIOGroup('emits', link.io.emits),
    ...formatIOGroup('removes', link.io.removes),
  ].join('\n');
}

function hasDeclaredIO(io: EbcaRuntimeHandlerIO): boolean {
  return (
    io.reads.length > 0 ||
    io.writes.length > 0 ||
    io.emits.length > 0 ||
    io.removes.length > 0
  );
}

function formatIOGroup(kind: string, targets: EbcaRuntimeIOTarget[]): string[] {
  if (targets.length === 0) {
    return [];
  }
  return [`  ${kind}: ${targets.map(formatIOTarget).join(', ')}`];
}

function normalizeIOTarget(
  target: EbcaCoreIOTarget,
  triggerEntity: EbcaRuntimeEntityDescriptor,
): EbcaRuntimeIOTarget {
  if (isExplicitIOTarget(target)) {
    const [entityClass, componentClass] = target;
    const sourceFile = getEntitySourceFile(entityClass);
    return {
      componentName: getComponentName(componentClass),
      entityDomainName: inferRuntimeDomainName(sourceFile, entityClass.name),
      entityName: getEntityName(entityClass),
      explicitEntity: true,
    };
  }
  return {
    componentName: getComponentName(target),
    entityDomainName: triggerEntity.domainName,
    entityName: triggerEntity.name,
    explicitEntity: false,
  };
}

function isExplicitIOTarget(
  target: EbcaCoreIOTarget,
): target is readonly [
  EntityConstructor<BaseEntity>,
  ComponentConstructor<BaseComponent>,
] {
  return Array.isArray(target);
}

function formatIOTarget(target: EbcaRuntimeIOTarget): string {
  if (!target.explicitEntity) {
    return target.componentName;
  }
  return `${target.entityName}.${target.componentName}`;
}

function normalizeDomainName(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/_/g, '-')
    .toLowerCase();
}

function compareLinks(left: EbcaRuntimeLink, right: EbcaRuntimeLink): number {
  return (
    compareText(left.componentName, right.componentName) ||
    compareText(left.entityName, right.entityName) ||
    compareText(left.eventType, right.eventType) ||
    compareText(left.systemName, right.systemName) ||
    compareText(left.handlerName, right.handlerName)
  );
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right);
}
