# EBCA WS gateway (`@ebca/ws-gateway`)

Универсальный WebSocket transport adapter поверх EBCA metadata.

## Роль

- Не содержит игровых импортов и доменных правил.
- Подключается через `EbcaWsGatewayModule.forRoot(...)`.
- Использует `@ebca/core` как источник entity/component/query metadata.
- Делает transport-проводку: socket identity, component mutation/request, live projection и named read queries.

## Подключение

```ts
EbcaWsGatewayModule.forRoot({
  namespace: '/game',
  identityField: 'playerId',
  identityEntityName: 'PlayerEntity',
  defaultRoles: ['player'],
  authAdapter: GameWsAuthAdapter,
  inboundNormalizers: [GameResourceBalanceNormalizer],
  projectionPolicies: [GameQuestOfferPolicy],
  audienceResolvers: [GameCityAudienceResolver],
});
```

`identityId` является внутренним именем. Поле наружного envelope задает `identityField`, поэтому существующий клиент может продолжать получать `playerId`, а другой проект может выбрать `accountId`, `actorId` или свое имя.

## Что делает

- `client.hello` — присоединяет socket к комнате identity.
- `client.component` — применяет component mutation через `ComponentManager`, если компонент открыт через `ComponentOptions.inbound`.
- `client.component.request` — возвращает batch exposed-компонентов по entity/collection target.
- `client.query` — вызывает `@EbcaQuery({ gates: ['ws'] })` read repository method.
- `ebca.>` — проецирует lifecycle exposed-компонентов в socket rooms.

## Границы

Game-specific правила остаются в приложении и подключаются adapters/providers:

- auth/token lookup;
- custom inbound normalization;
- custom projection filtering;
- custom audience resolution.
