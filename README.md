# bazar

## Atualizar produtos

Edite a lista `PRODUCTS` em [`bazar-app/src/app/products/product-data.ts`](bazar-app/src/app/products/product-data.ts). Cada produto inclui slug, nome, categoria, preço em reais, resumo, descrição, imagem de capa (`image`), galeria de imagens (`images`), estado, material, dimensões e unidades disponíveis.

Adicione as imagens em `bazar-app/src/assets/products/`, atualize `image` com a imagem de capa e liste os caminhos na propriedade `images` na ordem desejada para o carrossel. Cada slug deve ser único; ele identifica o endereço da página de detalhes (`/produto/<slug>`).

Após editar `product-data.ts`, reinicie `npm run start:api` para o Node carregar os novos produtos, slugs e preços. O frontend em desenvolvimento (`npm run start:dev` ou `ionic serve`) recompila o catálogo; se não atualizar, reinicie esse servidor e recarregue a página. Para atualizar o site estático servido pelo Node em `www`, execute `npm run build` antes de iniciar/reiniciar a API. O catálogo atual usa produtos e ilustrações de exemplo. O checkout integrado com InfinitePay aceita pagamento integral ou sinal de 30%.

## Status de reserva (Node.js + SQLite)

O status de reserva fica no SQLite do servidor Node, não no navegador. A API mostra o status atual com `GET /api/reservations/<slug>`. Alterações usam `PUT /api/reservations/<slug>` com o corpo `{"reserved": true}` ou `{"reserved": false}` e o cabeçalho `Authorization: Bearer <RESERVATION_ADMIN_KEY>`. Configure `RESERVATION_ADMIN_KEY` somente no ambiente do servidor; não coloque essa chave no Angular. A confirmação de pagamento é feita pelo servidor com a API oficial `payment_check` da InfinitePay. O retorno do navegador, sozinho, nunca marca um item como reservado.

Requer Node.js 22.13 ou mais recente (`node:sqlite`, suporte a remoção de tipos TypeScript e `--env-file-if-exists`). O arquivo de banco e as tabelas são criados automaticamente quando a API inicia. Em hospedagem, configure `DB_PATH` para um disco persistente. O mesmo servidor Node pode servir a build Angular e a API:

1. `npm run build`
2. Configure `RESERVATION_ADMIN_KEY` no ambiente do servidor.
3. Configure `INFINITEPAY_HANDLE` com sua InfiniteTag, sem `$`.
4. Configure `INFINITEPAY_REDIRECT_URL` com a URL absoluta da página de retorno, por exemplo `https://seu-dominio.com/pagamento/retorno`.
5. Configure `INFINITEPAY_API_KEY` no servidor. Ela é necessária para aplicar as opções de repasse de taxas de parcelamento e pagamento único.
6. Execute `npm run start:api`.

Ative o Checkout Integrado na conta InfinitePay. O servidor envia o payload para `https://api.checkout.infinitepay.io/links` e redireciona o comprador para o link retornado. O payload usa `assured_installments: 0` para repassar ao comprador as taxas de todas as parcelas, além de limitar o link a um pagamento. A InfinitePay exige pagamento mínimo de R$ 1,00; o botão de sinal de 30% fica desativado se o valor calculado for menor, e a API também rejeita valores abaixo do mínimo. Antes de ir ao checkout, o comprador informa um celular brasileiro com DDD. O servidor normaliza e guarda esse número junto ao pedido no SQLite; ele não é enviado à InfinitePay nem fica exposto em endpoints públicos. Após o retorno do comprador, o servidor confirma o pagamento via `payment_check` antes de marcar o item como reservado; a página mostra uma confirmação visual com o item reservado quando recebe aprovação. Não há webhook; se o comprador não retornar ao site após pagar, a confirmação não será processada automaticamente. Se a consulta de disponibilidade ou a criação do checkout falhar, o site abre uma conversa no WhatsApp `+55 47 99262-6735` com o nome e código do item. Nunca coloque a API Key ou `RESERVATION_ADMIN_KEY` no Angular. O sinal de 30% reserva o item após aprovação; o valor restante não é cobrado automaticamente por este fluxo. Para evitar pagamentos duplicados, um pedido pendente reutiliza o link existente; um checkout em andamento impede a criação de outro link para o mesmo item.

Para consultar os contatos de pedidos aprovados, use `GET /api/admin/orders` com `Authorization: Bearer <RESERVATION_ADMIN_KEY>`. A resposta inclui o celular, item, valor, identificador da fatura e um link do WhatsApp com uma mensagem pronta para o comprador; são retornados no máximo os 100 pedidos aprovados mais recentes. Por exemplo, no PowerShell:

```powershell
curl.exe -H "Authorization: Bearer SUA_CHAVE_ADMIN" https://seu-dominio.com/api/admin/orders
```

Proteja essa chave e consulte a rota apenas de um ambiente administrativo. A atualização do banco existente adiciona a coluna do telefone automaticamente ao iniciar a API. O link do WhatsApp apenas abre a conversa e preenche o texto; é necessário revisar e enviar manualmente. Não há envio automático nem link direto de recibo; isso exigiria uma integração de WhatsApp Business e suporte de recibo disponibilizado pela InfinitePay.

Consulte a [documentação oficial do Checkout Integrado da InfinitePay](https://www.infinitepay.io/checkout-documentacao) para habilitar a integração e configurar as credenciais na conta.

Para desenvolvimento local, inicie `npm run start:api` em um terminal e `npm run start:dev` em outro; o proxy Angular encaminha `/api` para o Node. O `ionic serve` também usa esse proxy por padrão; reinicie um servidor já aberto para carregar a configuração. Teste o backend com `npm run test:api`.

### Testar checkout e banco local

1. Edite `bazar-app/.env` e preencha `INFINITEPAY_HANDLE` e `INFINITEPAY_API_KEY`. Para testar o retorno local, mantenha `INFINITEPAY_REDIRECT_URL=http://localhost:4200/pagamento/retorno`. Não compartilhe nem faça commit desse arquivo.
2. Em um terminal, dentro de `bazar-app`, execute `npm run start:api`.
3. Em outro terminal, no mesmo diretório, execute `npm run start:dev`.
4. Abra `http://localhost:4200/produto/poltrona-nuvem`, escolha o pagamento e conclua o checkout. Ao voltar, a página chamará o servidor para verificar o pagamento antes de marcar o item como reservado.

O SQLite de teste fica em `bazar-app/server/data/reservations.local.sqlite`; as tabelas são criadas automaticamente, sem instalar MySQL ou executar SQL manual. O endereço de retorno é acessado pelo navegador do comprador; se a InfinitePay não aceitar `localhost` como `redirect_url`, use uma URL HTTPS pública de túnel apontada para a porta `4200`.

