// O que os outros módulos usam da mídia (ADR 0021): onde a área guarda a mídia.
/** Onde a área guarda a mídia: só o `<field>MediaId` no item `key` (MID-08); a URL é montada na resposta (MID-12). */
export interface MediaTarget {
  key: { PK: string; SK: string };
  field: 'avatar' | 'logo' | 'cover';
  /** Id ligado agora na área (leitura consistente); relido a cada tentativa. */
  readCurrent(): Promise<string | undefined>;
}
