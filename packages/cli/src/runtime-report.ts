import type { EbcaEventType } from '@ebca/core/ebca.helpers';
import { filterEbcaRuntimeLinks } from './runtime-inspector';
import type {
  EbcaRuntimeHandlerIO,
  EbcaRuntimeIOTarget,
  EbcaRuntimeLink,
  EbcaRuntimeSnapshot,
} from './runtime-inspector';

export type EbcaRuntimeReportKind =
  | 'boundary-diagnostics'
  | 'boundary-risks'
  | 'command-flows'
  | 'command-contracts'
  | 'commands'
  | 'cycles'
  | 'domains'
  | 'empty-io'
  | 'fanout'
  | 'io-coverage'
  | 'multi-writers'
  | 'owners'
  | 'process'
  | 'risks'
  | 'summary'
  | 'tests';

export type EbcaRuntimeProcessDirection = 'both' | 'forward' | 'reverse';
export type EbcaRuntimeProcessEdgeDirection = 'forward' | 'reverse';

export interface EbcaRuntimeReportOptions {
  componentName?: string;
  depth: number;
  domainName?: string;
  entityName?: string;
  eventType?: EbcaEventType;
  kind: EbcaRuntimeReportKind;
  processDirection?: EbcaRuntimeProcessDirection;
  systemName?: string;
  verbose?: boolean;
}

const FACT_FANOUT_TEST_THRESHOLD = 2;

export interface EbcaRuntimeReport {
  boundaryDiagnostics: EbcaRuntimeRisk[];
  boundaryRisks: EbcaRuntimeRisk[];
  commandContracts: EbcaRuntimeCommandContract[];
  commandFlows: EbcaRuntimeCommandFlow[];
  cycles: EbcaRuntimeCycle[];
  domains: EbcaRuntimeDomainReport;
  emptyIO: EbcaRuntimeLink[];
  fanOut: EbcaRuntimeFanOutEntry[];
  ioCoverage: EbcaRuntimeIOCoverageReport;
  kind: EbcaRuntimeReportKind;
  ownership: EbcaRuntimeOwnershipReport;
  process: EbcaRuntimeProcessNode[];
  risks: EbcaRuntimeRisk[];
  summary: EbcaRuntimeReportSummary;
  testCandidates: EbcaRuntimeTestCandidate[];
}

export interface EbcaRuntimeReportSummary {
  commandWriteCount: number;
  commandContractCount: number;
  componentCount: number;
  cycleCount: number;
  emptyIOCount: number;
  entityCount: number;
  fanOutCount: number;
  filteredLinkCount: number;
  ioTotals: EbcaRuntimeIOTotals;
  linkCount: number;
  riskCount: number;
  systemCount: number;
  testCandidateCount: number;
  topSystems: EbcaRuntimeCountEntry[];
  topTriggerComponents: EbcaRuntimeCountEntry[];
}

export interface EbcaRuntimeIOTotals {
  emits: number;
  reads: number;
  removes: number;
  writes: number;
}

export interface EbcaRuntimeCountEntry {
  count: number;
  name: string;
}

export interface EbcaRuntimeFanOutEntry {
  handlers: EbcaRuntimeLink[];
  trigger: EbcaRuntimeTriggerDescriptor;
}

export interface EbcaRuntimeTriggerDescriptor {
  componentName: string;
  entityId: string;
  entityName: string;
  eventType: EbcaEventType;
}

export interface EbcaRuntimeCommandFlow {
  commandName: string;
  producer: EbcaRuntimeLink;
  targets: EbcaRuntimeLink[];
}

export interface EbcaRuntimeCommandContract {
  commandName: string;
  delayedBy: string | null;
  downstreamComponents: string[];
  failureContractNote: string;
  inbound: boolean;
  producers: EbcaRuntimeCommandFlow[];
  terminalRemovers: EbcaRuntimeLink[];
  terminalWriters: EbcaRuntimeLink[];
  triggerHandlers: EbcaRuntimeLink[];
  websocket: boolean;
}

export interface EbcaRuntimeProcessNode {
  commandWrites: EbcaRuntimeProcessCommandWrite[];
  cycle: boolean;
  depth: number;
  link: EbcaRuntimeLink;
}

export interface EbcaRuntimeProcessCommandWrite {
  commandName: string;
  direction: EbcaRuntimeProcessEdgeDirection;
  targets: EbcaRuntimeProcessNode[];
}

export interface EbcaRuntimeCycle {
  edges: EbcaRuntimeCycleEdge[];
  hasDelayedEdge: boolean;
  hasStatusUpdateEdge: boolean;
}

export interface EbcaRuntimeCycleEdge {
  commandName: string;
  from: EbcaRuntimeLink;
  to: EbcaRuntimeLink;
}

export type EbcaRuntimeRiskSeverity = 'high' | 'medium' | 'low';

export interface EbcaRuntimeRisk {
  details: string[];
  links: EbcaRuntimeLink[];
  severity: EbcaRuntimeRiskSeverity;
  title: string;
}

export interface EbcaRuntimeOwnershipReport {
  commandProducers: EbcaRuntimeCommandFlow[];
  componentName: string | null;
  emitters: EbcaRuntimeLink[];
  readers: EbcaRuntimeLink[];
  removers: EbcaRuntimeLink[];
  triggerHandlers: EbcaRuntimeLink[];
  writers: EbcaRuntimeLink[];
}

export interface EbcaRuntimeTestCandidate {
  links: EbcaRuntimeLink[];
  priority: EbcaRuntimeRiskSeverity;
  reason: string;
  title: string;
}

export type EbcaRuntimeDomainKind = 'unknown';

export interface EbcaRuntimeDomainReport {
  entries: EbcaRuntimeDomainEntry[];
}

export interface EbcaRuntimeDomainEntry {
  domainName: string;
  handlerCount: number;
  ioTotals: EbcaRuntimeIOTotals;
  kind: EbcaRuntimeDomainKind;
  links: EbcaRuntimeLink[];
  systemNames: string[];
  triggerComponentNames: string[];
}

export interface EbcaRuntimeIOCoverageReport {
  empty: EbcaRuntimeLink[];
  missingTriggerRead: EbcaRuntimeLink[];
  outputlessCommandHandlers: EbcaRuntimeLink[];
  triggerOnly: EbcaRuntimeLink[];
  totalHandlers: number;
}

interface BoundaryOutput extends EbcaRuntimeIOTarget {
  kind: 'emit' | 'remove' | 'write';
}

interface EntityComponentWriterGroup {
  componentName: string;
  entityDomainName: string;
  entityName: string;
  links: EbcaRuntimeLink[];
  writerDomains: string[];
}

export function buildEbcaRuntimeReport(
  snapshot: EbcaRuntimeSnapshot,
  options: EbcaRuntimeReportOptions,
): EbcaRuntimeReport {
  const links = filterReportLinks(snapshot.links, options);
  const componentByName = new Map(
    snapshot.components.map((component) => [component.name, component]),
  );
  const commandFlows = buildCommandFlows(snapshot.links, links, options, componentByName);
  const commandContracts = buildCommandContracts(snapshot, options, componentByName);
  const cycles = buildCycles(snapshot.links, links, options, componentByName);
  const domains = buildDomainReport(links);
  const emptyIO = links.filter((link) => !hasDeclaredIO(link.io));
  const fanOut = buildFanOut(links);
  const ioCoverage = buildIOCoverage(links, componentByName);
  const boundaryLinks = filterBoundaryReportLinks(snapshot.links, options);
  const boundaryRisks = filterBoundaryReportRisks(
    buildBoundaryRisks(boundaryLinks, componentByName),
    options,
  );
  const boundaryDiagnostics = filterBoundaryReportRisks(
    buildBoundaryDiagnostics(boundaryLinks, componentByName),
    options,
  );
  const risks = buildRisks(
    fanOut,
    commandFlows,
    emptyIO,
    boundaryRisks,
    componentByName,
  );
  const testCandidates = buildTestCandidates(fanOut, commandFlows, risks);
  return {
    boundaryDiagnostics,
    boundaryRisks,
    commandContracts,
    commandFlows,
    cycles,
    domains,
    emptyIO,
    fanOut,
    ioCoverage,
    kind: options.kind,
    ownership: buildOwnership(snapshot.links, options, componentByName),
    process: buildProcess(snapshot.links, links, options, componentByName),
    risks,
    summary: buildSummary(
      snapshot,
      links,
      fanOut,
      commandContracts,
      commandFlows,
      cycles,
      emptyIO,
      risks,
      testCandidates,
    ),
    testCandidates,
  };
}

export function formatEbcaRuntimeReport(
  report: EbcaRuntimeReport,
  options: EbcaRuntimeReportOptions,
): string {
  if (report.kind === 'boundary-risks') {
    return formatBoundaryRisks(report.boundaryRisks, options);
  }
  if (report.kind === 'boundary-diagnostics') {
    return formatBoundaryDiagnostics(report.boundaryDiagnostics);
  }
  if (report.kind === 'command-flows' || report.kind === 'commands') {
    return formatCommandFlows(report.commandFlows);
  }
  if (report.kind === 'command-contracts') {
    return formatCommandContracts(report.commandContracts);
  }
  if (report.kind === 'cycles') {
    return formatCycles(report.cycles);
  }
  if (report.kind === 'domains') {
    return formatDomains(report.domains);
  }
  if (report.kind === 'empty-io') {
    return formatEmptyIO(report.emptyIO);
  }
  if (report.kind === 'fanout') {
    return formatFanOut(report.fanOut);
  }
  if (report.kind === 'io-coverage') {
    return formatIOCoverage(report.ioCoverage);
  }
  if (report.kind === 'multi-writers') {
    return formatBoundaryRisks(report.boundaryRisks, options);
  }
  if (report.kind === 'owners') {
    return formatOwnership(report.ownership);
  }
  if (report.kind === 'process') {
    return formatProcess(report.process, options);
  }
  if (report.kind === 'risks') {
    return formatRisks(report.risks);
  }
  if (report.kind === 'tests') {
    return formatTestCandidates(report.testCandidates);
  }
  return formatSummary(report);
}

function buildSummary(
  snapshot: EbcaRuntimeSnapshot,
  links: EbcaRuntimeLink[],
  fanOut: EbcaRuntimeFanOutEntry[],
  commandContracts: EbcaRuntimeCommandContract[],
  commandFlows: EbcaRuntimeCommandFlow[],
  cycles: EbcaRuntimeCycle[],
  emptyIO: EbcaRuntimeLink[],
  risks: EbcaRuntimeRisk[],
  testCandidates: EbcaRuntimeTestCandidate[],
): EbcaRuntimeReportSummary {
  return {
    commandWriteCount: commandFlows.length,
    commandContractCount: commandContracts.length,
    componentCount: snapshot.components.length,
    cycleCount: cycles.length,
    emptyIOCount: emptyIO.length,
    entityCount: snapshot.entities.length,
    fanOutCount: fanOut.length,
    filteredLinkCount: links.length,
    ioTotals: countIO(links),
    linkCount: snapshot.links.length,
    riskCount: risks.length,
    systemCount: snapshot.systems.length,
    testCandidateCount: testCandidates.length,
    topSystems: countBy(links, (link) => link.systemName).slice(0, 12),
    topTriggerComponents: countBy(links, (link) => link.componentName).slice(0, 15),
  };
}

function buildFanOut(links: EbcaRuntimeLink[]): EbcaRuntimeFanOutEntry[] {
  const grouped = new Map<string, EbcaRuntimeLink[]>();
  links.forEach((link) => {
    const key = formatTriggerKey(link);
    grouped.set(key, [...(grouped.get(key) ?? []), link]);
  });
  return [...grouped.values()]
    .filter((handlers) => handlers.length > 1)
    .map((handlers) => ({
      handlers: handlers.sort(compareLinksByHandler),
      trigger: toTriggerDescriptor(handlers[0]),
    }))
    .sort(
      (left, right) =>
        right.handlers.length - left.handlers.length ||
        compareText(formatTriggerDescriptor(left.trigger), formatTriggerDescriptor(right.trigger)),
    );
}

function buildDomainReport(links: EbcaRuntimeLink[]): EbcaRuntimeDomainReport {
  const grouped = new Map<string, EbcaRuntimeLink[]>();
  links.forEach((link) => {
    grouped.set(link.systemDomainName, [
      ...(grouped.get(link.systemDomainName) ?? []),
      link,
    ]);
  });
  return {
    entries: [...grouped.entries()]
      .map(([domainName, domainLinks]) => ({
        domainName,
        handlerCount: domainLinks.length,
        ioTotals: countIO(domainLinks),
        kind: 'unknown' as const,
        links: domainLinks.sort(compareLinksByHandler),
        systemNames: uniqueSorted(domainLinks.map((link) => link.systemName)),
        triggerComponentNames: uniqueSorted(
          domainLinks.map((link) => link.componentName),
        ),
      }))
      .sort((left, right) => compareText(left.domainName, right.domainName)),
  };
}

function buildIOCoverage(
  links: EbcaRuntimeLink[],
  componentByName: Map<string, EbcaRuntimeSnapshot['components'][number]>,
): EbcaRuntimeIOCoverageReport {
  return {
    empty: links.filter((link) => !hasDeclaredIO(link.io)),
    missingTriggerRead: links.filter(
      (link) => !hasIOTarget(link.io.reads, link.entityName, link.componentName),
    ),
    outputlessCommandHandlers: links.filter(
      (link) =>
        isCommandLikeComponentName(link.componentName, componentByName) &&
        link.eventType === 'added' &&
        getDomainOutputs(link).length === 0,
    ),
    triggerOnly: links.filter(hasOnlyTriggerRead),
    totalHandlers: links.length,
  };
}

function buildBoundaryRisks(
  links: EbcaRuntimeLink[],
  componentByName: Map<string, EbcaRuntimeSnapshot['components'][number]>,
): EbcaRuntimeRisk[] {
  const risks: EbcaRuntimeRisk[] = [];
  buildEntityComponentWriterGroups(links, componentByName)
    .filter((group) => group.writerDomains.length > 1)
    .forEach((group) => {
      risks.push({
        details: [
          `${group.entityName}.${group.componentName} has writer domains: ${group.writerDomains.join(', ')}.`,
          `Target entity domain: ${group.entityDomainName}.`,
          'Entity-component state/fact/result ownership is inferred from actual runtime writers; multiple writer domains should be split through command/input/due intents or made explicit by design.',
        ],
        links: group.links,
        severity: 'high',
        title: 'Entity-component pair has multiple writer domains',
      });
    });
  return risks.sort(compareRisks);
}

function buildBoundaryDiagnostics(
  links: EbcaRuntimeLink[],
  componentByName: Map<string, EbcaRuntimeSnapshot['components'][number]>,
): EbcaRuntimeRisk[] {
  const risks: EbcaRuntimeRisk[] = [];
  links.forEach((link) => {
    collectBoundaryOutputs(link)
      .filter(
        (output) =>
          !sameRuntimeDomain(link.systemDomainName, output.entityDomainName) &&
          !isInputComponent(output.componentName, componentByName),
      )
      .forEach((output) => {
        const targetIsInferredTriggerEntity = !output.explicitEntity;
        risks.push({
          details: [
            `${formatHandlerLabel(link)} declares ${output.kind} of ${formatIOTarget(output)}.`,
            `System domain ${link.systemDomainName} differs from target entity domain ${output.entityDomainName}.`,
            targetIsInferredTriggerEntity
              ? 'The target entity is inferred from class-only @EbcaIO; use [EntityClass, ComponentClass] when the nested ComponentManager call writes another aggregate.'
              : 'Cross-domain state/fact/result output should go through command/input/due intent owned by the target process.',
          ],
          links: [link],
          severity: targetIsInferredTriggerEntity ? 'medium' : 'high',
          title: targetIsInferredTriggerEntity
            ? 'Class-only @EbcaIO infers foreign trigger state output'
            : 'Foreign domain writes target state/fact/result output',
        });
      });
  });
  return risks.sort(compareRisks);
}

function buildEntityComponentWriterGroups(
  links: EbcaRuntimeLink[],
  componentByName: Map<string, EbcaRuntimeSnapshot['components'][number]>,
): EntityComponentWriterGroup[] {
  const grouped = new Map<string, EntityComponentWriterGroup>();
  links.forEach((link) => {
    collectBoundaryOutputs(link)
      .filter((output) => !isInputComponent(output.componentName, componentByName))
      .forEach((output) => {
        const key = `${output.entityDomainName}:${output.entityName}:${output.componentName}`;
        const existing = grouped.get(key) ?? {
          componentName: output.componentName,
          entityDomainName: output.entityDomainName,
          entityName: output.entityName,
          links: [],
          writerDomains: [],
        };
        grouped.set(key, {
          ...existing,
          links: [...existing.links, link],
          writerDomains: uniqueSorted([
            ...existing.writerDomains,
            link.systemDomainName,
          ]),
        });
      });
  });
  return [...grouped.values()];
}

function collectBoundaryOutputs(link: EbcaRuntimeLink): BoundaryOutput[] {
  return [
    ...link.io.writes.map((target) => ({ ...target, kind: 'write' as const })),
    ...link.io.removes.map((target) => ({ ...target, kind: 'remove' as const })),
    ...link.io.emits.map((target) => ({ ...target, kind: 'emit' as const })),
  ];
}

function buildCommandFlows(
  allLinks: EbcaRuntimeLink[],
  producerLinks: EbcaRuntimeLink[],
  options: EbcaRuntimeReportOptions,
  componentByName: Map<string, EbcaRuntimeSnapshot['components'][number]>,
): EbcaRuntimeCommandFlow[] {
  const flows: EbcaRuntimeCommandFlow[] = [];
  producerLinks.forEach((producer) => {
    getCommandOutputs(producer, componentByName).forEach((commandName) => {
      const targets = allLinks
        .filter((link) => link.componentName === commandName)
        .filter((link) => matchesDomain(link, options.domainName))
        .sort(compareLinksByTrigger);
      flows.push({
        commandName,
        producer,
        targets,
      });
    });
  });
  return flows.sort(
    (left, right) =>
      compareText(left.commandName, right.commandName) ||
      compareText(formatHandlerLabel(left.producer), formatHandlerLabel(right.producer)),
  );
}

function buildCommandContracts(
  snapshot: EbcaRuntimeSnapshot,
  options: EbcaRuntimeReportOptions,
  componentByName: Map<string, EbcaRuntimeSnapshot['components'][number]>,
): EbcaRuntimeCommandContract[] {
  const scopedLinks = snapshot.links.filter((link) =>
    matchesDomain(link, options.domainName),
  );
  return snapshot.components
    .filter((component) => isCommandLikeComponent(component))
    .filter(
      (component) =>
        !options.componentName ||
        matchesText(component.name, options.componentName),
    )
    .map((component) => {
      const triggerHandlers = scopedLinks
        .filter((link) => link.componentName === component.name)
        .sort(compareLinksByTrigger);
      const terminalWriters = filterByIO(scopedLinks, component.name, 'writes');
      const terminalRemovers = filterByIO(scopedLinks, component.name, 'removes');
      const producerLinks = scopedLinks.filter((link) =>
        getCommandOutputs(link, componentByName).some((commandName) =>
          matchesText(commandName, component.name),
        ),
      );
      const producers = producerLinks
        .map((producer) => ({
          commandName: component.name,
          producer,
          targets: snapshot.links
            .filter((link) => link.componentName === component.name)
            .filter((link) => matchesDomain(link, options.domainName))
            .sort(compareLinksByTrigger),
        }))
        .sort(
          (left, right) =>
            compareText(left.commandName, right.commandName) ||
            compareText(
              formatHandlerLabel(left.producer),
              formatHandlerLabel(right.producer),
            ),
        );
      return {
        commandName: component.name,
        delayedBy: component.delayedBy,
        downstreamComponents: uniqueSorted(
          triggerHandlers.flatMap((link) => getDomainOutputs(link)),
        ),
        failureContractNote:
          'Reason and failureDetails generic types are TypeScript-only unless explicit runtime metadata is added.',
        inbound: component.inbound,
        producers,
        terminalRemovers,
        terminalWriters,
        triggerHandlers,
        websocket: component.websocket,
      } satisfies EbcaRuntimeCommandContract;
    })
    .filter((contract) => {
      if (!options.domainName) {
        return true;
      }
      const needle = options.domainName.toLowerCase();
      return (
        contract.triggerHandlers.length > 0 ||
        contract.terminalWriters.length > 0 ||
        contract.terminalRemovers.length > 0 ||
        contract.producers.length > 0 ||
        contract.downstreamComponents.some((componentName) =>
          componentName.toLowerCase().includes(needle),
        )
      );
    })
    .sort((left, right) => compareText(left.commandName, right.commandName));
}

function buildOwnership(
  allLinks: EbcaRuntimeLink[],
  options: EbcaRuntimeReportOptions,
  componentByName: Map<string, EbcaRuntimeSnapshot['components'][number]>,
): EbcaRuntimeOwnershipReport {
  if (!options.componentName) {
    return {
      commandProducers: [],
      componentName: null,
      emitters: [],
      readers: [],
      removers: [],
      triggerHandlers: [],
      writers: [],
    };
  }

  const scopedLinks = allLinks.filter((link) => matchesDomain(link, options.domainName));
  const componentName = options.componentName;
  const triggerHandlers = scopedLinks
    .filter((link) => matchesText(link.componentName, componentName))
    .sort(compareLinksByTrigger);
  const readers = filterByIO(scopedLinks, componentName, 'reads');
  const writers = filterByIO(scopedLinks, componentName, 'writes');
  const emitters = filterByIO(scopedLinks, componentName, 'emits');
  const removers = filterByIO(scopedLinks, componentName, 'removes');
  return {
    commandProducers: buildCommandFlows(
      allLinks,
      scopedLinks.filter((link) =>
        getCommandOutputs(link, componentByName).some((commandName) => matchesText(commandName, componentName)),
      ),
      options,
      componentByName,
    ),
    componentName,
    emitters,
    readers,
    removers,
    triggerHandlers,
    writers,
  };
}

function buildRisks(
  fanOut: EbcaRuntimeFanOutEntry[],
  commandFlows: EbcaRuntimeCommandFlow[],
  emptyIO: EbcaRuntimeLink[],
  boundaryRisks: EbcaRuntimeRisk[],
  componentByName: Map<string, EbcaRuntimeSnapshot['components'][number]>,
): EbcaRuntimeRisk[] {
  const risks: EbcaRuntimeRisk[] = [...boundaryRisks];
  fanOut.forEach((entry) => {
    if (
      isCommandIntentTrigger(entry.trigger, componentByName) &&
      entry.trigger.eventType === 'added'
    ) {
      risks.push({
        details: [
          `${formatTriggerDescriptor(entry.trigger)} has ${entry.handlers.length} COMPONENT_ADDED handlers.`,
          'Command and due intents need one owner executor; extra added handlers should be explicit gates or split components.',
        ],
        links: entry.handlers,
        severity: 'high',
        title: 'Command intent has multiple added handlers',
      });
    }
  });

  commandFlows
    .filter((flow) => flow.targets.length === 0)
    .forEach((flow) => {
      risks.push({
        details: [
          `${formatHandlerLabel(flow.producer)} emits ${flow.commandName}, but no @EbcaPattern handler is registered for it.`,
        ],
        links: [flow.producer],
        severity: 'high',
        title: 'Command output has no registered handler',
      });
    });

  emptyIO.forEach((link) => {
    risks.push({
      details: [
        `${formatHandlerLabel(link)} has no declared reads/writes/emits/removes.`,
        'Runtime graph cannot explain this handler without opening implementation files.',
      ],
      links: [link],
      severity: 'low',
      title: 'Handler has empty @EbcaIO',
    });
  });

  return risks.sort(compareRisks);
}

function isCommandIntentTrigger(
  trigger: EbcaRuntimeTriggerDescriptor,
  componentByName: Map<string, EbcaRuntimeSnapshot['components'][number]>,
): boolean {
  return isCommandLikeComponentName(trigger.componentName, componentByName);
}

function buildTestCandidates(
  fanOut: EbcaRuntimeFanOutEntry[],
  commandFlows: EbcaRuntimeCommandFlow[],
  risks: EbcaRuntimeRisk[],
): EbcaRuntimeTestCandidate[] {
  const candidates: EbcaRuntimeTestCandidate[] = [];
  risks
    .filter((risk) => risk.title === 'Command intent has multiple added handlers')
    .forEach((risk) => {
      candidates.push({
        links: risk.links,
        priority: 'high',
        reason: 'A command/due added event reaches more than one handler; test should prove this is intentional and idempotent.',
        title: risk.details[0],
      });
    });

  commandFlows.forEach((flow) => {
    candidates.push({
      links: [flow.producer, ...flow.targets],
      priority: flow.targets.length === 0 ? 'high' : 'medium',
      reason: `${formatHandlerLabel(flow.producer)} emits ${flow.commandName}; test the command lifecycle and downstream owner side effects.`,
      title: `${formatHandlerLabel(flow.producer)} -> ${flow.commandName}`,
    });
  });

  fanOut
    .filter((entry) => entry.handlers.length > FACT_FANOUT_TEST_THRESHOLD)
    .forEach((entry) => {
      candidates.push({
        links: entry.handlers,
        priority: 'medium',
        reason: 'Hot fact fan-out should have scenario coverage for all subscribers.',
        title: formatTriggerDescriptor(entry.trigger),
      });
    });

  return candidates.sort(compareTestCandidates);
}

function buildProcess(
  allLinks: EbcaRuntimeLink[],
  startLinks: EbcaRuntimeLink[],
  options: EbcaRuntimeReportOptions,
  componentByName: Map<string, EbcaRuntimeSnapshot['components'][number]>,
): EbcaRuntimeProcessNode[] {
  const processStartLinks = filterProcessStartLinks(startLinks, options, componentByName);
  return processStartLinks
    .sort(compareLinksByTrigger)
    .map((link) =>
      buildProcessNode(allLinks, link, options, options.depth, 0, [], componentByName),
    );
}

function filterProcessStartLinks(
  startLinks: EbcaRuntimeLink[],
  options: EbcaRuntimeReportOptions,
  componentByName: Map<string, EbcaRuntimeSnapshot['components'][number]>,
): EbcaRuntimeLink[] {
  const processDirection = options.processDirection ?? 'forward';
  if (
    processDirection === 'forward' ||
    options.eventType ||
    !options.componentName ||
    !isCommandLikeComponentName(options.componentName, componentByName)
  ) {
    return startLinks;
  }
  const addedLinks = startLinks.filter((link) => link.eventType === 'added');
  return addedLinks.length > 0 ? addedLinks : startLinks;
}

function buildProcessNode(
  allLinks: EbcaRuntimeLink[],
  link: EbcaRuntimeLink,
  options: EbcaRuntimeReportOptions,
  remainingDepth: number,
  depth: number,
  path: string[],
  componentByName: Map<string, EbcaRuntimeSnapshot['components'][number]>,
): EbcaRuntimeProcessNode {
  const linkKey = formatLinkKey(link);
  if (path.includes(linkKey) || remainingDepth <= 0) {
    return {
      commandWrites: [],
      cycle: path.includes(linkKey),
      depth,
      link,
    };
  }

  const nextPath = [...path, linkKey];
  return {
    commandWrites: buildProcessEdges(
      allLinks,
      link,
      options,
      componentByName,
    ).map((edge) => ({
      commandName: edge.commandName,
      direction: edge.direction,
      targets: edge.targets.map((target) =>
        buildProcessNode(
          allLinks,
          target,
          options,
          remainingDepth - 1,
          depth + 1,
          nextPath,
          componentByName,
        ),
      ),
    })),
    cycle: false,
    depth,
    link,
  };
}

interface ProcessEdgeGroup {
  commandName: string;
  direction: EbcaRuntimeProcessEdgeDirection;
  targets: EbcaRuntimeLink[];
}

function buildProcessEdges(
  allLinks: EbcaRuntimeLink[],
  link: EbcaRuntimeLink,
  options: EbcaRuntimeReportOptions,
  componentByName: Map<string, EbcaRuntimeSnapshot['components'][number]>,
): ProcessEdgeGroup[] {
  const edges: ProcessEdgeGroup[] = [];
  const processDirection = options.processDirection ?? 'forward';
  if (processDirection === 'forward' || processDirection === 'both') {
    getWorkflowOutputs(link, componentByName).forEach((commandName) => {
      edges.push({
        commandName,
        direction: 'forward',
        targets: allLinks
          .filter((target) => target.componentName === commandName)
          .filter((target) => matchesDomain(target, options.domainName))
          .sort(compareLinksByTrigger),
      });
    });
  }
  if (processDirection === 'reverse' || processDirection === 'both') {
    const producers = allLinks
      .filter((producer) =>
        getWorkflowOutputs(producer, componentByName).some(
          (commandName) => commandName === link.componentName,
        ),
      )
      .filter((producer) => matchesDomain(producer, options.domainName))
      .sort(compareLinksByHandler);
    if (producers.length > 0) {
      edges.push({
        commandName: link.componentName,
        direction: 'reverse',
        targets: producers,
      });
    }
  }
  return edges.sort(
    (left, right) =>
      compareText(left.direction, right.direction) ||
      compareText(left.commandName, right.commandName),
  );
}

function buildCycles(
  allLinks: EbcaRuntimeLink[],
  startLinks: EbcaRuntimeLink[],
  options: EbcaRuntimeReportOptions,
  componentByName: Map<string, EbcaRuntimeSnapshot['components'][number]>,
): EbcaRuntimeCycle[] {
  const edgesByLinkKey = buildForwardWorkflowEdgeMap(
    allLinks,
    options,
    componentByName,
  );
  const cycles = new Map<string, EbcaRuntimeCycle>();
  startLinks.sort(compareLinksByTrigger).forEach((link) => {
    collectCycles(
      link,
      options.depth,
      [],
      [],
      edgesByLinkKey,
      componentByName,
      cycles,
    );
  });
  return [...cycles.values()].sort(compareCycles);
}

function buildForwardWorkflowEdgeMap(
  allLinks: EbcaRuntimeLink[],
  options: EbcaRuntimeReportOptions,
  componentByName: Map<string, EbcaRuntimeSnapshot['components'][number]>,
): Map<string, EbcaRuntimeCycleEdge[]> {
  const edgesByLinkKey = new Map<string, EbcaRuntimeCycleEdge[]>();
  allLinks.forEach((link) => {
    const edges = getWorkflowOutputs(link, componentByName).flatMap((commandName) =>
      allLinks
        .filter((target) => target.componentName === commandName)
        .filter((target) => matchesDomain(target, options.domainName))
        .sort(compareLinksByTrigger)
        .map((target) => ({
          commandName,
          from: link,
          to: target,
        })),
    );
    edgesByLinkKey.set(formatLinkKey(link), edges);
  });
  return edgesByLinkKey;
}

function collectCycles(
  current: EbcaRuntimeLink,
  remainingDepth: number,
  path: EbcaRuntimeLink[],
  edgePath: EbcaRuntimeCycleEdge[],
  edgesByLinkKey: Map<string, EbcaRuntimeCycleEdge[]>,
  componentByName: Map<string, EbcaRuntimeSnapshot['components'][number]>,
  cycles: Map<string, EbcaRuntimeCycle>,
): void {
  const currentKey = formatLinkKey(current);
  const currentIndex = path.findIndex((link) => formatLinkKey(link) === currentKey);
  if (currentIndex >= 0) {
    const edges = edgePath.slice(currentIndex);
    if (edges.length > 0) {
      const key = formatCycleKey(edges);
      if (!cycles.has(key)) {
        cycles.set(key, {
          edges,
          hasDelayedEdge: cycleHasDelayedEdge(edges, componentByName),
          hasStatusUpdateEdge: edges.some((edge) => edge.to.eventType !== 'added'),
        });
      }
    }
    return;
  }
  if (remainingDepth <= 0) {
    return;
  }
  const nextPath = [...path, current];
  const nextEdges = edgesByLinkKey.get(currentKey) ?? [];
  nextEdges.forEach((edge) => {
    collectCycles(
      edge.to,
      remainingDepth - 1,
      nextPath,
      [...edgePath, edge],
      edgesByLinkKey,
      componentByName,
      cycles,
    );
  });
}

function filterReportLinks(
  links: EbcaRuntimeLink[],
  options: EbcaRuntimeReportOptions,
): EbcaRuntimeLink[] {
  return filterEbcaRuntimeLinks(links, {
    componentName: options.componentName,
    entityName: options.entityName,
    eventType: options.eventType,
    systemName: options.systemName,
  }).filter((link) => matchesDomain(link, options.domainName));
}

function filterBoundaryReportLinks(
  links: EbcaRuntimeLink[],
  options: EbcaRuntimeReportOptions,
): EbcaRuntimeLink[] {
  return filterEbcaRuntimeLinks(links, {
    entityName: options.entityName,
    eventType: options.eventType,
    systemName: options.systemName,
  }).filter((link) => matchesDomain(link, options.domainName));
}

function filterBoundaryReportRisks(
  risks: EbcaRuntimeRisk[],
  options: EbcaRuntimeReportOptions,
): EbcaRuntimeRisk[] {
  if (!options.componentName) {
    return risks;
  }
  return risks.filter((risk) =>
    getRiskTargetComponentNames(risk).some((componentName) =>
      matchesText(componentName, options.componentName ?? ''),
    ),
  );
}

function getRiskTargetComponentNames(risk: EbcaRuntimeRisk): string[] {
  return uniqueSorted(
    risk.details.flatMap((detail) => {
      const multiWriterMatch = detail.match(
        /^([A-Za-z0-9]+)\.([A-Za-z0-9]+) has writer domains:/,
      );
      if (multiWriterMatch) {
        return [multiWriterMatch[2]];
      }
      const outputMatch = detail.match(
        /declares (?:write|remove|emit) of (?:[A-Za-z0-9]+\.)?([A-Za-z0-9]+)\./,
      );
      return outputMatch ? [outputMatch[1]] : [];
    }),
  );
}

function matchesDomain(link: EbcaRuntimeLink, domainName: string | undefined): boolean {
  if (!domainName) {
    return true;
  }
  const needle = domainName.toLowerCase();
  return [
    link.componentName,
    link.entityDomainName,
    link.entityName,
    link.handlerName,
    link.systemClassName,
    link.systemDomainName,
    link.systemName,
    ...flattenIO(link.io).flatMap((target) => [
      formatIOTarget(target),
      target.entityDomainName,
      target.entityName,
    ]),
  ].some((value) => value.toLowerCase().includes(needle));
}

function filterByIO(
  links: EbcaRuntimeLink[],
  componentName: string,
  kind: keyof EbcaRuntimeHandlerIO,
): EbcaRuntimeLink[] {
  return links
    .filter((link) =>
      link.io[kind].some((target) => matchesText(target.componentName, componentName)),
    )
    .sort(compareLinksByHandler);
}

function matchesText(value: string, filter: string): boolean {
  return value.toLowerCase().includes(filter.toLowerCase());
}

function countIO(links: EbcaRuntimeLink[]): EbcaRuntimeIOTotals {
  return links.reduce(
    (totals, link) => ({
      emits: totals.emits + link.io.emits.length,
      reads: totals.reads + link.io.reads.length,
      removes: totals.removes + link.io.removes.length,
      writes: totals.writes + link.io.writes.length,
    }),
    {
      emits: 0,
      reads: 0,
      removes: 0,
      writes: 0,
    },
  );
}

function countBy(
  links: EbcaRuntimeLink[],
  getName: (link: EbcaRuntimeLink) => string,
): EbcaRuntimeCountEntry[] {
  const counts = new Map<string, number>();
  links.forEach((link) => {
    const name = getName(link);
    counts.set(name, (counts.get(name) ?? 0) + 1);
  });
  return [...counts.entries()]
    .map(([name, count]) => ({ count, name }))
    .sort((left, right) => right.count - left.count || compareText(left.name, right.name));
}

function hasDeclaredIO(io: EbcaRuntimeHandlerIO): boolean {
  return (
    io.reads.length > 0 ||
    io.writes.length > 0 ||
    io.emits.length > 0 ||
    io.removes.length > 0
  );
}

function getCommandOutputs(
  link: EbcaRuntimeLink,
  componentByName: Map<string, EbcaRuntimeSnapshot['components'][number]>,
): string[] {
  return uniqueSorted(
    getDomainOutputs(link).filter((componentName) =>
      isCommandLikeComponentName(componentName, componentByName),
    ),
  );
}

function getWorkflowOutputs(
  link: EbcaRuntimeLink,
  componentByName: Map<string, EbcaRuntimeSnapshot['components'][number]>,
): string[] {
  return uniqueSorted(
    [
      ...link.io.emits.map((target) => target.componentName),
      ...link.io.writes
        .filter((target) => isCommandLikeComponentName(target.componentName, componentByName))
        .map((target) => target.componentName),
    ].filter((componentName) => componentName !== link.componentName),
  );
}

function getDomainOutputs(link: EbcaRuntimeLink): string[] {
  return uniqueSorted(
    [...link.io.emits, ...link.io.writes]
      .map((target) => target.componentName)
      .filter((componentName) => componentName !== link.componentName),
  );
}

function hasOnlyTriggerRead(link: EbcaRuntimeLink): boolean {
  return (
    link.io.reads.length === 1 &&
    hasIOTarget(link.io.reads, link.entityName, link.componentName) &&
    link.io.writes.length === 0 &&
    link.io.emits.length === 0 &&
    link.io.removes.length === 0
  );
}

function hasIOTarget(
  targets: EbcaRuntimeIOTarget[],
  entityName: string,
  componentName: string,
): boolean {
  return targets.some(
    (target) =>
      target.entityName === entityName && target.componentName === componentName,
  );
}

function flattenIO(io: EbcaRuntimeHandlerIO): EbcaRuntimeIOTarget[] {
  return [...io.reads, ...io.writes, ...io.emits, ...io.removes];
}

function isInputComponent(
  componentName: string,
  componentByName: Map<string, EbcaRuntimeSnapshot['components'][number]>,
): boolean {
  return isCommandLikeComponentName(componentName, componentByName);
}

function isCommandLikeComponentName(
  componentName: string,
  componentByName: Map<string, EbcaRuntimeSnapshot['components'][number]>,
): boolean {
  const component = componentByName.get(componentName);
  return component ? isCommandLikeComponent(component) : isCommandLikeName(componentName);
}

function isCommandLikeComponent(
  component: EbcaRuntimeSnapshot['components'][number],
): boolean {
  return (
    component.isCommand ||
    component.inbound ||
    component.delayedBy !== null ||
    isCommandLikeName(component.name)
  );
}

function isCommandLikeName(componentName: string): boolean {
  return (
    componentName.endsWith('CommandComponent') ||
    componentName.endsWith('DueComponent') ||
    componentName.endsWith('InputComponent')
  );
}

function sameRuntimeDomain(left: string, right: string): boolean {
  return canonicalRuntimeDomainName(left) === canonicalRuntimeDomainName(right);
}

function canonicalRuntimeDomainName(value: string): string {
  if (value.endsWith('s') && value.length > 1) {
    return value.slice(0, -1);
  }
  return value;
}

function formatSummary(report: EbcaRuntimeReport): string {
  const summary = report.summary;
  return [
    'EBCA architecture report',
    '',
    `Links: ${summary.filteredLinkCount}/${summary.linkCount}`,
    `Entities: ${summary.entityCount}`,
    `Components: ${summary.componentCount}`,
    `Systems: ${summary.systemCount}`,
    `Declared IO: reads=${summary.ioTotals.reads}, writes=${summary.ioTotals.writes}, emits=${summary.ioTotals.emits}, removes=${summary.ioTotals.removes}`,
    `Workflow cycles: ${summary.cycleCount}`,
    `Fan-out triggers: ${summary.fanOutCount}`,
    `Command outputs: ${summary.commandWriteCount}`,
    `Command contracts: ${summary.commandContractCount}`,
    `Empty IO handlers: ${summary.emptyIOCount}`,
    `Trigger-only IO handlers: ${report.ioCoverage.triggerOnly.length}`,
    `Missing trigger reads: ${report.ioCoverage.missingTriggerRead.length}`,
    `Boundary risks: ${report.boundaryRisks.length}`,
    `Boundary diagnostics: ${report.boundaryDiagnostics.length}`,
    `Risks: ${summary.riskCount}`,
    `Test candidates: ${summary.testCandidateCount}`,
    '',
    'Top systems by subscriptions:',
    ...formatCountEntries(summary.topSystems),
    '',
    'Top trigger components:',
    ...formatCountEntries(summary.topTriggerComponents),
    '',
    'Hot fan-out:',
    ...formatFanOutEntries(report.fanOut.slice(0, 8)),
    '',
    'Command workflow outputs:',
    ...formatCommandFlowEntries(report.commandFlows.slice(0, 12)),
  ].join('\n');
}

function formatFanOut(fanOut: EbcaRuntimeFanOutEntry[]): string {
  if (fanOut.length === 0) {
    return 'No fan-out triggers matched filters.';
  }
  return ['EBCA fan-out triggers', '', ...formatFanOutEntries(fanOut)].join('\n');
}

function formatCommandFlows(commandFlows: EbcaRuntimeCommandFlow[]): string {
  if (commandFlows.length === 0) {
    return 'No command workflow outputs matched filters.';
  }
  return ['EBCA command workflow outputs', '', ...formatCommandFlowEntries(commandFlows)].join('\n');
}

function formatCommandContracts(contracts: EbcaRuntimeCommandContract[]): string {
  if (contracts.length === 0) {
    return 'No EBCA command contracts matched filters.';
  }
  return [
    'EBCA command contracts',
    '',
    ...contracts.flatMap((contract) => [
      `- ${contract.commandName}`,
      `  inbound: ${contract.inbound ? 'yes' : 'no'}, websocket: ${contract.websocket ? 'yes' : 'no'}, delayedBy: ${contract.delayedBy ?? 'none'}`,
      `  trigger handlers: ${contract.triggerHandlers.length}`,
      ...contract.triggerHandlers.map((link) => `  -> ${formatLinkLine(link)}`),
      `  terminal writers: ${contract.terminalWriters.length}`,
      ...contract.terminalWriters.map((link) => `  writes: ${formatHandlerLabel(link)}`),
      `  terminal removers: ${contract.terminalRemovers.length}`,
      ...contract.terminalRemovers.map((link) => `  removes: ${formatHandlerLabel(link)}`),
      `  downstream components: ${contract.downstreamComponents.length > 0 ? contract.downstreamComponents.join(', ') : 'none'}`,
      `  failure contract: ${contract.failureContractNote}`,
      ...formatCommandFlowEntries(contract.producers).map((line) => `  producer ${line}`),
    ]),
  ].join('\n');
}

function formatCycles(cycles: EbcaRuntimeCycle[]): string {
  if (cycles.length === 0) {
    return 'No EBCA workflow cycles matched filters.';
  }
  return [
    'EBCA workflow cycles',
    '',
    ...cycles.flatMap((cycle, index) => [
      `- cycle ${index + 1}: ${formatCycleComponentPath(cycle)}`,
      `  delayed edge: ${formatBoolean(cycle.hasDelayedEdge)}, status/update listener: ${formatBoolean(cycle.hasStatusUpdateEdge)}`,
      ...cycle.edges.map(
        (edge) =>
          `  ${formatHandlerLabel(edge.from)} outputs ${edge.commandName} -> ${formatLinkLine(edge.to)}`,
      ),
    ]),
  ].join('\n');
}

function formatDomains(domains: EbcaRuntimeDomainReport): string {
  if (domains.entries.length === 0) {
    return 'No EBCA domains matched filters.';
  }
  return [
    'EBCA runtime domains',
    '',
    ...domains.entries.flatMap((entry) => [
      `- [${entry.kind}] ${entry.domainName}: handlers=${entry.handlerCount}, systems=${entry.systemNames.join(', ')}`,
      `  io: reads=${entry.ioTotals.reads}, writes=${entry.ioTotals.writes}, emits=${entry.ioTotals.emits}, removes=${entry.ioTotals.removes}`,
      `  triggers: ${entry.triggerComponentNames.slice(0, 12).join(', ')}${entry.triggerComponentNames.length > 12 ? ', ...' : ''}`,
    ]),
  ].join('\n');
}

function formatEmptyIO(emptyIO: EbcaRuntimeLink[]): string {
  if (emptyIO.length === 0) {
    return 'No empty @EbcaIO handlers matched filters.';
  }
  return [
    'EBCA handlers with empty @EbcaIO',
    '',
    ...emptyIO.map((link) => `- ${formatLinkLine(link)}`),
  ].join('\n');
}

function formatIOCoverage(coverage: EbcaRuntimeIOCoverageReport): string {
  return [
    'EBCA IO coverage',
    '',
    `Handlers: ${coverage.totalHandlers}`,
    `Empty @EbcaIO: ${coverage.empty.length}`,
    `Trigger-only @EbcaIO: ${coverage.triggerOnly.length}`,
    `Missing trigger reads: ${coverage.missingTriggerRead.length}`,
    `Outputless command handlers: ${coverage.outputlessCommandHandlers.length}`,
    '',
    'Trigger-only handlers:',
    ...formatLinkEntries(coverage.triggerOnly),
    '',
    'Missing trigger reads:',
    ...formatLinkEntries(coverage.missingTriggerRead),
    '',
    'Outputless command handlers:',
    ...formatLinkEntries(coverage.outputlessCommandHandlers),
  ].join('\n');
}

function formatOwnership(ownership: EbcaRuntimeOwnershipReport): string {
  if (!ownership.componentName) {
    return 'Owner report requires --component ComponentName.';
  }
  return [
    `EBCA component ownership: ${ownership.componentName}`,
    '',
    'Trigger handlers:',
    ...formatLinkEntries(ownership.triggerHandlers),
    '',
    'Readers:',
    ...formatOwnershipIOEntries(
      ownership.readers,
      ownership.componentName,
      'reads',
    ),
    '',
    'Writers:',
    ...formatOwnershipIOEntries(
      ownership.writers,
      ownership.componentName,
      'writes',
    ),
    '',
    'Emitters:',
    ...formatOwnershipIOEntries(
      ownership.emitters,
      ownership.componentName,
      'emits',
    ),
    '',
    'Removers:',
    ...formatOwnershipIOEntries(
      ownership.removers,
      ownership.componentName,
      'removes',
    ),
    '',
    'Command producers:',
    ...formatCommandFlowEntries(ownership.commandProducers),
  ].join('\n');
}

function formatProcess(
  nodes: EbcaRuntimeProcessNode[],
  options: EbcaRuntimeReportOptions,
): string {
  if (nodes.length === 0) {
    return 'No process links matched filters.';
  }
  return [
    `EBCA process graph, depth=${options.depth}, direction=${options.processDirection ?? 'forward'}`,
    '',
    ...nodes.flatMap((node) => formatProcessNode(node)),
  ].join('\n');
}

function formatRisks(risks: EbcaRuntimeRisk[]): string {
  if (risks.length === 0) {
    return 'No EBCA architecture risks matched filters.';
  }
  return ['EBCA architecture risks', '', ...risks.flatMap((risk) => formatRisk(risk))].join('\n');
}

function formatBoundaryRisks(
  risks: EbcaRuntimeRisk[],
  options: EbcaRuntimeReportOptions,
): string {
  if (risks.length === 0) {
    return 'No EBCA boundary risks matched filters.';
  }
  if (options.verbose) {
    return ['EBCA boundary risks', '', ...risks.flatMap((risk) => formatRisk(risk))].join('\n');
  }
  return [
    'EBCA multi-writer boundary risks',
    '',
    ...risks.map(formatMultiWriterRiskSummary),
    '',
    'Use --verbose for handler list or report owners --component <ComponentName> for full IO details.',
  ].join('\n');
}

function formatBoundaryDiagnostics(risks: EbcaRuntimeRisk[]): string {
  if (risks.length === 0) {
    return 'No EBCA boundary diagnostics matched filters.';
  }
  return ['EBCA boundary diagnostics', '', ...risks.flatMap((risk) => formatRisk(risk))].join('\n');
}

function formatTestCandidates(candidates: EbcaRuntimeTestCandidate[]): string {
  if (candidates.length === 0) {
    return 'No EBCA integration test candidates matched filters.';
  }
  return [
    'EBCA integration test candidates',
    '',
    ...candidates.flatMap((candidate) => [
      `- [${candidate.priority}] ${candidate.title}`,
      `  reason: ${candidate.reason}`,
      ...candidate.links.map((link) => `  -> ${formatLinkLine(link)}`),
    ]),
  ].join('\n');
}

function formatRisk(risk: EbcaRuntimeRisk): string[] {
  return [
    `- [${risk.severity}] ${risk.title}`,
    ...risk.details.map((detail) => `  ${detail}`),
    ...risk.links.map((link) => `  -> ${formatLinkLine(link)}`),
  ];
}

function formatMultiWriterRiskSummary(risk: EbcaRuntimeRisk): string {
  const parsed = parseMultiWriterRisk(risk);
  if (!parsed) {
    return `- [${risk.severity}] ${risk.title}: ${risk.details[0] ?? 'no details'} (${risk.links.length} handlers)`;
  }
  return [
    `- [${risk.severity}] ${parsed.entityName}.${parsed.componentName}`,
    `  writer domains: ${parsed.writerDomains}`,
    `  handlers: ${risk.links.length}`,
  ].join('\n');
}

interface ParsedMultiWriterRisk {
  componentName: string;
  entityName: string;
  writerDomains: string;
}

function parseMultiWriterRisk(risk: EbcaRuntimeRisk): ParsedMultiWriterRisk | null {
  const detail = risk.details[0] ?? '';
  const match = detail.match(
    /^([A-Za-z0-9]+)\.([A-Za-z0-9]+) has writer domains: (.+)\.$/,
  );
  if (!match) {
    return null;
  }
  return {
    componentName: match[2],
    entityName: match[1],
    writerDomains: match[3],
  };
}

function formatCountEntries(entries: EbcaRuntimeCountEntry[]): string[] {
  if (entries.length === 0) {
    return ['- none'];
  }
  return entries.map((entry) => `- ${entry.name}: ${entry.count}`);
}

function formatFanOutEntries(entries: EbcaRuntimeFanOutEntry[]): string[] {
  if (entries.length === 0) {
    return ['- none'];
  }
  return entries.flatMap((entry) => [
    `- ${formatTriggerDescriptor(entry.trigger)} (${entry.handlers.length} handlers)`,
    ...entry.handlers.map((handler) => `  -> ${formatHandlerLabel(handler)}`),
  ]);
}

function formatCommandFlowEntries(flows: EbcaRuntimeCommandFlow[]): string[] {
  if (flows.length === 0) {
    return ['- none'];
  }
  return flows.flatMap((flow) => {
    const lines = [
      `- ${formatHandlerLabel(flow.producer)} emits ${flow.commandName}`,
    ];
    if (flow.targets.length === 0) {
      lines.push('  -> no registered handler');
      return lines;
    }
    lines.push(...flow.targets.map((target) => `  -> ${formatLinkLine(target)}`));
    return lines;
  });
}

function formatLinkEntries(links: EbcaRuntimeLink[]): string[] {
  if (links.length === 0) {
    return ['- none'];
  }
  return links.map((link) => `- ${formatLinkLine(link)}`);
}

function formatOwnershipIOEntries(
  links: EbcaRuntimeLink[],
  componentName: string,
  kind: keyof EbcaRuntimeHandlerIO,
): string[] {
  if (links.length === 0) {
    return ['- none'];
  }
  return links.map((link) => {
    const targets = link.io[kind]
      .filter((target) => matchesText(target.componentName, componentName))
      .map(formatIOTarget);
    return `- ${formatLinkLine(link)} (${kind}: ${targets.join(', ')})`;
  });
}

function formatProcessNode(node: EbcaRuntimeProcessNode): string[] {
  const indent = '  '.repeat(node.depth);
  const lines = [
    `${indent}- ${formatLinkLine(node.link)}${node.cycle ? ' [cycle]' : ''}`,
  ];
  node.commandWrites.forEach((write) => {
    lines.push(
      `${indent}  ${write.direction === 'reverse' ? 'producers of' : 'outputs'} ${write.commandName}`,
    );
    if (write.targets.length === 0) {
      lines.push(`${indent}    -> no registered handler`);
      return;
    }
    write.targets.forEach((target) => {
      lines.push(...formatProcessNode(target));
    });
  });
  return lines;
}

function formatIOTarget(target: EbcaRuntimeIOTarget): string {
  if (!target.explicitEntity) {
    return target.componentName;
  }
  return `${target.entityName}.${target.componentName}`;
}

function toTriggerDescriptor(link: EbcaRuntimeLink): EbcaRuntimeTriggerDescriptor {
  return {
    componentName: link.componentName,
    entityId: link.entityId,
    entityName: link.entityName,
    eventType: link.eventType,
  };
}

function formatLinkLine(link: EbcaRuntimeLink): string {
  return `${formatTriggerDescriptor(toTriggerDescriptor(link))} -> ${formatHandlerLabel(link)}`;
}

function formatHandlerLabel(link: EbcaRuntimeLink): string {
  return `${link.systemName}.${link.handlerName}`;
}

function formatTriggerDescriptor(trigger: EbcaRuntimeTriggerDescriptor): string {
  return `${trigger.entityName}.${trigger.entityId} ${trigger.eventType} ${trigger.componentName}`;
}

function formatTriggerKey(link: EbcaRuntimeLink): string {
  return `${link.entityName}:${link.entityId}:${link.eventType}:${link.componentName}`;
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort(compareText);
}

function formatLinkKey(link: EbcaRuntimeLink): string {
  return `${formatTriggerKey(link)}:${link.systemName}:${link.handlerName}`;
}

function formatCycleComponentPath(cycle: EbcaRuntimeCycle): string {
  const componentNames = cycle.edges.map((edge) => edge.commandName);
  if (componentNames.length === 0) {
    return 'empty cycle';
  }
  return `${componentNames.join(' -> ')} -> ${componentNames[0]}`;
}

function formatCycleKey(edges: EbcaRuntimeCycleEdge[]): string {
  const edgeKeys = edges.map(
    (edge) =>
      `${formatLinkKey(edge.from)}->${edge.commandName}->${formatLinkKey(edge.to)}`,
  );
  const rotations = edgeKeys.map((_, index) =>
    [...edgeKeys.slice(index), ...edgeKeys.slice(0, index)].join('|'),
  );
  return rotations.sort(compareText)[0] ?? edgeKeys.join('|');
}

function cycleHasDelayedEdge(
  edges: EbcaRuntimeCycleEdge[],
  componentByName: Map<string, EbcaRuntimeSnapshot['components'][number]>,
): boolean {
  return edges.some((edge) => {
    const component = componentByName.get(edge.commandName);
    return component ? component.delayedBy !== null : edge.commandName.endsWith('DueComponent');
  });
}

function compareCycles(left: EbcaRuntimeCycle, right: EbcaRuntimeCycle): number {
  return (
    Number(left.hasDelayedEdge) - Number(right.hasDelayedEdge) ||
    Number(left.hasStatusUpdateEdge) - Number(right.hasStatusUpdateEdge) ||
    compareText(formatCycleComponentPath(left), formatCycleComponentPath(right))
  );
}

function formatBoolean(value: boolean): string {
  return value ? 'yes' : 'no';
}

function compareRisks(left: EbcaRuntimeRisk, right: EbcaRuntimeRisk): number {
  return (
    riskWeight(right.severity) - riskWeight(left.severity) ||
    compareText(left.title, right.title)
  );
}

function compareTestCandidates(
  left: EbcaRuntimeTestCandidate,
  right: EbcaRuntimeTestCandidate,
): number {
  return (
    riskWeight(right.priority) - riskWeight(left.priority) ||
    compareText(left.title, right.title)
  );
}

function riskWeight(severity: EbcaRuntimeRiskSeverity): number {
  if (severity === 'high') {
    return 3;
  }
  if (severity === 'medium') {
    return 2;
  }
  return 1;
}

function compareLinksByHandler(left: EbcaRuntimeLink, right: EbcaRuntimeLink): number {
  return (
    compareText(left.systemName, right.systemName) ||
    compareText(left.handlerName, right.handlerName)
  );
}

function compareLinksByTrigger(left: EbcaRuntimeLink, right: EbcaRuntimeLink): number {
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
