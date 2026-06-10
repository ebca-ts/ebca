import { EbcaRuntimeIOTarget, EbcaRuntimeLink } from './runtime-inspector';

export type EbcaRuntimeGraphFormat = 'dot' | 'mermaid';

export interface EbcaRuntimeGraphOptions {
  format: EbcaRuntimeGraphFormat;
  includeIO: boolean;
}

export function formatEbcaRuntimeGraph(
  links: EbcaRuntimeLink[],
  options: EbcaRuntimeGraphOptions,
): string {
  if (options.format === 'dot') {
    return formatDotGraph(links, options.includeIO);
  }
  return formatMermaidGraph(links, options.includeIO);
}

function formatMermaidGraph(links: EbcaRuntimeLink[], includeIO: boolean): string {
  const lines = ['flowchart LR'];
  const componentNodes = new Set<string>();

  links.forEach((link, index) => {
    const triggerNode = `trigger_${index}`;
    const handlerNode = `handler_${index}`;
    lines.push(
      `  ${triggerNode}["${escapeMermaidLabel(formatTriggerLabel(link))}"]`,
      `  ${handlerNode}["${escapeMermaidLabel(formatHandlerLabel(link))}"]`,
      `  ${triggerNode} --> ${handlerNode}`,
    );

    if (!includeIO) {
      return;
    }

    addMermaidIONodes(lines, componentNodes, handlerNode, 'reads', link.io.reads);
    addMermaidIONodes(lines, componentNodes, handlerNode, 'writes', link.io.writes);
    addMermaidIONodes(lines, componentNodes, handlerNode, 'emits', link.io.emits);
    addMermaidIONodes(lines, componentNodes, handlerNode, 'removes', link.io.removes);
  });

  return lines.join('\n');
}

function addMermaidIONodes(
  lines: string[],
  componentNodes: Set<string>,
  handlerNode: string,
  kind: string,
  targets: EbcaRuntimeIOTarget[],
): void {
  targets.forEach((target) => {
    const targetLabel = formatIOTargetLabel(target);
    const componentNode = `component_${sanitizeNodeId(kind)}_${sanitizeNodeId(targetLabel)}`;
    if (!componentNodes.has(componentNode)) {
      componentNodes.add(componentNode);
      lines.push(
        `  ${componentNode}["${escapeMermaidLabel(targetLabel)}"]`,
      );
    }
    lines.push(`  ${handlerNode} -. ${kind} .-> ${componentNode}`);
  });
}

function formatDotGraph(links: EbcaRuntimeLink[], includeIO: boolean): string {
  const lines = ['digraph EbcaRuntime {', '  rankdir=LR;'];
  const componentNodes = new Set<string>();

  links.forEach((link, index) => {
    const triggerNode = `trigger_${index}`;
    const handlerNode = `handler_${index}`;
    lines.push(
      `  ${triggerNode} [label="${escapeDotLabel(formatTriggerLabel(link))}", shape=box];`,
      `  ${handlerNode} [label="${escapeDotLabel(formatHandlerLabel(link))}", shape=ellipse];`,
      `  ${triggerNode} -> ${handlerNode};`,
    );

    if (!includeIO) {
      return;
    }

    addDotIONodes(lines, componentNodes, handlerNode, 'reads', link.io.reads);
    addDotIONodes(lines, componentNodes, handlerNode, 'writes', link.io.writes);
    addDotIONodes(lines, componentNodes, handlerNode, 'emits', link.io.emits);
    addDotIONodes(lines, componentNodes, handlerNode, 'removes', link.io.removes);
  });

  lines.push('}');
  return lines.join('\n');
}

function addDotIONodes(
  lines: string[],
  componentNodes: Set<string>,
  handlerNode: string,
  kind: string,
  targets: EbcaRuntimeIOTarget[],
): void {
  targets.forEach((target) => {
    const targetLabel = formatIOTargetLabel(target);
    const componentNode = `component_${sanitizeNodeId(kind)}_${sanitizeNodeId(targetLabel)}`;
    if (!componentNodes.has(componentNode)) {
      componentNodes.add(componentNode);
      lines.push(
        `  ${componentNode} [label="${escapeDotLabel(targetLabel)}", shape=note];`,
      );
    }
    lines.push(`  ${handlerNode} -> ${componentNode} [style=dashed, label="${kind}"];`);
  });
}

function formatTriggerLabel(link: EbcaRuntimeLink): string {
  return `${link.entityName}.${link.entityId} ${link.eventType} ${link.componentName}`;
}

function formatHandlerLabel(link: EbcaRuntimeLink): string {
  return `${link.systemName}.${link.handlerName}`;
}

function formatIOTargetLabel(target: EbcaRuntimeIOTarget): string {
  if (!target.explicitEntity) {
    return target.componentName;
  }
  return `${target.entityName}.${target.componentName}`;
}

function sanitizeNodeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_]/g, '_');
}

function escapeMermaidLabel(value: string): string {
  return value.replace(/"/g, "'");
}

function escapeDotLabel(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
