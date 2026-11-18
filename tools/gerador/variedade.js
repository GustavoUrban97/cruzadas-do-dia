// Geração com variedade: uma cruzada por vez, cada uma sabendo o que as
// anteriores usaram, e vários trabalhos em paralelo (sementes diferentes) para
// cada cruzada — fica com a primeira grade que fechar sem defeito.
//
// Regras (para um jogo ser diferente do outro):
//  - palavras de 5+ letras (e o plural/singular delas) não se repetem no mês;
//  - curtas de 4 letras já usadas noutro nível do mesmo dia vão para o fim da fila;
//  - curtas usadas 7+ vezes nos dias vizinhos (±7) vão para o meio da fila;
//  - curtas gastas (15+ vezes no último mês publicado) vão para o fim;
//  - AMO e AMA ficam de fora (apareciam em quase todo jogo);
//  - numerais e ordinais ficam de fora (perfis.js);
//  - grade com palavra proibida ou com duas formas da mesma palavra (AMARELO/
//    AMARELA, MAR/MARES; tolera um par de 3 letras, como ASA/ASAS) é descartada.
// Apertar mais que isso trava o preenchimento (testado: a média não fecha).

import { listaDoNivel, PERFIS } from './perfis.js';

const JANELA = 30;     // dias: palavras de 5+ letras não se repetem
const VIZINHOS = 7;    // dias: contagem das curtas
const FORA_DE_VEZ = new Set(['AMO', 'AMA']);

let estado = null;     // estado do gerador (app.js): base, proibidas, puzzles
let publicadas = null; // { inicio, longas: Set, curtas: [{ data, palavras }] }
let ativos = [];

export function iniciarVariedade(est) { estado = est; publicadas = null; }

const somar = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const distancia = (a, b) => Math.abs(new Date(`${a}T12:00:00Z`) - new Date(`${b}T12:00:00Z`)) / 864e5;

/** Lê as cruzadas publicadas do mês antes do lote (as do lote em diante vão ser trocadas). */
async function lerPublicadas(inicio) {
  if (publicadas && publicadas.inicio === inicio) return;
  publicadas = { inicio, longas: new Set(), curtas: [] };
  const indice = (await (await fetch('../puzzles/index.json', { cache: 'no-cache' })).json()).datas || {};
  const desde = somar(inicio, -JANELA);
  for (const [data, niveis] of Object.entries(indice)) {
    if (data < desde || data >= inicio) continue;
    for (const nivel of niveis) {
      const p = await (await fetch(`../puzzles/${data}-${nivel}.json`, { cache: 'no-cache' })).json();
      p.dicas.forEach(d => d.resposta.length >= 5 && publicadas.longas.add(d.resposta));
      publicadas.curtas.push({ data, palavras: p.dicas.map(d => d.resposta) });
    }
  }
}

/** Duas formas da mesma palavra na grade, ou palavra proibida. Devolve o motivo ou null. */
export function defeito(dicas) {
  const ws = dicas.map(d => d.resposta);
  const proibida = ws.find(w => estado.proibidas && estado.proibidas.has(w));
  if (proibida) return `proibida ${proibida}`;
  const curtos = [];
  for (const a of ws) for (const b of ws) {
    if (a >= b) continue;
    const curta = a.length <= b.length ? a : b, longa = curta === a ? b : a;
    if (curta.length < 3) continue;
    const sufixo = longa.startsWith(curta) ? longa.slice(curta.length) : null;
    const fim = curta.at(-1);
    if (sufixo !== null && (
      (sufixo === 'S' && 'AEIOU'.includes(fim)) ||        // ASA/ASAS
      (sufixo === 'ES' && 'RZLS'.includes(fim)) ||        // MAR/MARES
      (sufixo === 'M' && (fim === 'A' || fim === 'E')) || // ERA/ERAM
      (sufixo === 'R' && fim === 'A') ||                  // ORA/ORAR
      (['AM', 'RAM'].includes(sufixo) && curta.length >= 4))) {
      if (curta.length >= 4) return `${a}/${b}`;
      curtos.push(`${a}/${b}`);
      if (curtos.length >= 2) return curtos.join(' ');
      continue;
    }
    const fins = new Set([a.at(-1), b.at(-1)]);
    if (curta.length >= 4 && a.length === b.length && a.slice(0, -1) === b.slice(0, -1) && fins.has('O') && fins.has('A')) return `${a}/${b}`;
  }
  return null;
}

/** Palavras de 5+ letras a evitar (e o plural/singular delas): publicadas do mês e o resto do lote. */
function evitarPara(arquivo) {
  const ev = new Set();
  const variar = w => { ev.add(w); ev.add(w + 'S'); if (w.endsWith('S')) ev.add(w.slice(0, -1)); };
  publicadas.longas.forEach(variar);
  for (const [a, p] of estado.puzzles) if (a !== arquivo) p.dicas.forEach(d => d.resposta.length >= 5 && variar(d.resposta));
  return ev;
}

/** Ordem das curtas: novas → muito usadas nos vizinhos → do mesmo dia e gastas. */
function ordenar(lista, data, arquivo) {
  const fontes = [...publicadas.curtas, ...[...estado.puzzles].filter(([a]) => a !== arquivo)
    .map(([, p]) => ({ data: p.data, palavras: p.dicas.map(d => d.resposta) }))];
  const vizinhas = new Map(), mesmoDia = new Set(), mes = new Map();
  for (const f of fontes) {
    for (const w of f.palavras) {
      if (w.length < 3 || w.length > 4) continue;
      if (f.data < publicadas.inicio) mes.set(w, (mes.get(w) || 0) + 1);
      if (distancia(f.data, data) > VIZINHOS) continue;
      vizinhas.set(w, (vizinhas.get(w) || 0) + 1);
      if (f.data === data && w.length === 4) mesmoDia.add(w);
    }
  }
  const tardia = w => mesmoDia.has(w) || (mes.get(w) || 0) >= 15;
  const meio = w => (vizinhas.get(w) || 0) >= 7;
  return [
    ...lista.filter(w => !tardia(w) && !meio(w)),
    ...lista.filter(w => !tardia(w) && meio(w)),
    ...lista.filter(tardia),
  ];
}

export function pararVariedade() { ativos.forEach(w => w.terminate()); ativos = []; }

/**
 * Gera uma cruzada (data + nível) com n trabalhos em paralelo. Devolve o
 * puzzle (sem id nem título) ou null se nenhum trabalho conseguiu.
 */
export async function gerarUma(data, nivel, inicio, n = 8) {
  await lerPublicadas(inicio);
  const arquivo = `${data}-${nivel}`;
  const ev = evitarPara(arquivo);
  const lista = ordenar(listaDoNivel(estado.base, nivel, ev).filter(w => !FORA_DE_VEZ.has(w) && !ev.has(w)), data, arquivo);
  pararVariedade();
  return new Promise(resolver => {
    let feito = false, falhas = 0, descartes = 0;
    const lancar = () => {
      const w = new Worker('gerador/trabalhador.js', { type: 'module' });
      ativos.push(w);
      w.onmessage = ({ data: m }) => {
        if (m.log || feito) return;
        if (!m.falhou && defeito(m.pronto.dicas)) {
          // grade com defeito: descarta e põe outro trabalho no lugar
          w.terminate();
          if (++descartes <= 40) { lancar(); return; }
          m = { falhou: true };
        }
        if (m.falhou) { if (++falhas === n) { feito = true; resolver(null); } return; }
        feito = true;
        pararVariedade();
        resolver({ data, nivel, semente: m.pronto.semente, grade: m.pronto.grade, dicas: m.pronto.dicas, descartes });
      };
      w.postMessage({ id: arquivo, lista, perfil: PERFIS[nivel], semente: Math.floor(Math.random() * 1e8), tentativas: 8 });
    };
    for (let k = 0; k < n; k++) lancar();
  });
}
