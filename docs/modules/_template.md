# Módulo <Nome>

> **Documento vivo.** Descreve como o módulo funciona **hoje** e por quê. Toda mudança no módulo começa aqui: primeiro muda a regra neste arquivo, depois o código. Conferido com o código em AAAA-MM-DD.

Código: `apps/<projeto>/api/src/modules/<modulo>/`, `apps/<projeto>/web/src/modules/<modulo>/`. Contrato: `apps/<projeto>/contracts/src/<modulo>.ts`.

## 1. Para que serve

<Que problema da pessoa o módulo resolve, em 2 ou 3 frases. O caso de referência, se houver.>

| Termo   | Significado |
| ------- | ----------- |
| <termo> | <...>       |

## 2. Regras de negócio

### <Assunto>

- **<PRE>-01. <Regra em uma frase.>** <O detalhe: quando vale, o que acontece e o erro (`CODIGO`, status).>
  - _Por quê:_ <o motivo, quando a regra vem de uma escolha e não é óbvia.>

## 3. Como funciona

### Dados

| Item   | Chave           | Para quê |
| ------ | --------------- | -------- |
| <item> | `<PK>` / `<SK>` | <...>    |

### Rotas

| Rota            | Quem   | Regras   |
| --------------- | ------ | -------- |
| `<MÉTODO /...>` | <quem> | <PRE>-NN |

Erros: <códigos do catálogo>.

## 4. Limites conhecidos

- <...>

## 5. Em discussão (ainda não é regra)

- <...>
