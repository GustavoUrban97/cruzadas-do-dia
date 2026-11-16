# Cruzadas do Dia

Palavras cruzadas diárias no estilo **cruzada direta** (dicas dentro da grade, com setas), para resolver à caneta (S Pen) no Galaxy Tab S9, como na revista. Grade de 13×17, um puzzle novo por dia, trocando à meia-noite de Brasília.

Página web estática (HTML, CSS e JavaScript puro), publicada no GitHub Pages e usada direto no Chrome do tablet. Abre sem internet e avisa quando há versão nova.

## Rodar localmente

Os módulos JavaScript não funcionam abrindo o `index.html` direto do disco; é preciso um servidor:

```bash
python3 -m http.server 8000
```

Abra `http://localhost:8000`. Para abrir um dia específico: `http://localhost:8000/?data=2026-11-07`.

## Adicionar puzzles

1. Crie `puzzles/AAAA-MM-DD.json` seguindo o formato de `puzzles/2026-11-07.json`: grade 13×17, `#` = casa de dica, letras maiúsculas sem acento. Cada dica diz em que casa fica (`linha`, `coluna`) e a direção da seta (`direita`, `baixo`, `baixo-direita` ou `direita-baixo`); no máximo 2 dicas por casa. Detalhes no `CLAUDE.md`.
2. Rode `python3 tools/validar.py`. Ele confere se toda palavra tem dica, se as setas e respostas batem com a grade e regenera `puzzles/index.json`.
3. Faça commit e push. O GitHub Actions valida de novo a cada push.

## Usar no tablet

Abra https://gustavourban97.github.io/cruzadas-do-dia/ no Chrome. A tinta fica salva neste aparelho e neste navegador.

- Quando aparecer **"Atualização disponível"**, toque para recarregar com a versão nova.
- O ícone de gráfico abre **Meu histórico**: estatísticas, calendário (tocar num dia abre aquele puzzle) e backup. Exporte o backup de vez em quando: a tinta fica só neste aparelho.
- `?debug=1` no fim do endereço mostra os eventos da caneta (diagnóstico).
- `?data=AAAA-MM-DD` abre um dia específico (dias passados mostram o gabarito).
- `?hoje=AAAA-MM-DD` finge que hoje é outra data (para testar).

## Publicar uma versão nova

A cada mudança em HTML, CSS ou JS, suba a `VERSAO` em `sw.js` e em `js/app.js` (as duas iguais). É isso que faz o tablet perceber a versão nova.
