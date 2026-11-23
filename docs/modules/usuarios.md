# Módulo Usuários

> **Documento vivo.** Descreve como o módulo funciona **hoje** e por quê. Toda mudança no módulo começa aqui: primeiro muda a regra neste arquivo, depois o código. Conferido com o código em 2026-11-23.

Código: `apps/scorely/api/src/modules/users/`, `apps/scorely/web/src/modules/users/`, `apps/scorely/web/src/lib/preferences.ts`. Contrato: `apps/scorely/contracts/src/users.ts`.

## 1. Para que serve

O perfil de quem usa o scorely: como a pessoa aparece nas listas dos grupos (nome, apelido, foto), em que idioma o app fala com ela e em que fuso ela lê os horários. O gênero é guardado para a divisão de times mista (E3).

Os dados da pessoa ficam em três partes, cada uma com quem pode ler:

| Parte        | O que tem                         | Quem lê                                                |
| ------------ | --------------------------------- | ------------------------------------------------------ |
| Perfil       | id público, apelido, gênero, foto | a própria pessoa e os outros módulos (listas, times)   |
| Privado      | o email e o nome da conta         | só o login (auth) e a própria pessoa (`GET /me`)       |
| Preferências | idioma e fuso                     | a própria pessoa (e o navegador dela guarda uma cópia) |

## 2. Regras de negócio

### Conta

- **USR-01. A conta é o email.** Ela é criada no primeiro login (AUTH-05 em [auth.md](auth.md)).
  - O email é guardado em minúsculas e sem espaços, e cada email tem uma conta só.
  - O email não muda pelo perfil.
- **USR-13. O email e o nome ficam fora do perfil.** Os dois são guardados à parte, na parte privada, e só o login e a própria pessoa (`GET /me`) os leem. Quando outro módulo busca pessoas (membros, lista do jogo, times, ranking), nenhum dos dois vem junto.
  - _Por quê:_ o email é o dado mais sensível da conta, e o nome completo não serve para os outros (na pelada todo mundo é o apelido, USR-04). Guardados longe do perfil, um erro numa resposta de lista não tem como vazá-los.
  - _Alterada em 2026-11-14:_ antes só o email ficava à parte, e o nome ia para o ranking, os times e a configuração de times.
  - Na resposta da própria pessoa (`GET /me`, `PATCH /me`, as rotas da foto e o login), o email e o nome vêm dentro de `private`, e não na raiz. A raiz é o perfil, igual ao que os outros veem; `private` e `preferences` só a própria pessoa recebe.
    - _Por quê:_ a fronteira fica no formato da resposta, sem depender de comentário: o que está na raiz é público, e o que está agrupado é só da pessoa.
    - _Alterada em 2026-11-20:_ antes o email e o nome vinham na raiz, misturados com o perfil.
- **USR-15. Cada pessoa tem um id público, o código de amigo.** São 8 caracteres de letras maiúsculas e dígitos, sem `I`, `L`, `O` e `U` (ex.: `7K3QX9TA`).
  - Nasce no primeiro login, é único e não muda.
  - A pessoa vê o próprio código no perfil, com um botão para copiar.
  - _Por quê:_ é o jeito de identificar uma pessoa para as outras sem expor nada da conta. Curto e sem letras que se confundem, dá para ditar ou copiar (como o código de amigo da Steam).
- **USR-16. O id do sistema nunca aparece para outra pessoa.** Toda resposta da api identifica pessoas pelo id público: membros, lista do jogo, jogadores, times, times opostos, o dono do grupo e o endereço da foto (MID-12 em [midia.md](midia.md)).
  - O id do sistema só existe no token do login e no banco. Nem o `GET /me` o devolve: o `id` da pessoa, para ela mesma, também é o público.
  - _Por quê:_ o id do sistema é a chave de tudo da pessoa no banco. Mantido só do lado do servidor, ele não vira parte da api, e o código público pode ganhar usos (convite, busca) sem abrir a chave interna.
- **USR-17. Quem a ação atinge sai do login ou do id público.**
  - Ação sobre a própria pessoa (perfil, foto, preferências, sair do grupo) usa só o id do login: as rotas `/me` não recebem id nenhum.
  - Ação sobre outra pessoa (remover membro, convite para membro, posições, times, times opostos) recebe o id público, e a api traduz para o id do sistema na entrada. A permissão continua vindo do login (quem pede), nunca do id recebido.
  - Id público que não existe responde o mesmo erro de uma pessoa que não está no grupo (ex.: `GROUP_MEMBER_NOT_FOUND`).
  - _Por quê:_ editar a si mesmo pelo login garante que ninguém edita o perfil de outro mudando um id. E o erro igual não deixa ninguém descobrir, chutando, se um código existe.
- **USR-02. A conta nasce com o apelido igual ao código de amigo** (USR-15) e sem nome. Enquanto o apelido for igual ao código, o web leva a pessoa para o perfil (AUTH-13).
  - _Por quê:_ o apelido nunca fica vazio, então nenhuma lista precisa de um "sem nome". O código já é público, é único e não depende de idioma; um apelido gerado ("Craque Azul") ninguém trocaria, e um tirado do email vazaria o email (USR-13).
  - _Alterada em 2026-11-14:_ antes a conta nascia sem nome, e o web cobrava o nome.

### Perfil

- **USR-03. Campos que a pessoa muda** (`PATCH /me`, pelo menos um):
  - nome: de 1 a 80 caracteres. É opcional enquanto a pessoa nunca preencheu; depois de preenchido, pode ser trocado, mas não volta a ficar vazio;
  - apelido: de 1 a 40 caracteres. Ele é obrigatório, não pode ser removido e não pode ser o código de amigo da própria pessoa (`USER_NICKNAME_IS_PUBLIC_ID`, 422), porque esse é o apelido de quem ainda não escolheu (USR-02);
  - gênero: `M` ou `F`;
  - idioma: `pt-BR` ou `en`;
  - fuso: nome IANA.
  - _Alterada em 2026-11-14:_ o nome não pode mais ser apagado, e o apelido não pode ser o código.
- **USR-04. Nome mostrado é sempre o apelido,** para os outros e para a própria pessoa (cabeçalho, perfil). O nome só aparece para a própria pessoa, no perfil (USR-13).
  - _Por quê:_ na pelada todo mundo se conhece pelo apelido.
  - _Alterada em 2026-11-12:_ antes dizia que as listas caíam para o email, o que o código nunca fez.
  - _Alterada em 2026-11-14:_ antes, sem apelido, aparecia o nome. O ranking, os times e a configuração de times mostravam o nome mesmo com apelido.
- **USR-05. O fuso é validado e gravado no nome canônico.** Por exemplo, `Brazil/East` vira `America/Sao_Paulo`.
  - Um fuso inválido é recusado ao gravar.
- **USR-06. Idioma efetivo,** nesta ordem:
  1. o das preferências da pessoa;
  2. o último usado neste navegador;
  3. o primeiro idioma do navegador: `pt*` vira `pt-BR`, e qualquer outro, `en`.
- **USR-07. Fuso efetivo:** o das preferências da pessoa. Sem ele, o do navegador.
  - Todos os horários aparecem nesse fuso ([ADR 0006](../decisions/0006-datas-utc-fuso-do-perfil.md)).
  - _(Alterada em 2026-11-21: saiu "esse fuso também vira o padrão dos grupos que a pessoa cria", porque o grupo não tem mais fuso, GRV-01.)_
- **USR-14. O navegador guarda as preferências e só troca quando chegam outras.**
  - O app já abre no idioma e no fuso guardados, sem esperar o servidor.
  - As preferências vêm do servidor em três momentos: no login, ao salvar o perfil e a cada renovação da sessão (no máximo a cada 1 h, AUTH-07). Se vierem iguais às guardadas, nada muda na tela.
  - Mudou num aparelho: os outros passam a usar na próxima renovação da sessão.
  - Ao sair da conta, o navegador volta para o idioma da tela de login (USR-06, passos 2 e 3) e para o fuso dele.
  - _Por quê:_ idioma e fuso quase nunca mudam. Perguntar ao servidor a cada abertura só atrasaria a tela, e a renovação da sessão já acontece de qualquer jeito.

- **USR-18. Salvar o perfil manda a versão que a tela mostrou.** O `GET /me` traz a `version` do perfil, e o `PATCH /me` exige a mesma. Toda mudança pelo `PATCH /me` (apelido, nome, gênero, idioma ou fuso) soma 1 nela. Se o perfil mudou antes (em outro aparelho, por exemplo), a resposta é `VERSION_CONFLICT` (409, `details.currentVersion`), e nada é gravado. A tela relê o perfil e avisa: "Seu perfil mudou em outro lugar. Atualizamos; faça a mudança de novo." Trocar ou remover a foto não manda versão (USR-08), mas também soma 1 nela. A resposta traz a versão nova, e o próximo `PATCH /me` vai com ela. _(Nova em 2026-11-15; alterada em 2026-11-23: a foto também soma.)_
  - _Por quê:_ com dois aparelhos abertos, salvar no segundo apagaria o que foi mudado no primeiro ([ADR 0016](../decisions/0016-version-confere-nas-edicoes.md)). A foto soma porque toda alteração do item soma ([ADR 0013](../decisions/0013-version-e-updatedat.md)). Se a resposta da foto trouxesse a versão de antes, o próximo `PATCH /me` daria um `VERSION_CONFLICT` falso.

### Foto de perfil

- **USR-08. A foto de perfil é a mídia de finalidade `avatar`** (512×512, até 2 MB, pública: MID-02 em [midia.md](midia.md)). **Só a própria pessoa** pede o envio, confirma ou remove a foto, pelas rotas `/me/avatar`. O envio, a conferência, a troca e a remoção seguem as regras da mídia. Confirmar e remover devolvem a pessoa como ficou, já com a `version` somada (USR-18). Remover sem foto ou confirmar de novo a foto que já está ligada (MID-07) não muda nada, nem a `version`.
  - _Por quê:_ a foto aparece pequena nas listas, e as regras do arquivo são as mesmas do logo e da capa do grupo. Por isso ficam num lugar só.
- ~~**USR-09. O envio vai direto para o S3**, por um POST assinado com 5 minutos de validade.~~ Movida em 2026-11-10 para MID-04.
- ~~**USR-10. Ao confirmar, a api confere o arquivo.**~~ Movida em 2026-11-10 para MID-05; os erros `AVATAR_*` viram `MEDIA_*`.
- ~~**USR-11. Trocar ou remover a foto apaga o arquivo anterior.**~~ Movida em 2026-11-10 para MID-09 a MID-11.
- ~~**USR-12. A foto é pública.**~~ Movida em 2026-11-10 para MID-12.

## 3. Como funciona

### Dados

| Item                 | Chave                                    | Observação                                                                                                                        |
| -------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Perfil               | `USER#<id>` / `META`                     | `id`, `publicId` (USR-15), `nickname` (USR-02), `gender` e `avatarMediaId` (a mídia da foto; a URL é montada na resposta, MID-12) |
| Privado              | `USER#<id>` / `PRIVATE`                  | `email` e `name` (USR-13). Lido só pelo auth e pelo `GET /me`                                                                     |
| Preferências         | `USER#<id>` / `PREFERENCES`              | `locale`, `timeZone` (USR-06, 07, 14)                                                                                             |
| Email → usuário      | `LOOKUP#USER#EMAIL#<email>` / `META`     | email único (USR-01)                                                                                                              |
| Id público → usuário | `LOOKUP#USER#PUBLIC#<publicId>` / `META` | código único (USR-15); a tradução da entrada (USR-17)                                                                             |

- O `<email>` da chave do lookup já vem normalizado (USR-01): quem monta a chave normaliza, como no código de login (AUTH-01).
- **Só o perfil (`META`) é entidade:** tem `createdAt`, `updatedAt` e `version` ([ADR 0013](../decisions/0013-version-e-updatedat.md)). A parte privada e as preferências não são entidades: têm só o `createdAt`, sem `updatedAt` nem `version`, como os lookups.
  - _Por quê:_ toda mudança pelo `PATCH /me` soma 1 na `version` do perfil, mesmo quando muda só o nome ou o fuso (USR-18). Essa `version` já conta as mudanças da pessoa inteira. A dos outros dois itens subia junto e nada a conferia: era só ruído.
  - _Alterada em 2026-11-20:_ antes os três itens tinham `updatedAt` e `version`.

O primeiro login grava o perfil (com o apelido igual ao código), a parte privada, as preferências (vazias) e os dois lookups numa transação só. Os três itens da pessoa existem sempre: o `PATCH /me` só altera, nunca cria. Se o código sorteado já existir, a transação falha e o login sorteia outro (até 3 vezes). O `PATCH /me` grava no perfil, na parte privada e nas preferências, cada campo na sua parte, também numa transação.

Os outros módulos leem pessoas pelo `UserDirectory`, que só busca o perfil (`META`). Ele também traduz ids públicos para ids do sistema (USR-17); o que não existe fica de fora, e o módulo responde o erro de pessoa fora do grupo.

### Rotas

| Rota                     | Quem   | Regras              |
| ------------------------ | ------ | ------------------- |
| `GET /me`                | logado | USR-13, 14          |
| `PATCH /me`              | logado | USR-03, 05, 14, 18  |
| `POST /me/avatar/upload` | logado | USR-08 (MID-03, 04) |
| `PUT /me/avatar`         | logado | USR-08 (MID-05–09)  |
| `DELETE /me/avatar`      | logado | USR-08 (MID-10)     |

O `GET /me`, o `PATCH /me`, as rotas da foto e o login (`POST /auth/verify`, campo `user`) devolvem a pessoa no mesmo formato:

```json
{
  "id": "7K3M9QXZ",
  "nickname": "Fulaninho",
  "gender": "M",
  "avatarUrl": "https://…/public/avatar/<mediaId>",
  "createdAt": "…",
  "version": 3,
  "private": { "email": "fulano@exemplo.com", "name": "Fulano" },
  "preferences": { "locale": "pt-BR", "timeZone": "America/Sao_Paulo" }
}
```

- A raiz é o perfil (`id` = id público, USR-16) e a `version` dele (USR-18). `private` traz o email e o nome (USR-13); `preferences`, o idioma e o fuso (USR-14).
- A resposta tem só esses campos: ela é montada campo a campo a partir do contrato, e nada do banco sai sem estar nele (nem o `updatedAt`, nem campo novo do perfil).
  - _Por quê:_ espalhar o item do banco na resposta fazia todo campo novo gravado no perfil sair no `/me` sem ninguém decidir.
  - _Alterada em 2026-11-20:_ antes a resposta espalhava o item do perfil, e o `updatedAt` saía fora do contrato.

O corpo do `PATCH /me` tem o mesmo formato: `{ version, nickname?, gender?, private?: { name? }, preferences?: { locale?, timeZone? } }`. Pelo menos um campo tem que mudar (USR-03); um grupo vazio (`preferences: {}`) não conta como mudança.

Nas rotas dos outros módulos, todo `{userId}` e todo `userId` do corpo é o id público, e a pessoa vem com o `nickname` (USR-04). O `name` e o `email` só existem no `private` das respostas da própria pessoa: nenhuma outra resposta tem esse campo para uma pessoa com conta (USR-13).

Erros: `VERSION_CONFLICT` (409, USR-18), `USER_CREATE_CONFLICT`, `USER_NICKNAME_IS_PUBLIC_ID` (422, USR-03) e `SESSION_INVALID` (401) quando a conta do token não existe mais (AUTH-16 em [auth.md](auth.md)). Os da foto vêm da mídia (`MEDIA_NOT_FOUND`, `MEDIA_NOT_UPLOADED` e `MEDIA_INVALID`).

## 4. Limites conhecidos

- Não é possível trocar o email nem apagar a conta.
- Preferência mudada em outro aparelho demora até 1 h para chegar (USR-14).
- O email ainda aparece em texto nas chaves do login (`LOOKUP#USER#EMAIL#<email>`, `AUTH#CODE#<email>`). Decisão de 2026-11-12: fica assim por enquanto.

## 5. Em discussão (ainda não é regra)

- **Convidar pelo código de amigo:** o dono convida alguém que já tem conta digitando o id público dele (USR-15), sem link nem email. Depende das regras de convite dos grupos.
- **Trocar o código de amigo:** gerar outro se o atual for parar onde não devia.
