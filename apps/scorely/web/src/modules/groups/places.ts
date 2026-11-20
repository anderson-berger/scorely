import type { Place, PlaceAddress } from '@scorely/contracts';

/** Um par lat/lng válido (GRP-60), ou nada. */
function coords(lat: number, lng: number): { lat: number; lng: number } | undefined {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return undefined;
  return { lat, lng };
}

const NUMBER = String.raw`-?\d{1,3}(?:\.\d+)?`;

/** As formas em que um link do Google Maps (ou um texto colado) traz o ponto, da mais precisa para a menos. */
const PATTERNS: RegExp[] = [
  // O ponto exato do lugar: `!3d-23.5!4d-46.6`.
  new RegExp(`!3d(${NUMBER})!4d(${NUMBER})`),
  // `?q=-23.5,-46.6`, `&ll=...`, `query=...`, `destination=...`.
  new RegExp(String.raw`[?&](?:q|ll|query|destination|center)=(${NUMBER}),\s*(${NUMBER})`),
  // O centro do mapa: `/@-23.5,-46.6,17z`.
  new RegExp(`@(${NUMBER}),(${NUMBER})`),
  // Coordenadas soltas: "-23.5, -46.6".
  new RegExp(String.raw`^\s*(${NUMBER})\s*,\s*(${NUMBER})\s*$`),
];

/**
 * GRP-60: o ponto de um link completo do Google Maps (ou de coordenadas coladas). O link curto (`maps.app.goo.gl`)
 * não traz as coordenadas: volta `undefined`, e a tela pede o link completo.
 */
export function coordsFromLink(text: string): { lat: number; lng: number } | undefined {
  const decoded = (() => {
    try {
      return decodeURIComponent(text.trim());
    } catch {
      return text.trim();
    }
  })();
  for (const pattern of PATTERNS) {
    const match = decoded.match(pattern);
    const found = match && coords(Number(match[1]), Number(match[2]));
    if (found) return found;
  }
  return undefined;
}

/** GRP-60: link curto do Maps, que não dá para ler (a tela mostra a dica própria). */
export function isShortMapsLink(text: string): boolean {
  return /(^|\/\/)(maps\.app\.goo\.gl|goo\.gl\/maps)\//i.test(text.trim());
}

/** GRP-63: o caminho até o lugar no app de mapa da pessoa, sem custo. */
export function routeUrl(place: Pick<Place, 'lat' | 'lng'>): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}`;
}

/** GRP-63: "Rua X, 10 · Bairro · Cidade/UF". */
export function addressLine(address: PlaceAddress | Place['address']): string {
  const street = [address.street, address.number].filter(Boolean).join(', ');
  return [street, address.district, `${address.city}/${address.state}`].filter(Boolean).join(' · ');
}

/** GRP-61, 62: os ativos (o padrão primeiro) e os arquivados, cada parte na ordem da api. */
export function placeSections(
  places: readonly Place[],
  defaultPlaceId: string | undefined,
): { active: Place[]; archived: Place[] } {
  const active = places.filter((p) => !p.archivedAt);
  return {
    active: [
      ...active.filter((p) => p.id === defaultPlaceId),
      ...active.filter((p) => p.id !== defaultPlaceId),
    ],
    archived: places.filter((p) => p.archivedAt),
  };
}
