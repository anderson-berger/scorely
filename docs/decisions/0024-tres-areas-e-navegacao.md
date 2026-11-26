# 0024: três áreas do produto e a navegação da área logada

- Data: 2026-11-26
- Estado: aceita

## Contexto

O scorely não é só gestão de grupos. O dono descreveu três partes (2026-11-26): a **vitrine** (áreas esportivas, quadras, grupos, times, escolinhas, cursos, campeonatos), a **área de quem está logado** (meus grupos, times, campeonatos) e a **área da área esportiva** (a quadra, a escola). O produto mistura rede social e marketplace. A navegação do web foi desenhada só para grupos e mudou três vezes em dois dias (GRV-13).

## Decisão

1. **Três áreas.**
   - **Vitrine**, pública: `scorely.com`, sem exigir login para ver. É o mapa com a lista, por lugar: jogo aberto, "quero jogar", desafio, campeonato, promoção, rei da quadra e destaque pago.
   - **Área logada:** o mesmo app e os mesmos endereços.
   - **Área esportiva:** um produto à parte, em `tenant.scorely.com`, com login próprio.
2. **Uma página por coisa.** O grupo, o lugar e o time têm um endereço só, e o que muda é a relação de quem olha: quem é de fora vê a apresentação, e agir pede o login e volta para a mesma página.
3. **A área logada se organiza por intenção, e não por tipo.**
   - Uma barra lateral fixa, com o sino e a conta no topo, a seção "Meus" e os atalhos dos grupos.
   - Início e Explorar entram nela quando existirem.
   - As áreas de cada coisa (as do grupo) ficam em abas dentro da página dela.

## Por quê

- Separar a vitrine do "meu" é o padrão de quem mistura rede social e marketplace: Playtomic, Airbnb, Strava. Juntar por tipo ("Grupos" com os meus e os abertos) repete a mistura em cada tipo novo.
- A página única faz o link do WhatsApp funcionar para todo mundo e já é como o grupo aberto funciona (GRV-39).
- A barra lateral organizada por intenção cresce com cada área nova sem mudar de forma. O dono a escolheu, entre ela e um cabeçalho, no protótipo de 2026-11-26.
- A área esportiva tem outro público, outro login e outras telas (agenda das quadras, promoções), como o painel de quem anuncia nos marketplaces.

## Consequências

- O web vai ter um layout público (sem login) além do logado, e o guard das rotas passa a deixar as páginas públicas abrirem.
- A api vai ter leituras públicas, sem o authorizer. O que é público, o limite de requisições e a ausência de dado pessoal ficam para um ADR próprio, quando a vitrine começar.
- A vitrine precisa aparecer no Google. Por isso, as páginas públicas vão precisar de SSR ou de pré-renderização quando tiverem conteúdo. Até lá, a SPA basta.
- O lugar é a âncora do mapa: os jogos abertos, os desafios, as promoções e o ranking são de um lugar. O ranking por lugar precisa de uma regra contra resultado falso antes de existir.
- Responde à P2 do [PRODUCT.md](../product/PRODUCT.md): o tenant é a área esportiva, num subdomínio, e não um subdomínio por grupo.
- A forma da barra fica em GRV-13 ([grupos.md](../modules/grupos.md)) e em `.claude/rules/web-visual.md`.
