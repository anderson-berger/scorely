import { describe, expect, it } from 'vitest';
import { emptyDraft, moveTo, setTeamCount, type TeamsDraft, teamIndexOf } from './teams';

const ANA = 'a0000000-0000-4000-8000-000000000001';
const BIA = 'a0000000-0000-4000-8000-000000000002';
const CAI = 'a0000000-0000-4000-8000-000000000003';
const DUDA = 'a0000000-0000-4000-8000-000000000004';

const draft = (teams: string[][]): TeamsDraft => ({ teams, positions: {} });

describe('Montar times', () => {
  it('TIM-14: "Montar times" cria o rascunho com 2 times vazios e sem ajustes de posição', () => {
    expect(emptyDraft()).toEqual({ teams: [[], []], positions: {} });
  });
});

describe('mover alguém', () => {
  it('TIM-14: quem está sem time vai para o time escolhido', () => {
    const next = moveTo(draft([[ANA], []]), BIA, 1);
    expect(teamIndexOf(next, BIA)).toBe(1);
    expect(next.teams).toEqual([[ANA], [BIA]]);
  });

  it('TIM-14: quem entra num time vai para o fim dele', () => {
    const next = moveTo(draft([[ANA, BIA], []]), CAI, 0);
    expect(next.teams[0]).toEqual([ANA, BIA, CAI]);
  });

  it('TIM-14: trocar de time tira a pessoa do time antigo (uma pessoa num time só, TIM-08)', () => {
    const next = moveTo(draft([[ANA, BIA], [CAI]]), ANA, 1);
    expect(next.teams).toEqual([[BIA], [CAI, ANA]]);
    expect(next.teams.flat().filter((id) => id === ANA)).toHaveLength(1);
  });

  it('TIM-14: "Sem time" ou "Tirar dos times" tira a pessoa de todos os times', () => {
    const next = moveTo(draft([[ANA, BIA], [CAI]]), BIA, undefined);
    expect(teamIndexOf(next, BIA)).toBeUndefined();
    expect(next.teams).toEqual([[ANA], [CAI]]);
  });

  it('TIM-14: mover mantém os outros times como estavam', () => {
    const next = moveTo(draft([[ANA], [BIA], [CAI]]), DUDA, 2);
    expect(next.teams).toEqual([[ANA], [BIA], [CAI, DUDA]]);
  });

  it('TIM-14: teamIndexOf diz o time da pessoa (0 = Time 1) ou nada se está sem time', () => {
    const current = draft([[ANA], [BIA]]);
    expect(teamIndexOf(current, ANA)).toBe(0);
    expect(teamIndexOf(current, BIA)).toBe(1);
    expect(teamIndexOf(current, CAI)).toBeUndefined();
  });
});

describe('Times: − N +', () => {
  it('TIM-14: aumentar a quantidade acrescenta times vazios no fim, sem mexer nos outros', () => {
    const next = setTeamCount(draft([[ANA], [BIA]]), 3);
    expect(next.teams).toEqual([[ANA], [BIA], []]);
  });

  it('TIM-14: ao diminuir, quem estava no time que sumiu vai para "sem time"', () => {
    const next = setTeamCount(draft([[ANA], [BIA], [CAI, DUDA]]), 2);
    expect(next.teams).toEqual([[ANA], [BIA]]);
    expect(teamIndexOf(next, CAI)).toBeUndefined();
    expect(teamIndexOf(next, DUDA)).toBeUndefined();
  });

  it('TIM-14: diminuir vários de uma vez tira todos os times que sumiram', () => {
    const next = setTeamCount(draft([[ANA], [BIA], [CAI], [DUDA]]), 2);
    expect(next.teams).toEqual([[ANA], [BIA]]);
  });

  it('TIM-14: mudar a quantidade mantém os ajustes de posição do jogo', () => {
    const current: TeamsDraft = { teams: [[ANA], [BIA]], positions: { [ANA]: ['setter'] } };
    expect(setTeamCount(current, 3).positions).toEqual({ [ANA]: ['setter'] });
  });
});
