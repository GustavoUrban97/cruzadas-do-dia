# Cruzadas do Dia

Palavras cruzadas diárias para resolver à caneta (S Pen) no Galaxy Tab S9, como a cruzada do jornal. Um puzzle novo por dia, trocando à meia-noite de Brasília.

App web estático (HTML, CSS e JavaScript puro), publicado no GitHub Pages e instalável como PWA.

## Rodar localmente

Os módulos JavaScript não funcionam abrindo o `index.html` direto do disco; é preciso um servidor:

```bash
python3 -m http.server 8000
```

Abra `http://localhost:8000`. Para abrir um dia específico: `http://localhost:8000/?data=2026-11-07`.

## Adicionar puzzles

1. Crie `puzzles/AAAA-MM-DD.json` seguindo o formato de `puzzles/2026-11-07.json` (`#` = casa preta, letras maiúsculas sem acento).
2. Rode `python3 tools/validar.py`. Ele confere grade, dicas e numeração e regenera `puzzles/index.json`.
3. Faça commit e push. O GitHub Actions valida de novo a cada push.

## Instalar no tablet

1. Abra o endereço do GitHub Pages no Chrome do tablet.
2. Menu ⋮ → **Adicionar à tela inicial** (disponível como app instalável a partir da Etapa 4).
