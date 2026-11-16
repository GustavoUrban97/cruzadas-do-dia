// Perfil de cada nível: tamanho das palavras, quantidade de casas de dica e
// vocabulário. A diferença de dificuldade vem daqui e do estilo das dicas.

export const NIVEIS = ['facil', 'media', 'dificil'];

export const PERFIS = {
  // palavras curtas e comuns, mais casas de dica
  facil:   { maxLetras: 6, alvoDicas: 76, maxDuas: 14, densidade: 0.26, simples: 14 },
  media:   { maxLetras: 7, alvoDicas: 72, maxDuas: 12, densidade: 0.22, simples: 12 },
  // palavras mais longas e menos usuais, menos casas de dica
  dificil: { maxLetras: 7, alvoDicas: 68, maxDuas: 10, densidade: 0.2, simples: 12 },
};

/**
 * Lista de palavras do nível, em ordem de preferência (as primeiras saem mais).
 *  - base: lista geral, da mais comum para a menos comum;
 *  - evitar: palavras de 5+ letras usadas há pouco (não repetir no mês).
 * Palavras de 2–3 letras já vêm de uma lista escolhida (palavras.js); no fácil e na
 * média ficam só as 2.000 mais comuns delas, no difícil valem todas (ANU, ETA, SOR...).
 */
export function listaDoNivel(base, nivel, evitar = new Set()) {
  const comuns = new Set(base.slice(0, 2000));
  const curtaOk = p => p.length > 3 || comuns.has(p);
  const fora = p => p.length >= 5 && evitar.has(p);
  if (nivel === 'facil') return base.slice(0, 4500).filter(p => !fora(p));
  if (nivel === 'media') return base.slice(0, 6500).filter(p => curtaOk(p) && !fora(p));
  // difícil: as menos usuais primeiro (faixa 1.500–7.500), as comuns como reserva
  return [...base.slice(1500, 7500), ...base.slice(0, 1500)].filter(p => !fora(p));
}
