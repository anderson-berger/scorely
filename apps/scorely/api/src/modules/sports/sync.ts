import type { CatalogEntry } from '@scorely/api/src/modules/sports/catalog';
import type { SportRepository, StoredSport } from '@scorely/api/src/modules/sports/sport.repository';
import { LocalizedTextSchema, PositionIdSchema, SportIdSchema, type SportPosition } from '@scorely/contracts';

/** ESP-02, 03: todos os problemas do arquivo de uma vez (vazio = válido). */
function problemsOf(entries: readonly CatalogEntry[]): string[] {
  const seen = new Set<string>();
  return entries.flatMap((entry) => {
    const positionIds = new Set<string>();
    const own = [
      ...(SportIdSchema.safeParse(entry.id).success ? [] : [`invalid sport id "${entry.id}"`]),
      ...(seen.has(entry.id) ? [`repeated sport id "${entry.id}"`] : []),
      ...(LocalizedTextSchema.safeParse(entry.name).success
        ? []
        : [`sport "${entry.id}" needs a name in every locale`]),
    ];
    seen.add(entry.id);
    const positions = entry.positions.flatMap((p) => {
      const found = [
        ...(PositionIdSchema.safeParse(p.id).success
          ? []
          : [`invalid position id "${p.id}" in "${entry.id}"`]),
        ...(positionIds.has(p.id) ? [`repeated position "${p.id}" in "${entry.id}"`] : []),
        ...(LocalizedTextSchema.safeParse(p.name).success
          ? []
          : [`position "${p.id}" in "${entry.id}" needs a name in every locale`]),
      ];
      positionIds.add(p.id);
      return found;
    });
    return [...own, ...positions];
  });
}

/** ESP-05, 06: as do arquivo ativas, na ordem dele; as que saíram, desativadas no fim (na ordem que tinham). */
function mergePositions(entry: CatalogEntry, stored: readonly SportPosition[]): SportPosition[] {
  const inFile = new Set(entry.positions.map((p) => p.id));
  return [
    ...entry.positions.map((p) => ({ id: p.id, name: p.name, active: true })),
    ...stored.filter((p) => !inFile.has(p.id)).map((p) => ({ ...p, active: false })),
  ];
}

const sameData = (a: StoredSport, b: StoredSport) =>
  JSON.stringify([a.name, a.positions, a.active, a.order]) ===
  JSON.stringify([b.name, b.positions, b.active, b.order]);

/**
 * `npm run sports:sync` (ESP-01): aplica o arquivo do catálogo no banco. Valida tudo antes de gravar (ESP-02, 03),
 * grava os do arquivo ativos, com `order` = índice (ESP-06), e desativa sem apagar o que saiu (ESP-05).
 * Esporte que não mudou não é gravado de novo (a `version` só sobe quando muda, ADR 0013).
 */
export async function syncCatalog(repo: SportRepository, entries: readonly CatalogEntry[]): Promise<void> {
  const problems = problemsOf(entries);
  if (problems.length > 0) throw new Error(`Invalid sport catalog: ${problems.join('; ')}`);

  const stored = await repo.list();
  const byId = new Map(stored.map((s) => [s.id, s]));
  const inFile = new Set(entries.map((e) => e.id));
  const next: StoredSport[] = [
    ...entries.map((entry, order) => ({
      id: entry.id,
      name: entry.name,
      positions: mergePositions(entry, byId.get(entry.id)?.positions ?? []),
      active: true,
      order,
    })),
    ...stored
      .filter((s) => !inFile.has(s.id))
      .sort((a, b) => a.order - b.order)
      .map((s, i) => ({ ...s, active: false, order: entries.length + i })),
  ];
  for (const sport of next) {
    const before = byId.get(sport.id);
    if (!before || !sameData(before, sport)) await repo.save(sport);
  }
}
