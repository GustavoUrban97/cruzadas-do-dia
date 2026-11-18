// Perfil de cada nível: tamanho das palavras, quantidade de casas de dica e
// vocabulário. A diferença de dificuldade vem daqui e do estilo das dicas.

import { CORINGAS } from './palavras.js';

export const NIVEIS = ['facil', 'media', 'dificil'];

// Palavras mais longas e poucas curtas (pedido de 18/11: "q tara por palavras
// de 3 letras… coloca palavras maiores"):
//  - maxLetras: a maior palavra;
//  - alvoDicas: no máximo tantas casas de dica (menos casas = palavras mais longas);
//  - maxDuas / maxTres: no máximo tantas palavras de 2 e de 3 letras;
//  - simples: no máximo tantas letras do miolo que pertencem a uma palavra só
//    (sem cruzamento) — um pouco de folga aqui é o que deixa a grade fechar.
export const PERFIS = {
  facil:   { maxLetras: 9, alvoDicas: 56, maxDuas: 5, maxTres: 12, densidade: 0.18, simples: 32 },
  media:   { maxLetras: 9, alvoDicas: 56, maxDuas: 4, maxTres: 10, densidade: 0.18, simples: 32 },
  dificil: { maxLetras: 9, alvoDicas: 54, maxDuas: 3, maxTres: 8, densidade: 0.17, simples: 34 },
};

/**
 * Lista de palavras do nível, em ordem de preferência (as primeiras saem mais).
 *  - base: lista geral, da mais comum para a menos comum (a ordem por frequência
 *    preenche bem mais rápido: as comuns têm letras que cruzam fácil);
 *  - evitar: palavras de 5+ letras usadas há pouco (não repetir no mês).
 * Numerais e ordinais nunca entram. A variedade das curtas fica em variedade.js.
 * Palavras de 2–3 letras vêm de uma lista escolhida a dedo (palavras.js).
 */
export function listaDoNivel(base, nivel, evitar = new Set()) {
  const ok = p => !CORINGAS.has(p) && !(p.length >= 5 && evitar.has(p));
  // as de 4–5 letras são poucas e são as que mais travam a grade: as que ficam
  // fora do corte entram no fim da fila, em qualquer nível
  const comReserva = (lista, corte) => [...lista, ...base.slice(corte).filter(p => p.length === 4 || p.length === 5)].filter(ok);
  if (nivel === 'facil') return comReserva(base.slice(0, 8500), 8500);
  if (nivel === 'media') return comReserva(base.slice(0, 9500), 9500);
  // difícil: as menos usuais primeiro (faixa 2.000–12.000), as comuns como reserva
  return comReserva([...base.slice(2000, 12000), ...base.slice(0, 2000)], 12000);
}
