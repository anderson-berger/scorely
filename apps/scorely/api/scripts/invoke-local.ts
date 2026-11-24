/**
 * Roda uma função na hora, no dev local (ADR 0012): `npm run invoke:scorely -- <função>`, da raiz, com o
 * `npm run dev:scorely` de pé. Chama a função pela porta de lambda do `serverless offline`, que é quem tem o
 * ambiente local (o `sls invoke local` resolve os parâmetros da infra e o segredo no SSM, e pede a AWS).
 */
import { project } from '@scorely/api/project';

const STAGE = 'dev';

const invoke = async (name: string): Promise<number> => {
  const url = `http://localhost:${project.ports.lambda}/2015-03-31/functions/${project.name}-${STAGE}-${name}/invocations`;
  const response = await fetch(url, { method: 'POST', body: '{}' }).catch((error: unknown) => {
    console.error(`Could not reach serverless offline at ${url}. Is \`npm run dev:scorely\` running?`);
    console.error(error instanceof Error ? error.message : error);
    return undefined;
  });
  if (!response) return 1;
  const body = await response.text();
  console.log(`${name}: HTTP ${response.status}`);
  if (body) console.log(body);
  return response.ok ? 0 : 1;
};

const name = process.argv[2];
if (!name) {
  console.error('Usage: npm run invoke:scorely -- <function name>');
  process.exit(1);
}
process.exit(await invoke(name));
