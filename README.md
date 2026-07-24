# Financial Analytics

Dashboard financeiro desenvolvido para importar e analisar duas bases em Excel:

- **FINR020 / Registros de duplicatas**: emissões, notas fiscais, valores e clientes.
- **Conciliação e Contas a Receber**: recebimentos das abas mensais, separados por banco.

## Recursos

- Importação local de `.xlsx` e `.xls`.
- Indicadores de receita emitida, recebido, diferença do período e ticket médio.
- Comparativo mensal clicável.
- Ranking de clientes.
- Recebimentos por banco.
- Listagem detalhada de emissões e recebimentos.
- Filtros por ano, mês e cliente.
- Persistência local no navegador.
- Modo de demonstração sem dados reais.

## Privacidade

As planilhas são processadas no navegador. Nenhum dado é enviado para uma API ou servidor pelo projeto.

## Executar localmente

```bash
npm install
npm run dev
```

Abra `http://localhost:3000`.

## Gerar versão de produção

```bash
npm run build
npm start
```

## Publicar na Vercel

1. Envie esta pasta para um repositório no GitHub.
2. Importe o repositório na Vercel.
3. Framework: Next.js.
4. Build command: `npm run build`.
5. Output: padrão do Next.js.

Não é necessário configurar banco de dados ou variáveis de ambiente.
