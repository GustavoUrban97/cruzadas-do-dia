#!/usr/bin/env python3
"""Valida todos os puzzles de puzzles/ e regenera puzzles/index.json.

Uso:  python3 tools/validar.py

Sai com código 1 se algum puzzle estiver inválido. A regra de numeração
é a mesma de js/grade.js (calcularNumeracao); as duas precisam bater.
"""

import json
import re
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
PASTA = RAIZ / "puzzles"
INDICE = PASTA / "index.json"
PRETA = "#"
NOME_ARQUIVO = re.compile(r"^\d{4}-\d{2}-\d{2}\.json$")
LINHA_VALIDA = re.compile(r"^[A-Z#]+$")


def calcular_numeracao(grade):
    """Retorna (horizontais, verticais): listas de (numero, resposta)."""
    altura, largura = len(grade), len(grade[0])

    def eh_letra(l, c):
        return 0 <= l < altura and 0 <= c < largura and grade[l][c] != PRETA

    def ler(l, c, dl, dc):
        palavra = ""
        while eh_letra(l, c):
            palavra += grade[l][c]
            l, c = l + dl, c + dc
        return palavra

    horizontais, verticais = [], []
    proximo = 1
    for l in range(altura):
        for c in range(largura):
            if not eh_letra(l, c):
                continue
            inicia_h = not eh_letra(l, c - 1) and eh_letra(l, c + 1)
            inicia_v = not eh_letra(l - 1, c) and eh_letra(l + 1, c)
            if not (inicia_h or inicia_v):
                continue
            if inicia_h:
                horizontais.append((proximo, ler(l, c, 0, 1)))
            if inicia_v:
                verticais.append((proximo, ler(l, c, 1, 0)))
            proximo += 1
    return horizontais, verticais


def conferir_dicas(nome_lista, esperadas, dicas, erros):
    if not isinstance(dicas, list):
        erros.append(f"dicas.{nome_lista} precisa ser uma lista")
        return
    por_numero = {}
    for dica in dicas:
        numero = dica.get("numero")
        if numero in por_numero:
            erros.append(f"{nome_lista}: número {numero} aparece em duas dicas")
        por_numero[numero] = dica
        if not str(dica.get("texto", "")).strip():
            erros.append(f"{nome_lista} {numero}: texto da dica vazio")

    numeros_grade = {n for n, _ in esperadas}
    for numero, palavra in esperadas:
        dica = por_numero.get(numero)
        if dica is None:
            erros.append(f"{nome_lista} {numero} ({palavra}): palavra da grade sem dica")
        elif dica.get("resposta") != palavra:
            erros.append(
                f"{nome_lista} {numero}: resposta \"{dica.get('resposta')}\" "
                f"não bate com a grade (\"{palavra}\")"
            )
    for numero in por_numero:
        if numero not in numeros_grade:
            erros.append(f"{nome_lista} {numero}: dica sem palavra correspondente na grade")

    ordem = [d.get("numero") for d in dicas]
    if ordem != sorted(ordem, key=lambda x: (x is None, x)):
        erros.append(f"{nome_lista}: dicas fora de ordem numérica")


def validar_puzzle(caminho):
    """Retorna (puzzle ou None, lista de erros)."""
    erros = []
    try:
        puzzle = json.loads(caminho.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        return None, [f"JSON inválido: {e}"]

    for campo in ("id", "data", "titulo", "largura", "altura", "grade", "dicas"):
        if campo not in puzzle:
            erros.append(f"campo obrigatório ausente: {campo}")
    if erros:
        return puzzle, erros

    if caminho.stem != puzzle["data"]:
        erros.append(f"nome do arquivo ({caminho.stem}) diferente do campo data ({puzzle['data']})")

    grade = puzzle["grade"]
    if not isinstance(grade, list) or not grade:
        return puzzle, erros + ["grade vazia ou não é lista"]

    tamanhos = {len(linha) for linha in grade}
    if len(tamanhos) != 1:
        return puzzle, erros + [f"linhas da grade com tamanhos diferentes: {sorted(tamanhos)}"]
    if len(grade) != puzzle["altura"]:
        erros.append(f"altura {puzzle['altura']} mas a grade tem {len(grade)} linhas")
    if len(grade[0]) != puzzle["largura"]:
        erros.append(f"largura {puzzle['largura']} mas as linhas têm {len(grade[0])} casas")
    if not (2 <= len(grade) <= 15 and 2 <= len(grade[0]) <= 15):
        erros.append("tamanho fora do limite (até 15×15)")
    for i, linha in enumerate(grade):
        if not LINHA_VALIDA.match(linha):
            erros.append(f"linha {i + 1} (\"{linha}\"): use só A-Z maiúsculas sem acento e #")
    if erros:
        return puzzle, erros

    horizontais, verticais = calcular_numeracao(grade)
    dicas = puzzle["dicas"]
    conferir_dicas("horizontais", horizontais, dicas.get("horizontais"), erros)
    conferir_dicas("verticais", verticais, dicas.get("verticais"), erros)

    vistas = {}
    for _, palavra in horizontais + verticais:
        vistas[palavra] = vistas.get(palavra, 0) + 1
    repetidas = sorted(p for p, n in vistas.items() if n > 1)
    if repetidas:
        erros.append(f"palavra repetida no puzzle: {', '.join(repetidas)}")

    return puzzle, erros


def main():
    arquivos = sorted(p for p in PASTA.glob("*.json") if p.name != INDICE.name)
    problemas = 0
    datas = []
    ids = {}

    for caminho in arquivos:
        erros = []
        if not NOME_ARQUIVO.match(caminho.name):
            erros.append("nome do arquivo deve ser AAAA-MM-DD.json")
        puzzle, erros_puzzle = validar_puzzle(caminho)
        erros += erros_puzzle

        if puzzle and "id" in puzzle:
            if puzzle["id"] in ids:
                erros.append(f"id {puzzle['id']} repetido (também em {ids[puzzle['id']]})")
            ids.setdefault(puzzle["id"], caminho.name)

        if erros:
            problemas += 1
            print(f"✗ {caminho.name}")
            for erro in erros:
                print(f"    - {erro}")
        else:
            print(f"✓ {caminho.name}")
            datas.append(puzzle["data"])

    if len(datas) != len(set(datas)):
        print("✗ datas duplicadas entre arquivos")
        problemas += 1

    if problemas:
        print(f"\n{problemas} puzzle(s) com problema. index.json não foi atualizado.")
        return 1

    conteudo = json.dumps({"datas": sorted(datas)}, ensure_ascii=False, indent=2) + "\n"
    INDICE.write_text(conteudo, encoding="utf-8", newline="\n")
    print(f"\n{len(datas)} puzzle(s) válido(s). puzzles/index.json atualizado.")
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.exit(main())
