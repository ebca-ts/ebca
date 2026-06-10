import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import {
  EbcaContractDeclarationKind,
  EbcaContractDeclarationMetadata,
  EbcaContractDeclarationOptions,
  EbcaEnumOptions,
  EbcaTypeOptions,
} from '../types/contracts';
import { captureDecoratorSourceFile } from './decorator-source-file';

const logger = new Logger('EbcaContractDeclarationDecorator');

const defaultContractGates = ['ws', 'rest', 'gql', 'grpc', 'openapi'] as const;
const EBCA_CONTRACT_DECLARATIONS: EbcaContractDeclarationMetadata[] = [];

export function EbcaType(options: EbcaTypeOptions = {}): ClassDecorator {
  return (target) => {
    registerDeclaration('type', options, target.name);
  };
}

export function EbcaEnum(options: EbcaEnumOptions = {}): ClassDecorator {
  return (target) => {
    registerDeclaration('enum', options, target.name);
  };
}

export function getEbcaContractDeclarations(): EbcaContractDeclarationMetadata[] {
  return EBCA_CONTRACT_DECLARATIONS;
}

function registerDeclaration(
  kind: EbcaContractDeclarationKind,
  options: EbcaContractDeclarationOptions,
  ownerClassName: string,
): void {
  const name = options.name ?? inferDeclarationName(ownerClassName, kind);
  const existing = EBCA_CONTRACT_DECLARATIONS.find(
    (metadata) => metadata.name === name,
  );
  if (existing) {
    throw new Error(
      `Duplicate EBCA ${kind} declaration ${name}: ${existing.ownerClassName} and ${ownerClassName}.`,
    );
  }
  EBCA_CONTRACT_DECLARATIONS.push({
    name,
    kind,
    gates: options.gates ?? defaultContractGates,
    sourceFile: captureDecoratorSourceFile(),
    ownerClassName,
  });
  logger.debug(`Registered EBCA ${kind} declaration: ${name}.`);
}

function inferDeclarationName(
  ownerClassName: string,
  kind: EbcaContractDeclarationKind,
): string {
  const suffixes =
    kind === 'type'
      ? ['EbcaType', 'TypeContract', 'ContractType', 'Contract', 'Type']
      : ['EbcaEnum', 'EnumContract', 'ContractEnum', 'Contract', 'Enum'];
  for (const suffix of suffixes) {
    if (ownerClassName.endsWith(suffix)) {
      return ownerClassName.slice(0, -suffix.length);
    }
  }
  return ownerClassName;
}
