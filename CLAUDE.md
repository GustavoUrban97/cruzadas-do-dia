# Cruzadas do Dia — PWA para S Pen

App web pessoal de palavras cruzadas diárias, feito para ser resolvido **à caneta (S Pen) no Samsung Galaxy Tab S9**, com a sensação de fazer a cruzada do jornal no papel. Um puzzle novo por dia, trocando à 00h (horário de Brasília), no espírito do Termo.

Publicado no **GitHub Pages** (repositório público) e instalado no tablet como PWA ("Adicionar à tela inicial" no Chrome). Uso exclusivamente pessoal: sem login, sem backend, sem servidor próprio.

## Como trabalhar neste projeto

- Antes de implementar cada etapa, apresente o plano (arquivos, decisões, dúvidas) e espere aprovação.
- Agrupe as mudanças por etapa em vez de fazer alterações picadas.
- Comentários e textos da interface em português do Brasil.
- Ao final de cada etapa, rode o validador e um servidor local (`python3 -m http.server`) e diga como testar no tablet.
- Faça commits por etapa, com mensagens em português.

## Princípio central: é papel, não formulário

- O app **não reconhece** a escrita e **não valida** respostas durante o jogo. Ele só guarda os traços.
- A grade e a coluna de dicas são uma folha onde se desenha livremente: letra no quadrado, palpite pequeno no canto, rabisco, riscar dica resolvida.
- Conferir é como no jornal: o **gabarito de ontem** fica disponível no dia seguinte, e há um botão **Revelar** opcional para o puzzle atual.

## Stack

- **HTML + CSS + JavaScript puro (ES modules), sem etapa de build.** O GitHub Pages serve os arquivos como estão. Sem frameworks e sem npm no app.
- PWA: `manifest.webmanifest` (nome, ícones 192/512, `display: standalone`, `orientation: any`, cor de fundo papel) e `sw.js` (service worker).
- Persistência local: **IndexedDB** para a tinta (um registro por data). `localStorage` só para preferências leves (ferramenta ativa etc.). Sempre com try/catch.
- Alvo: Chrome no Android 14+ (Tab S9). Não precisa suportar outros navegadores, mas não deve quebrar no Chrome desktop (útil para desenvolver com mouse).

## Estrutura do repositório

```
index.html
manifest.webmanifest
sw.js
css/estilo.css
js/app.js          # inicialização, roteamento por data
js/grade.js        # renderiza grade e dicas, calcula numeração
js/tinta.js        # captura e desenho dos traços
js/armazenamento.js# IndexedDB
js/datas.js        # "hoje" em America/Sao_Paulo, formatação
icones/
puzzles/
  index.json       # lista de datas disponíveis (gerado pelo validador)
  2026-11-07.json
tools/
  validar.py
  gerar_grade.py
.github/workflows/validar.yml
```

## Entrada (o ponto mais importante)

Usar **Pointer Events** (`pointerType`):

| Entrada | Comportamento |
|---|---|
| `pen` | Desenha com a ferramenta ativa |
| `pen` com borracha (`buttons & 32`) ou botão lateral pressionado | Apaga traços tocados |
| `touch` (dedo/palma) | **Nunca desenha** (rejeição de palma). Serve para rolar, zoom com pinça e tocar na barra de ferramentas |
| `mouse` | Desenha (só para desenvolver no PC) |

- O botão lateral da S Pen pode chegar com valores diferentes de `buttons`/`button` dependendo do Chrome. Na Etapa 2, criar uma tela de diagnóstico (`?debug=1`) que mostra os eventos recebidos, para eu testar no tablet e ajustarmos.
- Baixa latência: canvas com `getContext('2d', { desynchronized: true })`, `touch-action: none` na área de desenho, `getCoalescedEvents()` para traço suave e, se ajudar, `pointerrawupdate`. Redesenhar só o segmento novo durante o traço (não a tela toda a cada evento), e usar `requestAnimationFrame`.
- Canvas dimensionado com `devicePixelRatio` para não ficar borrado.
- Pressão (`pressure`) influencia levemente a espessura.
- Ferramentas na barra: **Caneta** (preta, padrão), **Lápis** (cinza, mais fino, para palpites), **Borracha**, **Desfazer**, **Refazer**.
- A borracha apaga o traço inteiro tocado (estilo Samsung Notes), não pixel a pixel.

## Layout

- Paisagem: grade à esquerda (o maior possível), dicas à direita. Retrato: grade em cima, dicas embaixo.
- Visual de jornal: fundo papel (off-white), linhas finas pretas, casas pretas sólidas, números pequenos no canto superior esquerdo, dicas em fonte serifada, títulos "Horizontais" e "Verticais".
- Uma camada de tinta cobrindo grade e dicas (as duas áreas aceitam escrita).
- Traços salvos em **coordenadas normalizadas** relativas à área em que foram feitos (grade ou dicas), para continuarem no lugar ao girar a tela ou redimensionar.
- Cabeçalho: data por extenso ("domingo, 15 de novembro de 2026") e número do puzzle.
- Sem rolagem acidental nem zoom do navegador ao escrever (`user-scalable=no` no viewport é aceitável aqui).

## Ciclo diário

- "Hoje" = data atual em `America/Sao_Paulo`, via `Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' })` (formato AAAA-MM-DD). Nunca usar a data UTC.
- Puzzle do dia: `puzzles/AAAA-MM-DD.json`. Se a data não estiver em `puzzles/index.json`, usar um fallback determinístico (dias desde uma data inicial, ciclando pelos puzzles disponíveis) e mostrar um aviso discreto de que o banco precisa de puzzles novos.
- Se o app estiver aberto na virada da meia-noite (checar a cada minuto e ao voltar ao primeiro plano via `visibilitychange`), mostrar "Novo puzzle disponível" sem trocar à força no meio de um traço.
- A tinta de cada dia é salva por data, ao fim de cada traço.

## Offline e atualizações

- Service worker com cache do "casco" do app (HTML, CSS, JS, ícones).
- Puzzles e `index.json`: estratégia *network-first* com fallback para cache, para pegar puzzles novos assim que eu fizer push, mas abrir offline.
- Pré-carregar no cache os puzzles dos próximos 7 dias quando houver rede.
- Versionar o cache (`const VERSAO = 'v1'`) e limpar caches antigos na ativação. Quando houver versão nova do app, mostrar "Atualização disponível, toque para recarregar".

## Gabarito, revelar e histórico

- **Gabarito de ontem:** mostra a grade de ontem com as respostas sobrepostas à tinta que fiz (em vermelho, levemente transparentes).
- **Revelar (hoje):** pede confirmação e mostra as respostas sobrepostas. Opções: revelar uma casa, uma palavra ou tudo.
- **Marcar como feito:** registro manual. Sequência de dias feitos.
- **Histórico:** lista/calendário dos dias anteriores com miniatura da grade rabiscada; tocar abre o puzzle daquele dia (editável).
- **Backup:** exportar toda a tinta e o histórico como um arquivo JSON e importar de volta (proteção caso os dados do Chrome sejam apagados).

## Formato do puzzle (JSON)

```json
{
  "id": 1,
  "data": "2026-11-07",
  "titulo": "Mini do sábado",
  "autor": "Gustavo",
  "largura": 5,
  "altura": 5,
  "grade": ["#SOPA", "SABES", "ENTRA", "ITENS", "SARA#"],
  "dicas": {
    "horizontais": [
      { "numero": 1, "texto": "Caldo servido quente na entrada do jantar", "resposta": "SOPA" }
    ],
    "verticais": [
      { "numero": 1, "texto": "___ Catarina, estado do Sul", "resposta": "SANTA" }
    ]
  }
}
```

- `#` = casa preta. Letras maiúsculas sem acento (padrão de cruzadas brasileiras).
- A numeração é **calculada pelo app** a partir da grade (numera a casa que inicia palavra horizontal ou vertical de 2+ letras). O `numero` das dicas deve bater; o validador confere.
- Tamanhos: 5×5 no início, mas o layout não deve assumir 5×5 (prever até 15×15).
- O repositório é público, então as respostas ficam visíveis no código. Isso é aceito; não é preciso ofuscar.

## Conteúdo: pasta `tools/`

Scripts Python, fora do app:

1. `validar.py` — lê todos os JSON de `puzzles/` e falha se: linhas da grade com tamanhos diferentes; palavra da grade sem dica (ou vice-versa); `resposta` não bate com a grade; numeração não bate; palavra repetida no mesmo puzzle; datas duplicadas ou nome do arquivo diferente do campo `data`. Ao final, **regenera `puzzles/index.json`** com a lista ordenada de datas.
2. `gerar_grade.py` — preenche um padrão de casas pretas com palavras comuns em português (lista de frequência, por exemplo o pacote `wordfreq`, removendo acentos), sem repetir palavras, e gera o JSON com as dicas em branco para eu (ou uma IA) escrever.
3. Dicas escritas em lotes (um mês por vez) e revisadas por mim. Não copiar puzzles de revistas, jornais ou apps.

## GitHub Pages e CI

- Publicação: Settings → Pages → *Deploy from a branch* → `main`, pasta `/` (raiz). Sem build.
- Usar sempre caminhos relativos (o site roda em `/<nome-do-repo>/`, não na raiz do domínio). O `start_url` e o `scope` do manifest também relativos.
- `.github/workflows/validar.yml`: a cada push e pull request, roda `python3 tools/validar.py` e falha se algum puzzle estiver inválido ou se `index.json` estiver desatualizado.
- Incluir um `README.md` curto: o que é, como rodar localmente, como adicionar puzzles, como instalar no tablet.

## Etapas

1. **Esqueleto:** estrutura de pastas, `index.html`, leitura do puzzle de exemplo, grade e dicas em estilo jornal (sem tinta), cálculo de "hoje" em Brasília. `tools/validar.py` e o workflow. Publicar no Pages e abrir no tablet.
2. **Tinta:** desenho com caneta, rejeição de palma, borracha (ferramenta e botão), lápis, desfazer/refazer, pressão, tela de diagnóstico `?debug=1`. Testar latência no Tab S9.
3. **Persistência e ciclo diário:** IndexedDB por data, virada da meia-noite, fallback de puzzle.
4. **PWA:** manifest, ícones, service worker, offline, aviso de atualização.
5. **Conferência:** gabarito de ontem, revelar (casa/palavra/tudo), marcar como feito.
6. **Histórico e backup:** lista com miniaturas, sequência, exportar/importar.
7. **Conteúdo:** `gerar_grade.py` e um banco inicial de 30 puzzles.

## Critérios de aceite

- Apoiar a palma na tela enquanto escrevo não gera nenhum traço.
- O traço acompanha a caneta sem atraso perceptível no Tab S9.
- Fechar o app (ou reiniciar o tablet) e reabrir mantém exatamente o que escrevi.
- Girar a tela mantém cada traço no quadrado onde foi escrito.
- À 00h de Brasília aparece um puzzle novo, e o de ontem continua acessível com gabarito.
- Instalado pela tela inicial, abre em tela cheia e funciona sem internet.
- Um push com puzzles novos chega ao tablet sem eu precisar reinstalar nada.

## Fora do escopo (por enquanto)

Reconhecimento de escrita, modo teclado, celular, sincronização entre aparelhos, contas, compartilhamento de resultado.
