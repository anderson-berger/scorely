# Módulo Mídia

> **Documento vivo.** Descreve como o módulo funciona **hoje** e por quê. Toda mudança no módulo começa aqui: primeiro muda a regra neste arquivo, depois o código. Conferido com o código em 2026-11-10.

Código: `apps/scorely/api/src/modules/media/`, `apps/scorely/api/src/lib/storage.ts`, `apps/scorely/web/src/lib/media.ts`. Contrato: `apps/scorely/contracts/src/media.ts`.

## 1. Para que serve

Guardar os arquivos enviados pelas pessoas (por enquanto, só imagens) do mesmo jeito em qualquer área: perfil, grupo e, depois, time e campeonato. O módulo cuida **do arquivo**: o envio, a conferência, os dados no banco, a troca e a remoção.

**Quem pode** enviar ou trocar é decisão da área. A foto de perfil é da própria pessoa (USR-08 em [usuarios.md](usuarios.md)), e o logo e a capa são do dono do grupo (GRP-35 em [grupos.md](grupos.md)).

| Termo      | Significado                                                                          |
| ---------- | ------------------------------------------------------------------------------------ |
| Mídia      | um arquivo guardado, com os dados dele no banco. Hoje só existe o tipo `image`       |
| Finalidade | para que serve a mídia (`avatar`, `group.logo`, `group.cover`). Ela define as regras |
| Dono       | a quem a mídia pertence: um usuário ou um grupo (`ownerType` + `ownerId`)            |
| Envio      | o arquivo indo do navegador direto para o S3, antes de a api conferir                |

## 2. Regras de negócio

### Quem decide o quê

- **MID-01. A mídia não decide quem pode.** A área confere a permissão e só então chama a mídia.
  - A conferência acontece **nos dois passos**: ao pedir o envio e ao confirmar.
  - _Por quê:_ cada área tem as suas regras de quem pode (a própria pessoa, o dono, um futuro admin). Um papel novo muda só a área, e a mídia continua igual. Conferir de novo ao confirmar barra quem perdeu o papel no meio do envio.
- **MID-02. Cada finalidade tem a sua política**, e a mídia aplica a política sem exceção:

  | Finalidade    | Dono    | Quantas | Tamanho final | Formatos          | Peso máximo | Ao trocar      | Acesso  |
  | ------------- | ------- | ------- | ------------- | ----------------- | ----------- | -------------- | ------- |
  | `avatar`      | usuário | 1       | 512×512       | WebP, JPEG ou PNG | 2 MB        | apaga a antiga | pública |
  | `group.logo`  | grupo   | 1       | 512×512       | WebP, JPEG ou PNG | 2 MB        | apaga a antiga | pública |
  | `group.cover` | grupo   | 1       | 1600×600      | WebP, JPEG ou PNG | 2 MB        | apaga a antiga | pública |
  - Uma imagem nova em qualquer área é uma linha nesta tabela, e não um fluxo novo.

### Enviar e confirmar

- **MID-03. O navegador prepara a imagem antes de enviar:** recorta no centro, deixa no tamanho final da finalidade e converte para WebP (ou JPEG, se o navegador não fizer WebP).
  - _Por quê:_ um arquivo leve e já no tamanho certo deixa as telas rápidas e evita processamento no servidor.
- **MID-04. Pedir o envio** registra a mídia no banco como **pendente** e devolve um POST assinado, com 5 minutos de validade, para o S3.
  - O arquivo vai para uma área temporária, e a api escolhe o nome. A pessoa não escolhe onde o arquivo fica.
  - Uma mídia pendente vence em 1 hora. Confirmar depois disso responde `MEDIA_NOT_FOUND` (404).
- **MID-05. Ao confirmar, a api confere o arquivo de verdade**, lendo o próprio arquivo e não o que o navegador declarou:
  - o arquivo precisa existir; senão, a resposta é `MEDIA_NOT_UPLOADED` (404);
  - o formato real precisa ser um dos aceitos;
  - o peso não pode passar do máximo;
  - a largura e a altura precisam ser **exatamente** as da finalidade.
  - Se o arquivo reprova, ele é apagado e a resposta é `MEDIA_INVALID` (422, `details: { maxBytes, width, height }`).
  - Uma mídia de outro dono, de outra finalidade, inexistente ou vencida responde `MEDIA_NOT_FOUND`, sem dizer qual foi o caso.
  - _Por quê:_ o banco guarda o formato, o peso e as dimensões, e esses dados só servem se forem verdadeiros. O navegador pode mentir.
- **MID-06. Confirmar grava os dados da mídia no banco:** formato, peso, largura, altura, quem enviou (`uploadedBy`) e quando. A mídia passa de pendente a **pronta**.
- **MID-07. Confirmar de novo uma mídia que já está pronta e ligada não muda nada,** e devolve a mesma URL. Vale também quando as duas confirmações chegam ao mesmo tempo: a segunda não apaga nada, nem o arquivo no ar.
  - _Por quê:_ o navegador pode repetir a chamada depois de uma falha de rede.

### Trocar e remover

- **MID-08. A troca é tudo ou nada.** No banco, ou a mídia nova fica pronta, ligada à área e a antiga sai, ou nada muda.
  - Se duas trocas acontecerem ao mesmo tempo, só uma vale.
- **MID-09. Trocar apaga a antiga, no banco e no S3,** quando a política da finalidade manda (hoje, todas as finalidades).
  - _Por quê:_ economiza espaço, e hoje não há uso para o histórico. Se um dia houver, a regra muda para a finalidade que precisar.
- **MID-10. Remover** desliga a mídia da área e a apaga do banco e do S3. A área fica sem imagem.
  - Remover sem imagem ligada não faz nada. Dois pedidos de remover ao mesmo tempo também não dão erro: o segundo encontra a área sem imagem.
- **MID-11. Se apagar o arquivo no S3 falhar, a troca ou a remoção continuam valendo.** A falha fica no log.

### Acesso

- **MID-12. Mídia pública:** qualquer pessoa com a URL vê. Só a pasta pública do bucket é aberta.
  - Cada troca gera uma URL nova, então nenhum cache mostra a imagem antiga.
- **MID-13. Envios que nunca foram confirmados somem sozinhos:** o arquivo temporário é apagado pelo S3 em 1 dia, e a mídia pendente, pelo TTL do banco.

## 3. Como funciona

### Dados

| Item  | Chave                 | Para quê                                                                                                                                                                                                                             |
| ----- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Mídia | `MEDIA#<id>` / `META` | `kind`, `purpose`, `ownerType`, `ownerId`, `status` (`pending`/`ready`), `key`, `contentType`, `size`, `width`, `height`, `uploadedBy`. Na pendente, também `expiresAt` e `ttl` ([ADR 0004](../decisions/0004-ttl-com-expiresat.md)) |

A área guarda o id e a URL da mídia no próprio item: `avatarMediaId` e `avatarUrl` no usuário; `logoMediaId`, `logoUrl`, `coverMediaId` e `coverUrl` no grupo. Esses campos são gravados na mesma transação da troca (MID-08), então nunca ficam diferentes da mídia.

### Arquivos (um bucket por projeto e stage)

```
tmp/<mediaId>                                              envio ainda não confirmado; o S3 apaga em 1 dia (MID-13)
public/<ownerType>/<ownerId>/<purpose>/<mediaId>.<ext>     leitura pública (MID-12)
private/...                                                reservado para mídias com acesso restrito (ainda sem uso)
```

### Como as áreas usam

1. A rota é da área (por exemplo, `PUT /groups/{id}/images/logo`). O service da área confere a permissão (MID-01).
2. O service da área chama `media.requestUpload(...)` ou `media.attach(...)`.
3. No `attach`, a área informa como se ligar à mídia (o item e os campos dela). A mídia monta a transação inteira: a mídia nova pronta, a área atualizada e a antiga apagada.

### Rotas

A mídia não tem rotas próprias. As rotas ficam nas áreas:

| Área     | Rotas                                                                                                                                           |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Usuários | `POST /me/avatar/upload`, `PUT /me/avatar`, `DELETE /me/avatar`                                                                                 |
| Grupos   | `POST /groups/{id}/images/{slot}/upload`, `PUT /groups/{id}/images/{slot}`, `DELETE /groups/{id}/images/{slot}`, com `slot` = `logo` ou `cover` |

Erros: `MEDIA_NOT_FOUND`, `MEDIA_NOT_UPLOADED` e `MEDIA_INVALID`.

## 4. Limites conhecidos

- Só imagens. Vídeo e PDF entram como `kind` novo quando forem necessários.
- Não há lista das mídias de um dono: cada área guarda o id da sua. Isso muda quando vier uma finalidade com várias mídias (as fotos de campeonato).
- Se o dono deixar de existir, as mídias dele não são apagadas. Hoje não dá para apagar conta nem grupo.
- O S3 local (S3Mock) não aplica o peso máximo no envio nem a limpeza do `tmp/`. Lá, quem barra é a conferência da MID-05.
- Se outras trocas entrarem no meio três vezes seguidas, a troca ou a remoção desiste com erro 500. É uma corrida contínua, rara demais para ser um caso de negócio.

## 5. Em discussão (ainda não é regra)

- Fotos de campeonato: várias por campeonato, com uma variante com marca d'água pública e o original em `private/`, liberado por pagamento. Isso depende de um módulo de pagamento e de uma Lambda de processamento de imagem.
