/**
 * Fonte única da tabela single-table de cada projeto: usada no deploy (infra-service.ts)
 * e no DynamoDB Local (setup-local.ts). Só PK/SK, sem GSI — buscas por outros campos usam lookups.
 */
export const tableNameFor = (project: string, stage: string) => `${project}-${stage}`;

export const singleTableSchema = {
  BillingMode: 'PAY_PER_REQUEST',
  AttributeDefinitions: [
    { AttributeName: 'PK', AttributeType: 'S' },
    { AttributeName: 'SK', AttributeType: 'S' },
  ],
  KeySchema: [
    { AttributeName: 'PK', KeyType: 'HASH' },
    { AttributeName: 'SK', KeyType: 'RANGE' },
  ],
} as const;

/**
 * Atributo de expiração (epoch em segundos). Itens com `ttl` no passado são apagados pelo DynamoDB
 * (com atraso de até ~48h — quem lê deve checar a expiração também). Usado por códigos de login e sessões.
 */
export const ttlAttribute = 'ttl';
