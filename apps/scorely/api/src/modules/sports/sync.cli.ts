// `npm run sports:sync` (ESP-01): aplica o `catalog.ts` no banco do stage. No dev local, o `db:setup` chama este
// comando depois de criar a tabela. Em outro stage: `STAGE=prod npm run sports:sync -w @scorely/api` com as
// credenciais da AWS. A tabela sai do stage (`<projeto>-<stage>`), a não ser que `TABLE_NAME` já venha definida.
import { tableNameFor } from '@scorely/api/project';
import { SPORT_CATALOG } from '@scorely/api/src/modules/sports/catalog';
import { dynamoSportRepository } from '@scorely/api/src/modules/sports/sport.repository';
import { syncCatalog } from '@scorely/api/src/modules/sports/sync';

process.env.TABLE_NAME ??= tableNameFor(process.env.STAGE ?? 'dev');

async function main() {
  await syncCatalog(dynamoSportRepository, SPORT_CATALOG);
  console.log(`sports:sync ${process.env.TABLE_NAME}: ${SPORT_CATALOG.length} sports in the catalog`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
