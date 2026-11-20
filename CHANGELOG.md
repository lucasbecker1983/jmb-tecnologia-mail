# Changelog — JMB Tecnologia Mail

Versão própria (fork) do [Mailflare](https://github.com/hieunc229/mailflare), mantida pela JMB Tecnologia sob a licença AGPLv3.
O histórico do projeto original fica na pasta `changelog/`.

## v2026.11.20-6

- Repositório renomeado para https://github.com/lucasbecker1983/jmb-tecnologia-mail (o endereço antigo `mailflare-jmb` redireciona). Links do rodapé, do `package.json` e do manual atualizados.

## v2026.11.20-5

- Novo nome: **JMB Tecnologia Mail** em todo o app (nome padrão, títulos, remetente dos e-mails do sistema, notificações, convites de agenda, textos em todos os idiomas). O valor antigo "Mailflare" salvo no banco é tratado como "não personalizado".
- Novo ícone nas cores da JMB (azul, verde e roxo): fonte em `brand/icone.svg`, gerador em `brand/gerar-icones.mjs` (ícones normais, maskable, Apple e favicon).
- PWA para celular: manifesto em português ("JMB Mail"), ícones maskable para Android, ícone do iPhone e atalhos (Caixa de entrada, Escrever e-mail, Agenda).
- Rodapé: "JMB Tecnologia Mail vX · Código-fonte", sem link para o site do original.
- Nomes técnicos internos (`mailflare`: Worker, banco, filas, cookies, cabeçalhos `X-Mailflare-*`) mantidos de propósito para não quebrar recebimento, sessões e compatibilidade.
- Manual: instalação no celular, notificações (chaves VAPID) e nome novo.

## v2026.11.20-4

- Idioma padrão agora é **português do Brasil**: quem ainda não escolheu idioma vê o sistema em PT-BR. O inglês continua disponível no seletor de idioma e segue como catálogo base das traduções.

## v2026.11.20-3

- Manual de instalação e uso em português: `manual/MANUAL.md` e `manual/MANUAL.pdf` (gerado com `node manual/gerar-pdf.mjs`).
- README com aviso da versão JMB e link para o manual.
- `wrangler.jsonc` genérico, sem o `database_id` desta instalação, para outras pessoas instalarem na própria conta.

## v2026.11.20-2

- Código-fonte publicado em https://github.com/lucasbecker1983/mailflare-jmb, com link "Código-fonte" no rodapé (exigência da AGPL).
- Removido o workflow `deploy-update.yml` do original, que substituiria todo o código pela versão upstream.

## v2026.11.20-1

Base: Mailflare 0.5.5 (upstream `cec33ee`).

- Todas as funções liberadas em qualquer instalação: contas ilimitadas, caixas compartilhadas, encaminhamento de e-mail e personalização de marca.
- Removida a página de licenças/compras (Admin → Licenses) e os atalhos para ela.
- JMB Tecnologia como autora da versão modificada (package.json e rodapé "Powered by Mailflare · JMB Tecnologia").
- Testes de licença atualizados para o comportamento sem travas.
