# Manual do MailFlare JMB

**E-mail, agenda e arquivos com domínio próprio, de graça, na sua conta Cloudflare.**

Versão do manual: novembro de 2026 · Código-fonte: <https://github.com/lucasbecker1983/mailflare-jmb>

---

## 1. O que é

O **MailFlare JMB** é uma versão do [Mailflare](https://github.com/hieunc229/mailflare), um sistema de código aberto de e-mail com domínio próprio (tipo um Google Workspace caseiro), com caixas de e-mail, agenda, agendamentos e arquivos.

A JMB Tecnologia mantém esta versão com **todas as funções liberadas**, sem licença paga:

- contas ilimitadas, cada pessoa com seu próprio login;
- caixas de e-mail pessoais e compartilhadas;
- encaminhamento de e-mail;
- personalização da marca (logo e cores);
- vários domínios na mesma instalação.

O projeto é **distribuído de graça para amigos e parceiros. Ele não é vendido.** O código é aberto, sob a licença AGPLv3 (veja a seção 11).

### Como funciona por dentro

O sistema não roda num servidor seu. Ele roda na **sua conta da Cloudflare**, como um *Worker*:

| Peça | Para que serve | Serviço |
|---|---|---|
| Aplicativo | As telas e a lógica | Cloudflare Workers |
| Banco de dados | Usuários, caixas, mensagens | Cloudflare D1 |
| Arquivos | Corpo dos e-mails, anexos, Drive, backups | Cloudflare R2 |
| Filas | Processar e-mails que chegam e que saem | Cloudflare Queues |
| Receber e-mail | Domínios com DNS na Cloudflare | Cloudflare Email Routing |
| Enviar e-mail (e receber dos outros domínios) | Entrega dos e-mails | Resend |

Você só precisa de um computador para **instalar e atualizar**. Depois disso, tudo fica no ar na Cloudflare.

---

## 2. Quanto custa

Nada, dentro dos limites gratuitos:

| Serviço | Plano gratuito |
|---|---|
| Cloudflare Workers, D1, Queues, Email Routing | Grátis para uso pequeno e médio |
| Cloudflare R2 | 10 GB grátis (a Cloudflare pode pedir um cartão para ativar) |
| Resend | 3 domínios, 100 e-mails por dia e 3.000 por mês, **somando enviados e recebidos** |

O envio de e-mail **pela própria Cloudflare** exige o plano pago de Workers (US$ 5/mês). Este manual usa o **Resend** para enviar, então esse plano **não é necessário**.

---

## 3. O que você precisa

1. **Uma conta na Cloudflare** (gratuita): <https://dash.cloudflare.com>
2. **Um domínio** (ex.: `suaempresa.com.br`). O DNS dele pode estar na Cloudflare ou em outro provedor (Registro.br, Umbler, HostGator etc.), e a seção 7 explica os dois casos.
3. **Uma conta no Resend** (gratuita): <https://resend.com>
4. **Um computador com Linux, macOS ou Windows (WSL)** com:
   - **Node.js 22 ou mais novo** (o Wrangler, ferramenta da Cloudflare, não funciona no Node 20);
   - **git**.

Para conferir:

```bash
node --version   # precisa ser v22 ou maior
git --version
```

---

## 4. Preparar a conta Cloudflare

Faça estes passos uma única vez, no painel da Cloudflare.

### 4.1 Ativar o Workers e escolher o subdomínio

1. Abra **Workers & Pages** no menu lateral.
2. Na primeira vez, a Cloudflare pede um **subdomínio `workers.dev`** para a conta. Escolha um nome seu, como `suaempresa`.
3. O aplicativo vai ficar em `https://mailflare.suaempresa.workers.dev`.

> O nome `mailflare` como subdomínio já pertence a outra conta. Use o nome da sua empresa.

### 4.2 Ativar o R2

1. Abra **R2 Object Storage** no menu lateral.
2. Clique para ativar o serviço e aceite os termos.

### 4.3 Anotar o Account ID

Ele aparece no painel, na lateral direita da página de qualquer domínio, ou na URL (`dash.cloudflare.com/<ACCOUNT_ID>/...`).

### 4.4 Criar os dois tokens

Crie em **Manage Account → Account API Tokens → Create Token**. São **dois tokens diferentes**:

**Token de deploy** (usado só no seu computador, para publicar), com estas permissões na sua conta:

- Workers Scripts: **Edit**
- D1: **Edit**
- Workers R2 Storage: **Edit**
- Queues: **Edit**
- Account Settings: **Read**

**Token de runtime** (o `CF_TOKEN`, que fica guardado dentro do aplicativo). Na política, escolha **Specified Domains** com os domínios que você vai usar e dê:

- DNS: **Edit**
- Zone: **Read**
- Zone Settings: **Edit**
- Email Routing Rules: **Edit**

> Só os domínios com DNS na Cloudflare entram nesse token. Domínios de outros provedores não precisam dele.

> **Segurança:** trate os tokens como senhas. Nunca mande por chat ou e-mail, e nunca coloque num commit. Se vazar, apague o token no painel e crie outro.

---

## 5. Instalar

### 5.1 Baixar o código

```bash
git clone https://github.com/lucasbecker1983/mailflare-jmb.git mailflare
cd mailflare
npm install
```

### 5.2 Guardar os segredos de deploy

Crie o arquivo `.env.deploy` na pasta do projeto. O git já ignora esse arquivo.

```bash
cat > .env.deploy <<'EOF'
CLOUDFLARE_API_TOKEN=cole_aqui_o_token_de_deploy
CLOUDFLARE_ACCOUNT_ID=cole_aqui_o_account_id
EOF
chmod 600 .env.deploy
```

Antes de cada comando de Cloudflare, carregue o arquivo no terminal:

```bash
set -a; . ./.env.deploy; set +a
npx wrangler whoami   # deve mostrar a sua conta
```

### 5.3 Criar o banco, o bucket e as filas

```bash
npx wrangler d1 create mailflare
npx wrangler r2 bucket create mailflare-raw
npx wrangler queues create mailflare-inbound
npx wrangler queues create mailflare-outbound
npx wrangler queues create mailflare-agent
```

O primeiro comando mostra um `database_id`. Se ele perguntar *"Would you like Wrangler to add it on your behalf?"*, responda **não** (N), porque ele usaria o nome errado de ligação. Copie o ID e coloque no `wrangler.jsonc`, dentro de `d1_databases`:

```jsonc
"d1_databases": [
    {
        "binding": "DB",
        "database_name": "mailflare",
        "database_id": "COLE-O-ID-AQUI",
        "migrations_dir": "drizzle/migrations",
    },
],
```

Depois avise o git para não enviar esse ID, que é só da sua instalação:

```bash
git update-index --skip-worktree wrangler.jsonc
```

> **Não mude os nomes** `mailflare`, `mailflare-raw` e das filas. O aplicativo depende deles.

### 5.4 Publicar

```bash
set -a; . ./.env.deploy; set +a
npm run deploy
```

No final aparece o endereço, por exemplo `https://mailflare.suaempresa.workers.dev`.

> **Conta nova na Cloudflare:** nos primeiros minutos a Cloudflare pode responder com erros estranhos, como *"This Worker does not exist"* (10007) ou *"Actor migration tag precondition failed"* (10079). Espere um ou dois minutos e rode `npm run deploy` de novo.

### 5.5 Guardar os segredos do aplicativo

Use `printf ... |` para o valor não ficar no histórico do terminal como argumento:

```bash
set -a; . ./.env.deploy; set +a
printf '%s' 'TOKEN_DE_RUNTIME' | npx wrangler secret put CF_TOKEN
printf '%s' 'https://mailflare.suaempresa.workers.dev' | npx wrangler secret put APP_URL
```

- `CF_TOKEN` é o token de runtime da seção 4.4.
- `APP_URL` é o endereço do seu aplicativo. O Resend usa esse endereço para entregar os e-mails recebidos.

A chave do Resend pode ser colada depois, na própria tela do aplicativo (seção 7).

---

## 6. Primeiro acesso (/setup)

1. Abra `https://mailflare.suaempresa.workers.dev/setup`.
2. Digite o domínio principal e espere a mensagem verde de domínio encontrado.
3. **Deixe a chave "Enable sending" DESLIGADA.** Ligada, ela tenta usar o envio pago da Cloudflare e dá o erro *"Cloudflare API 401 ... code 2036: Unauthorized"*.
4. **Não marque "Skip DNS setup"** se o DNS do domínio estiver na Cloudflare.
5. Crie a conta de administrador e a primeira caixa (ex.: `contato`).

Se aparecer erro, **recarregue a página (F5)** antes de tentar de novo. A página guarda as escolhas da tentativa anterior.

> Se o seu domínio principal **não** está com o DNS na Cloudflare, marque **"Skip DNS setup"** no `/setup` e siga a seção 7.2 depois.

---

## 7. Domínios

Cada domínio usa um caminho diferente para receber, dependendo de onde está o DNS dele. Envio é sempre pelo **Resend**.

| Onde está o DNS do domínio | Recebe por | Envia por |
|---|---|---|
| Na Cloudflare (mesma conta) | Cloudflare Email Routing | Resend |
| Em outro provedor | Resend | Resend |

### 7.0 Chave do Resend

1. Em <https://resend.com/api-keys>, crie uma chave com **Full access**. A chave "Sending access" não deixa o aplicativo cadastrar o domínio sozinho.
2. No aplicativo, em **Admin → Domains**, abra um domínio. No card **Resend**, clique em **Substituir/Salvar chave** e cole a chave.

### 7.1 Domínio com DNS na Cloudflare

O `/setup` já liga o recebimento. Confira estes pontos:

1. **MX de outro serviço:** se o domínio recebia e-mail em outro lugar (Umbler, Locaweb, Google etc.), os MX antigos precisam sair. Remover esses MX **faz o serviço antigo parar de receber**.
2. **SPF:** o registro TXT da raiz que começa com `v=spf1` precisa conter `include:_spf.mx.cloudflare.net`. Com o SPF de outro serviço, a Cloudflare marca o recebimento como *"misconfigured"*.
3. **Envio:** em **Admin → Domains → seu domínio → Setup sending email**, ligue o card **Resend** e clique em **Setup**. Ele cria os registros DKIM e de envio sozinho.

> **Atenção, armadilha:** se o card do Resend mostrar um **MX `receive-...forge.rmta.net` pendente**, **não clique em "Criar DNS ausente"**. Esse MX é de recebimento pelo Resend e, com prioridade 10, ele "rouba" os e-mails da Cloudflare. Nesse caso, desligue o recebimento do domínio no painel do Resend. O envio continua funcionando.
>
> Pelo mesmo motivo, em **"Setup receiving email"** o card ligado deve ser o **Cloudflare**, e não o Resend.

### 7.2 Domínio com DNS em outro provedor

Use para domínios que você não quer mover para a Cloudflare. Você só aponta os registros de e-mail.

1. **Admin → Domains → New domain**: digite o domínio e marque **"Skip DNS setup"**.
2. Abra o domínio na lista:
   - em **"Setup receiving email"**, ligue o card **Resend** e clique em **Setup**;
   - em **"Setup sending email"**, ligue o card **Resend** e clique em **Setup**.
3. A tela lista os registros que faltam: **MX** de recebimento, **TXT** de DKIM e os registros de envio. **Copie cada um no painel do seu provedor de DNS atual** e apague os MX antigos.
4. Volte ao aplicativo e clique em **Check status** até tudo ficar verde. A propagação do DNS pode levar de alguns minutos a algumas horas.

> Aqui o MX do Resend **é o correto**, porque é ele quem recebe esse domínio.

> Trocar o MX faz o provedor antigo parar de receber. Crie as caixas antes e troque o MX por último.

---

## 8. Caixas de e-mail e contas

### 8.1 Criar uma caixa

1. **Admin → Mailboxes → New mailbox**.
2. Escolha o **domínio**, o endereço (ex.: `financeiro`) e o nome de exibição.
3. Escolha o tipo:
   - **Personal inbox:** de uma pessoa só. Escolha o dono.
   - **Shared inbox:** compartilhada. Depois de criar, escolha quais contas acessam.
4. Clique em **Create mailbox**. A regra de recebimento é criada sozinha.

### 8.2 Dar login próprio a uma pessoa

Uma caixa criada para o administrador só abre com o login do administrador. Para alguém entrar direto na própria caixa:

1. **Admin → Accounts → New account**.
2. Escolha o **domínio** e o **usuário** (ex.: `maria`) e defina a senha.
3. Isso cria, ao mesmo tempo, o login `maria@seudominio.com.br` e a caixa dela. A pessoa entra com esse e-mail e essa senha.
4. Para ela também ver uma caixa compartilhada (ex.: `financeiro@`), dê o acesso na própria caixa compartilhada.

### 8.3 Aplicativos de e-mail no celular ou no computador

O sistema usa o protocolo **JMAP**, e **não** tem IMAP/POP. Outlook e o app do Gmail **não funcionam**. Em **Configurações → App passwords** dá para gerar uma senha de aplicativo para clientes compatíveis com JMAP. O jeito mais simples continua sendo o navegador: o site funciona bem no celular e pode ser instalado como app (PWA).

---

## 9. Atualizar

### 9.1 Para quem instalou a partir deste repositório

```bash
cd mailflare
git pull
npm install
set -a; . ./.env.deploy; set +a
npm run deploy
```

Depois abra **Admin** no aplicativo. Se aparecer **"Update database"**, clique para aplicar as mudanças do banco.

Se o `git pull` reclamar do `wrangler.jsonc`, é porque a atualização mudou esse arquivo. Siga estes passos:

1. Libere o arquivo: `git update-index --no-skip-worktree wrangler.jsonc`.
2. Guarde o seu `database_id` e rode `git checkout wrangler.jsonc`.
3. Rode `git pull`.
4. Coloque o ID de volta no `wrangler.jsonc` e rode de novo `git update-index --skip-worktree wrangler.jsonc`.

> **Nunca use o botão "Update Mailflare"** do painel. Ele baixa o Mailflare original e desfaz as liberações desta versão. Nesta versão o mecanismo desse botão foi removido.

### 9.2 Para quem mantém esta versão (JMB)

A pasta local tem dois remotos: `origin` (esta versão) e `upstream` (o Mailflare original).

```bash
git fetch upstream
git log --oneline jmb..upstream/main      # o que mudou no original
git diff jmb...upstream/main --stat
git merge upstream/main                    # resolver conflitos, se houver
node --test $(find tests -name '*.test.mjs')
npm run lint && npm run build
```

Então:

1. Anote as mudanças no `CHANGELOG.md`.
2. Crie a tag `vAAAA.MM.DD-N`.
3. Envie para o GitHub (`git push origin jmb:main` e a tag).
4. Rode `npm run deploy`.

Os pontos que a JMB alterou e que podem dar conflito estão listados no `CHANGELOG.md`. Os principais são:

- `src/lib/licenses/service.ts`
- `src/lib/mailboxes/access-utils.ts`
- `src/components/sidebar-footer.tsx`
- a página `/licenses`, que foi removida

---

## 10. Problemas comuns

| Mensagem ou sintoma | Causa | Solução |
|---|---|---|
| `Please enable R2 through the Cloudflare Dashboard [code: 10042]` | R2 não ativado | Seção 4.2 |
| `could not automatically register "mailflare" as your workers.dev subdomain` | Conta sem subdomínio `workers.dev` | Seção 4.1, depois repita o deploy |
| `This Worker does not exist [code: 10007]` ou `migration tag precondition failed [code: 10079]` | Conta nova, Cloudflare ainda propagando | Espere 1–2 minutos e repita `npm run deploy` |
| `Cloudflare API 401 ... email/sending/subdomains: code 2036` | "Enable sending" ligado (envio pago da Cloudflare) ou MX de outro serviço | Seção 6: desligue "Enable sending" e recarregue a página |
| Recebimento *"misconfigured/locked"* na Cloudflare | SPF de outro serviço | Seção 7.1, item 2 |
| Card do Resend com MX `receive-...forge.rmta.net` pendente, num domínio da Cloudflare | Recebimento ligado no Resend | Seção 7.1, armadilha. **Não** crie o MX |
| `POST /api/inbound/resend` responde 503 | Recebimento pelo Resend ainda não configurado | Normal até o primeiro Setup da seção 7.2 |
| `Set APP_URL to your public address` | Falta o `APP_URL` | Seção 5.5 |
| Não consigo entrar direto numa caixa | Caixa pertence à conta do administrador | Seção 8.2 |

---

## 11. Licença e créditos

- Baseado no **Mailflare**, de Hieu Nguyen (<https://github.com/hieunc229/mailflare>), sob a licença **GNU AGPLv3**.
- Modificações da **JMB Tecnologia**, sob a mesma licença.

O que a AGPLv3 permite e pede (em resumo, sem valor de parecer jurídico):

- Você pode **usar, copiar, modificar e repassar** o sistema.
- Se oferecer o sistema pela internet a outras pessoas, elas têm direito ao **código-fonte da versão que você roda**. O link **"Código-fonte"** no rodapé já aponta para este repositório. Se você modificar o código, publique as suas mudanças e troque esse link.
- Mantenha os créditos e a licença.

Esta versão é **compartilhada gratuitamente** pela JMB Tecnologia com amigos e parceiros, sem venda.
