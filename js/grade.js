// Renderiza a grade no formato cruzada direta: casas de letra, casas de dica
// (com uma ou duas dicas) e as setas que indicam onde cada resposta começa.
// A tabela DIRECOES é a mesma de tools/validar.py; as duas precisam bater.

const DICA = '#';

// direcao -> deslocamento da casa da dica até a primeira letra
export const DIRECOES = {
  'direita':       { dl: 0, dc: 1 },
  'baixo':         { dl: 1, dc: 0 },
  'baixo-direita': { dl: 1, dc: 0 },
  'direita-baixo': { dl: 0, dc: 1 },
};

// Setas desenhadas num quadrado 10×10 (SVG), traço + ponta.
const SETAS = {
  'direita':       'M1 5 H8 M6 3 L8.5 5 L6 7',
  'baixo':         'M5 1 V8 M3 6 L5 8.5 L7 6',
  'baixo-direita': 'M2 1 V6 H8 M6 4 L8.5 6 L6 8',
  'direita-baixo': 'M1 2 H6 V8 M4 6 L6 8.5 L8 6',
};

function criarSeta(direcao) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 10 10');
  svg.setAttribute('class', `seta seta-${direcao}`);
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', SETAS[direcao]);
  svg.append(path);
  return svg;
}

/** Desenha a grade completa do puzzle dentro de `elemento`. */
export function renderizarGrade(elemento, puzzle) {
  const { largura, altura, grade, dicas } = puzzle;
  elemento.style.setProperty('--n-colunas', largura);
  elemento.style.setProperty('--n-linhas', altura);
  elemento.replaceChildren();

  // Agrupa as dicas por casa, mantendo a ordem do arquivo (1ª = metade de cima).
  const dicasPorCasa = new Map();
  for (const dica of dicas) {
    const chave = `${dica.linha},${dica.coluna}`;
    if (!dicasPorCasa.has(chave)) dicasPorCasa.set(chave, []);
    dicasPorCasa.get(chave).push(dica);
  }

  const casas = [];
  for (let l = 0; l < altura; l++) {
    casas.push([]);
    for (let c = 0; c < largura; c++) {
      const casa = document.createElement('div');
      casa.dataset.linha = l;
      casa.dataset.coluna = c;

      if (grade[l][c] === DICA) {
        const lista = dicasPorCasa.get(`${l},${c}`) || [];
        casa.className = lista.length ? 'casa dica' : 'casa preta';
        if (lista.length === 2) casa.classList.add('dupla');
        for (const dica of lista) {
          const texto = document.createElement('div');
          texto.className = 'dica-texto';
          texto.textContent = dica.texto;
          casa.append(texto);
        }
      } else {
        casa.className = 'casa letra';
      }
      casas[l].push(casa);
      elemento.append(casa);
    }
  }

  // Setas: ficam na casa onde a resposta começa, na borda virada para a dica.
  for (const [chave, lista] of dicasPorCasa) {
    const [l, c] = chave.split(',').map(Number);
    lista.forEach((dica, i) => {
      const { dl, dc } = DIRECOES[dica.direcao];
      const alvo = casas[l + dl]?.[c + dc];
      if (!alvo) return;
      const seta = criarSeta(dica.direcao);
      // Duas dicas na mesma casa apontando para o lado: a seta acompanha a metade da dica.
      if (dica.direcao === 'direita' && lista.length === 2) {
        seta.classList.add(i === 0 ? 'metade-cima' : 'metade-baixo');
      }
      alvo.append(seta);
    });
  }
}

/**
 * Dimensiona a grade para ocupar o espaço disponível. As casas podem ficar
 * um pouco mais altas que largas (como na revista), até o limite de 1,3.
 */
export function ajustarTamanho(elemento, area, puzzle) {
  const { width, height } = area.getBoundingClientRect();
  const estilo = getComputedStyle(area);
  const w = width - parseFloat(estilo.paddingLeft) - parseFloat(estilo.paddingRight);
  const h = height - parseFloat(estilo.paddingTop) - parseFloat(estilo.paddingBottom);
  const proporcaoMax = 1.3; // altura / largura de cada casa

  let larguraCasa = w / puzzle.largura;
  let alturaCasa = h / puzzle.altura;
  if (alturaCasa > larguraCasa * proporcaoMax) alturaCasa = larguraCasa * proporcaoMax;
  if (larguraCasa > alturaCasa) larguraCasa = alturaCasa; // nunca mais larga que alta

  elemento.style.width = `${Math.floor(larguraCasa * puzzle.largura)}px`;
  elemento.style.height = `${Math.floor(alturaCasa * puzzle.altura)}px`;
  encaixarTextos(elemento);
}

/** Diminui a fonte de cada dica até o texto (sem cortar palavras) caber na sua metade da casa. */
function encaixarTextos(elemento) {
  const naoCabe = t => t.scrollHeight > t.clientHeight + 1 || t.scrollWidth > t.clientWidth + 1;
  for (const texto of elemento.querySelectorAll('.dica-texto')) {
    texto.style.fontSize = '';
    texto.classList.remove('apertada');
    let tamanho = parseFloat(getComputedStyle(texto).fontSize);
    const minimo = tamanho * 0.55;
    while (naoCabe(texto) && tamanho > minimo) {
      tamanho -= 0.5;
      texto.style.fontSize = `${tamanho}px`;
    }
    if (naoCabe(texto)) texto.classList.add('apertada');
  }
}
