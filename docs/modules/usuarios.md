# Módulo Usuários

> **Documento vivo.** Descreve como o módulo funciona **hoje** e por quê. Toda mudança no módulo começa aqui: primeiro muda a regra neste arquivo, depois o código. Conferido com o código em 2026-11-10.

Código: `apps/scorely/api/src/modules/users/`, `apps/scorely/web/src/modules/users/`, `apps/scorely/web/src/lib/preferences.ts`. Contrato: `apps/scorely/contracts/src/users.ts`.

## 1. Para que serve

O perfil de quem usa o scorely: como a pessoa aparece nas listas dos grupos (nome, apelido, foto), em que idioma o app fala com ela e em que fuso ela lê os horários. O gênero é guardado para a divisão de times mista (E3).

## 2. Regras de negócio

### Conta

- **USR-01. A conta é o email.** Ela é criada no primeiro login (AUTH-05 em [auth.md](auth.md)).
  - O email é guardado em minúsculas e sem espaços, e cada email tem uma conta só.
  - O email não muda pelo perfil.
- **USR-02. A conta nasce sem nome.** Enquanto não houver nome, o web leva a pessoa para o perfil (AUTH-13).

### Perfil

- **USR-03. Campos que a pessoa muda** (`PATCH /me`, pelo menos um):
  - nome: de 1 a 80 caracteres;
  - apelido: de 1 a 40 caracteres, e `null` remove;
  - gênero: `M` ou `F`;
  - idioma: `pt-BR` ou `en`;
  - fuso: nome IANA.
- **USR-04. Nome mostrado nas listas:** o apelido, se houver; senão, o nome; senão, o email.
  - _Por quê:_ na pelada todo mundo se conhece pelo apelido.
- **USR-05. O fuso é validado e gravado no nome canônico.** Por exemplo, `Brazil/East` vira `America/Sao_Paulo`.
  - Um fuso inválido é recusado ao gravar.
- **USR-06. Idioma efetivo,** nesta ordem:
  1. o do perfil;
  2. o último usado neste navegador;
  3. o primeiro idioma do navegador: `pt*` vira `pt-BR`, e qualquer outro, `en`.
- **USR-07. Fuso efetivo:** o do perfil. Sem ele, o do navegador.
  - Todos os horários aparecem nesse fuso ([ADR 0006](../decisions/0006-datas-utc-fuso-do-perfil.md)).
  - O fuso do perfil também vira o padrão dos grupos que a pessoa cria (GRP-13 em [grupos.md](grupos.md)).

### Foto de perfil

- **USR-08. A foto de perfil é a mídia de finalidade `avatar`** (512×512, até 2 MB, pública: MID-02 em [midia.md](midia.md)). **Só a própria pessoa** pede o envio, confirma ou remove a foto, pelas rotas `/me/avatar`. O envio, a conferência, a troca e a remoção seguem as regras da mídia.
  - _Por quê:_ a foto aparece pequena nas listas, e as regras do arquivo são as mesmas do logo e da capa do grupo. Por isso ficam num lugar só.
- ~~**USR-09. O envio vai direto para o S3**, por um POST assinado com 5 minutos de validade.~~ Movida em 2026-11-10 para MID-04.
- ~~**USR-10. Ao confirmar, a api confere o arquivo.**~~ Movida em 2026-11-10 para MID-05; os erros `AVATAR_*` viram `MEDIA_*`.
- ~~**USR-11. Trocar ou remover a foto apaga o arquivo anterior.**~~ Movida em 2026-11-10 para MID-09 a MID-11.
- ~~**USR-12. A foto é pública.**~~ Movida em 2026-11-10 para MID-12.

## 3. Como funciona

### Dados

| Item            | Chave                                | Observação                                                              |
| --------------- | ------------------------------------ | ----------------------------------------------------------------------- |
| Usuário         | `USER#<id>` / `META`                 | todos os campos do `UserSchema`, mais `avatarMediaId` (a mídia da foto) |
| Email → usuário | `LOOKUP#USER#EMAIL#<email>` / `META` | email único (USR-01)                                                    |

### Rotas

| Rota                     | Quem   | Regras              |
| ------------------------ | ------ | ------------------- |
| `GET /me`                | logado | —                   |
| `PATCH /me`              | logado | USR-03, 05          |
| `POST /me/avatar/upload` | logado | USR-08 (MID-03, 04) |
| `PUT /me/avatar`         | logado | USR-08 (MID-05–09)  |
| `DELETE /me/avatar`      | logado | USR-08 (MID-10)     |

Erros: `USER_NOT_FOUND` e `USER_CREATE_CONFLICT`. Os da foto vêm da mídia (`MEDIA_NOT_FOUND`, `MEDIA_NOT_UPLOADED` e `MEDIA_INVALID`).

## 4. Limites conhecidos

- Não é possível trocar o email nem apagar a conta.
