import { Module, Type } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRegisteredSystems } from '@ebca/core/decorators/system.decorator';

type RuntimeMockMethod = (...args: never[]) => null;
type RuntimeMockValue = RuntimeMockMethod | undefined;

@Module({})
class EbcaRuntimeInspectionModule {}

export async function compileEbcaRuntimeInspectionModule(): Promise<TestingModule> {
  const controllers = getRegisteredSystems() as Type<object>[];
  return Test.createTestingModule({
    controllers,
    imports: [EbcaRuntimeInspectionModule],
  })
    .useMocker(() => createRuntimeMock())
    .compile();
}

function createRuntimeMock(): object {
  const values = new Map<PropertyKey, RuntimeMockValue>();
  return new Proxy(
    {},
    {
      get: (_target: object, property: PropertyKey): RuntimeMockValue => {
        if (property === 'then') {
          return undefined;
        }
        const current = values.get(property);
        if (current) {
          return current;
        }
        const method = (..._args: never[]): null => null;
        values.set(property, method);
        return method;
      },
    },
  );
}
