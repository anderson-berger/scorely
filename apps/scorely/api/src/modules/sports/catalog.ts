// O catálogo de esportes (ESP-01): a equipe muda este arquivo, e o `npm run sports:sync` aplica no banco.
// Tudo que está aqui fica ativo; o que sair vira desativado, sem apagar (ESP-05). A ordem é a de exibição (ESP-06).
// O id nunca muda (ESP-02) e o nome vai em todos os idiomas do web (ESP-03).
import type { LocalizedText } from '@scorely/contracts';

export interface CatalogEntry {
  id: string;
  name: LocalizedText;
  positions: { id: string; name: LocalizedText }[];
}

const text = (ptBR: string, en: string): LocalizedText => ({ 'pt-BR': ptBR, en });

export const SPORT_CATALOG: CatalogEntry[] = [
  {
    id: 'volleyball',
    name: text('Vôlei', 'Volleyball'),
    positions: [
      { id: 'setter', name: text('Levantador', 'Setter') },
      { id: 'opposite', name: text('Oposto', 'Opposite') },
      { id: 'outside', name: text('Ponteiro', 'Outside hitter') },
      { id: 'middle', name: text('Central', 'Middle blocker') },
      { id: 'libero', name: text('Líbero', 'Libero') },
    ],
  },
  {
    id: 'soccer',
    name: text('Futebol', 'Soccer'),
    positions: [
      { id: 'goalkeeper', name: text('Goleiro', 'Goalkeeper') },
      { id: 'defender', name: text('Zagueiro', 'Center back') },
      { id: 'fullback', name: text('Lateral', 'Full-back') },
      { id: 'defensive_mid', name: text('Volante', 'Defensive midfielder') },
      { id: 'midfielder', name: text('Meia', 'Midfielder') },
      { id: 'forward', name: text('Atacante', 'Forward') },
    ],
  },
  {
    id: 'basketball',
    name: text('Basquete', 'Basketball'),
    positions: [
      { id: 'guard', name: text('Armador', 'Guard') },
      { id: 'wing', name: text('Ala', 'Wing') },
      { id: 'center', name: text('Pivô', 'Center') },
    ],
  },
];
