export type EbcaContractGate = 'ws' | 'rest' | 'gql' | 'grpc' | 'openapi';
export type EbcaContractDeclarationKind = 'enum' | 'type';

export interface EbcaContractDeclarationOptions {
  readonly name?: string;
  readonly gates?: readonly EbcaContractGate[];
}

export type EbcaTypeOptions = EbcaContractDeclarationOptions;

export type EbcaEnumOptions = EbcaContractDeclarationOptions;

export interface EbcaContractDeclarationMetadata {
  readonly name: string;
  readonly kind: EbcaContractDeclarationKind;
  readonly gates: readonly EbcaContractGate[];
  readonly sourceFile: string | null;
  readonly ownerClassName: string;
}
