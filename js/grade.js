// Renderiza a grade e as dicas, e calcula a numeração a partir da grade.
// A mesma regra de numeração existe em tools/validar.py; as duas precisam bater.

const PRETA = '#';

/**
 * Numera cada casa que inicia uma palavra (2+ letras) horizontal ou vertical,
 * da esquerda para a direita, de cima para baixo.
 * Retorna { numeros, horizontais, verticais }:
 *   numeros[linha][coluna] = número ou null
 *   horizontais/verticais = [{ numero, linha, coluna, tamanho, resposta }]
 */
export function calcularNumeracao(grade) {
  const altura = grade.length;
  const largura = grade[0].length;
  const ehLetra = (l, c) => l >= 0 && l < altura && c >= 0 && c < largura && grade[l][c] !== PRETA;

  const numeros = grade.map(linha => Array.from(linha, () => null));
  const horizontais = [];
  const verticais = [];
  let proximo = 1;

  for (let l = 0; l < altura; l++) {
    for (let c = 0; c < largura; c++) {
      if (!ehLetra(l, c)) continue;
      const iniciaH = !ehLetra(l, c - 1) && ehLetra(l, c + 1);
      const iniciaV = !ehLetra(l - 1, c) && ehLetra(l + 1, c);
      if (!iniciaH && !iniciaV) continue;

      const numero = proximo++;
      numeros[l][c] = numero;
      if (iniciaH) horizontais.push(lerPalavra(grade, numero, l, c, 0, 1, ehLetra));
      if (iniciaV) verticais.push(lerPalavra(grade, numero, l, c, 1, 0, ehLetra));
    }
  }
  return { numeros, horizontais, verticais };
}

function lerPalavra(grade, numero, linha, coluna, dl, dc, ehLetra) {
  let resposta = '';
  let l = linha, c = coluna;
  while (ehLetra(l, c)) {
    resposta += grade[l][c];
    l += dl; c += dc;
  }
  return { numero, linha, coluna, tamanho: resposta.length, resposta };
}

/** Desenha a grade vazia (casas brancas, pretas e números). */
export function renderizarGrade(elemento, puzzle) {
  const { numeros } = calcularNumeracao(puzzle.grade);
  elemento.style.setProperty('--n-colunas', puzzle.largura);
  elemento.style.setProperty('--n-linhas', puzzle.altura);
  elemento.replaceChildren();

  puzzle.grade.forEach((linha, l) => {
    Array.from(linha).forEach((letra, c) => {
      const casa = document.createElement('div');
      casa.className = letra === PRETA ? 'casa preta' : 'casa';
      casa.dataset.linha = l;
      casa.dataset.coluna = c;
      const numero = numeros[l][c];
      if (numero) {
        const span = document.createElement('span');
        span.className = 'numero';
        span.textContent = numero;
        casa.append(span);
      }
      elemento.append(casa);
    });
  });
}

/** Desenha as colunas "Horizontais" e "Verticais". */
export function renderizarDicas(elemento, puzzle) {
  elemento.replaceChildren(
    blocoDicas('Horizontais', puzzle.dicas.horizontais),
    blocoDicas('Verticais', puzzle.dicas.verticais),
  );
}

function blocoDicas(titulo, dicas) {
  const bloco = document.createElement('div');
  bloco.className = 'bloco-dicas';
  const h2 = document.createElement('h2');
  h2.textContent = titulo;
  const ol = document.createElement('ol');
  for (const dica of dicas) {
    const li = document.createElement('li');
    const num = document.createElement('span');
    num.className = 'num';
    num.textContent = dica.numero;
    const texto = document.createElement('span');
    texto.className = 'texto';
    texto.textContent = dica.texto + ' ';
    const tamanho = document.createElement('span');
    tamanho.className = 'tamanho';
    tamanho.textContent = `(${dica.resposta.length})`;
    texto.append(tamanho);
    li.append(num, texto);
    ol.append(li);
  }
  bloco.append(h2, ol);
  return bloco;
}
