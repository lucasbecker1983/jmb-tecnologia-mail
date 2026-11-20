# Changelog — JMB Tecnologia Mail

Versão própria (fork) do [Mailflare](https://github.com/hieunc229/mailflare), mantida pela JMB Tecnologia sob a licença AGPLv3.
O histórico do projeto original fica na pasta `changelog/`.

## v2026.11.20-13

- **Receber pela Cloudflare em domínio externo.** Em Administração → Domínios → Configurar o recebimento → Cloudflare Email Routing, o botão deixou de ficar travado em domínios com DNS fora da Cloudflare: agora é **"Verificar e ativar"**, com a explicação de como trazer o DNS para a Cloudflare. Quando o DNS já está na conta, o domínio é reconhecido, o MX antigo é trocado (com confirmação) e o roteamento é ligado.
- Mensagens claras quando a zona já foi criada na Cloudflare mas os nameservers ainda não foram trocados ou ainda não ativaram, em vez de culpar o token.
- Manual: nova seção 7.2.1 (passar um domínio externo para receber pela Cloudflare).

## v2026.11.20-12

- Removido o botão "Upgrade" do topo das páginas (caixa de entrada, agenda, arquivos, configurações e administração) e o aviso de "licença necessária" da tela de contas. Nesta versão não existe plano pago.

## v2026.11.20-11

- O endereço raiz (ex.: `webmail.infinitytea.com.br`) vai direto para o login, ou para a caixa de entrada se já houver sessão. A página de apresentação do projeto original deixou de aparecer.
- Login em `webmail.<domínio>` (domínio cadastrado no app): o campo mostra `@domínio` fixo e basta digitar o usuário; e-mail completo também é aceito. O domínio é decidido no servidor.
- Campo de senha do login com botão mostrar/ocultar.
- Acesso por `http://` agora redireciona para `https://` em todos os endereços do webmail. Os domínios de clientes (Cloudflare for SaaS) não recebiam o redirecionamento HTTPS da zona.

## v2026.11.20-10

- Corrigido: domínio adicionado com "Pular configuração de DNS" e DNS fora da Cloudflare dava "Zone not found" nos botões "Configurar". Agora ele é convertido em externo (ativo, sem o aviso de DNS pulado) e a mensagem diz em qual provedor criar os registros.

## v2026.11.20-9

- Envios pela reserva Maileroo saem com `tracking: false` (sem reescrever links nem pixel de abertura).
- Reserva ativada na instalação JMB: domínio `jmbtecnologia.com.br` verificado no Maileroo e chave de envio configurada. Teste real: DKIM do domínio e DMARC passando, link intacto, In-Reply-To/References preservados, chegada em ~2,6 s; o Maileroo recusa Message-ID próprio (já descartado pelo código).

## v2026.11.20-8

- **Maileroo como reserva do Resend.** Se o Resend recusar por limite (429), chave (401/403) ou falha dele (5xx), a mensagem sai pelo Maileroo na mesma tentativa; erro de rede repete o Resend uma vez com a mesma chave de idempotência antes da reserva; erro da própria mensagem (400/422) nunca vai para a reserva. Chaves: `MAILEROO_SENDING_KEYS` (JSON domínio→chave) ou `MAILEROO_API_KEY`. Cada uso da reserva fica no log.
- **Recebimento pelo Maileroo** em `/api/inbound/maileroo?token=…` (secret `MAILEROO_WEBHOOK_TOKEN`): baixa a mensagem original, usa o mesmo processamento do Resend, valida e apaga a cópia no Maileroo depois de entregar.
- Limitações: o Maileroo não preserva o Message-ID (respostas podem não agrupar na conversa); mapeamento de imagens inline não documentado.
- Manual: seção 7.3. Testes: `tests/maileroo.test.mjs`.

## v2026.11.20-7

- **Domínios fora da Cloudflare detectados automaticamente.** Ao adicionar um domínio, o sistema consulta a zona na Cloudflare; se ela não existir, consulta os servidores NS, mostra onde está o DNS (Registro.br, Umbler, Locaweb, HostGator, GoDaddy e outros) e grava o domínio como externo: ativo, recebendo e enviando pelo Resend, com a configuração do Resend disparada sozinha. Vale no painel, no onboarding, no primeiro `/setup` e na API.
- Domínio com NS da Cloudflare mas sem zona visível para o token gera um aviso para ajustar o `CF_TOKEN`, em vez de virar externo. Erros da API da Cloudflare continuam aparecendo.
- Corrigido: um resultado atrasado da verificação de domínio podia mostrar "Zone not found" depois de ligar "Pular configuração de DNS".
- "Pular configuração de DNS" traduzido; descrição do diálogo de domínio atualizada.
- Testes novos em `tests/domain-external-dns.test.mjs`.

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
