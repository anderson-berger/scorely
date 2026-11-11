/**
 * Orquestra o deploy de todos os projetos. Rode da raiz:
 *   npx serverless deploy --stage dev                  → tudo, infra antes das apis
 *   npx serverless deploy --service=base-infra,base-api → só um projeto
 *
 * Cada `<projeto>-infra` expõe CloudFormation Outputs; `${service:<projeto>-infra.<Output>}`
 * repassa o valor para a api como `${param:...}` e garante que o infra suba primeiro.
 * O dev local NÃO passa por aqui: a api usa o fallback do param (veja apps/<projeto>/api/serverless.ts).
 */
export default {
  services: {
    'base-infra': { path: 'infra/base' },
    'base-api': {
      path: 'apps/base/api',
      params: { tableName: '${service:base-infra.TableName}' },
    },

    'scorely-infra': { path: 'infra/scorely' },
    'scorely-api': {
      path: 'apps/scorely/api',
      params: {
        tableName: '${service:scorely-infra.TableName}',
        uploadsBucket: '${service:scorely-infra.UploadsBucketName}',
      },
    },
  },
};
