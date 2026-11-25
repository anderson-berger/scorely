import { fileURLToPath } from 'node:url';

/** Tudo o que o script grava fica no andamento do `/task`, fora do git (tem os tokens da conta de dev). */
export const OUTPUT_DIR = fileURLToPath(new URL('../../../../.claude/work/screens/', import.meta.url));

export const FILES = {
  report: `${OUTPUT_DIR}report.md`,
  /** Tokens da conta, reaproveitados entre rodadas: pedir código tem limite (AUTH-02). */
  session: `${OUTPUT_DIR}session.json`,
  storageState: `${OUTPUT_DIR}storage-state.json`,
  ids: `${OUTPUT_DIR}ids.json`,
};
