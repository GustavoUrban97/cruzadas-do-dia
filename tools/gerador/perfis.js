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

/**
 * Lista de palavras do nível, em ordem de preferência (as primeiras saem mais).
 *  - base: lista geral, da mais comum para a menos comum (a ordem por frequência
 *    preenche bem mais rápido: as comuns têm letras que cruzam fácil);
 *  - evitar: palavras de 5+ letras usadas há pouco (não repetir no mês).
 * Numerais e ordinais nunca entram. A variedade das curtas fica em variedade.js.
 * Palavras de 2–3 letras vêm de uma lista escolhida a dedo (palavras.js); no fácil
 * entram as que estão entre as 5.500 mais comuns; na média e no difícil, todas.
 * (Listas menores que estas não fecham com as regras de variedade.)
 */
export function listaDoNivel(base, nivel, evitar = new Set()) {
  const ok = p => !CORINGAS.has(p) && !(p.length >= 5 && evitar.has(p));
  if (nivel === 'facil') return base.slice(0, 5500).filter(ok);
  if (nivel === 'media') return base.slice(0, 7500).filter(ok);
  // difícil: as menos usuais primeiro (faixa 1.500–7.500), as comuns como reserva
  return [...base.slice(1500, 7500), ...base.slice(0, 1500)].filter(ok);
}
