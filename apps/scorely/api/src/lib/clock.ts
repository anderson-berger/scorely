/** A hora atual, o relógio de produção. As regras recebem o `now` pelas deps (os testes passam o seu). */
export function systemNow(): Date {
  return new Date();
}
