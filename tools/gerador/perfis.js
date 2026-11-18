// Perfil de cada nível: tamanho das palavras, quantidade de casas de dica e
// vocabulário. A diferença de dificuldade vem daqui e do estilo das dicas.

import { CORINGAS } from './palavras.js';

export const NIVEIS = ['facil', 'media', 'dificil'];

// maxDuas: no máximo tantas palavras de 2 letras (são poucas e se repetem muito).
export const PERFIS = {
  // palavras curtas e comuns, mais casas de dica
  facil:   { maxLetras: 6, alvoDicas: 76, maxDuas: 11, densidade: 0.26, simples: 14 },
  media:   { maxLetras: 7, alvoDicas: 72, maxDuas: 10, densidade: 0.22, simples: 12 },
  // palavras mais longas e menos usuais, menos casas de dica
  dificil: { maxLetras: 7, alvoDicas: 68, maxDuas: 9, densidade: 0.2, simples: 12 },
};

export const MAX_CURTA = 4; // até 4 letras: "cola" da grade, pode repetir, mas de preferência não

/**
 * Lista de palavras do nível, em ordem de preferência (as primeiras saem mais).
 *  - base: lista geral, da mais comum para a menos comum;
 *  - evitar: palavras de 5+ letras usadas há pouco (não repetir no mês);
 *  - usos (só na passada de variedade): palavras curtas (até 4 letras) -> quanto
 *    foram usadas perto desta data; sem usos, as curtas ficam na ordem da
 *    frequência, que preenche bem mais rápido (letras que cruzam fácil);
 *  - rand: sorteio (com semente) para variar a ordem das curtas.
 * Numerais e ordinais nunca entram.
 * Palavras de 2–3 letras vêm de uma lista escolhida a dedo (palavras.js); no fácil
 * entram as que estão entre as 5.500 mais comuns; na média e no difícil, todas.
 */
export function listaDoNivel(base, nivel, evitar = new Set(), { usos = null, rand = Math.random } = {}) {
  const fora = p => p.length >= 5 && evitar.has(p);
  let lista;
  if (nivel === 'facil') lista = base.slice(0, 5500).filter(p => !fora(p));
  else if (nivel === 'media') lista = base.slice(0, 7500).filter(p => !fora(p));
  // difícil: as menos usuais primeiro (faixa 1.500–7.500), as comuns como reserva
  else lista = [...base.slice(1500, 7500), ...base.slice(0, 1500)].filter(p => !fora(p));
  return usos ? variar(lista, usos, rand) : lista.filter(p => !CORINGAS.has(p));
}

/**
 * Reordena para cada jogo ser diferente do outro:
 *  - as curtas (até 4 letras) perdem a preferência pela frequência (são todas
 *    conhecidas): as menos usadas nos últimos dias vêm primeiro, sorteadas;
 *  - numerais e ordinais ficam de fora (apareciam demais, com dicas repetitivas).
 * A ordem entre tamanhos diferentes não importa (cada vaga só aceita um tamanho).
 */
function variar(lista, usos, rand) {
  const longas = [], curtas = [];
  for (const p of lista) {
    if (CORINGAS.has(p)) continue;
    if (p.length <= MAX_CURTA) curtas.push(p);
    else longas.push(p);
  }
  const chave = new Map(curtas.map(p => [p, 2 * (usos.get(p) || 0) + rand()]));
  curtas.sort((a, b) => chave.get(a) - chave.get(b));
  return [...longas, ...curtas];
}
