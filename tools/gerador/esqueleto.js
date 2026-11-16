// Esqueleto (posição das casas de dica) e preenchimento da grade 13×17.
// Regra de ouro da cruzada direta: toda palavra (2+ letras) tem uma casa de
// dica com seta para o seu início; toda casa de dica tem ao menos uma dica.

export const L = 13, A = 17;

/** Gerador pseudoaleatório com semente (mulberry32): mesma semente, mesmo puzzle. */
export function rng(semente) {
  let s = semente >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Sequências de letras da grade (g[r][c] === true é casa de dica). */
export function sequencias(g) {
  const out = [];
  for (const [dl, dc] of [[0, 1], [1, 0]]) {
    for (let r = 0; r < A; r++) for (let c = 0; c < L; c++) {
      if (g[r][c]) continue;
      const pr = r - dl, pc = c - dc;
      if (pr >= 0 && pc >= 0 && !g[pr][pc]) continue; // não é início
      const casas = [];
      let rr = r, cc = c;
      while (rr < A && cc < L && !g[rr][cc]) { casas.push([rr, cc]); rr += dl; cc += dc; }
      out.push({ dir: dc ? 'H' : 'V', casas });
    }
  }
  return out;
}

/**
 * Atribui as dicas: primeiro as retas (direita / baixo), depois as com curva
 * (direita-baixo / baixo-direita) só para palavras que ficaram sem dica.
 * Máximo de 2 dicas por casa.
 */
export function atribuirDicas(g) {
  const letra = (r, c) => r >= 0 && r < A && c >= 0 && c < L && !g[r][c];
  const inicios = new Set();
  for (const s of sequencias(g)) {
    if (s.casas.length < 2) continue;
    const [r, c] = s.casas[0];
    inicios.add(`${r},${c},${s.dir}`);
  }
  const cobertas = new Set();
  const dicas = [];
  const porCasa = {};
  const usar = (r, c, direcao, chave) => {
    if (cobertas.has(chave) || !inicios.has(chave) || (porCasa[r + ',' + c] || 0) >= 2) return;
    cobertas.add(chave);
    porCasa[r + ',' + c] = (porCasa[r + ',' + c] || 0) + 1;
    dicas.push({ linha: r, coluna: c, direcao, chave });
  };
  for (let r = 0; r < A; r++) for (let c = 0; c < L; c++) {
    if (!g[r][c]) continue;
    if (letra(r, c + 1)) usar(r, c, 'direita', `${r},${c + 1},H`);
    if (letra(r + 1, c)) usar(r, c, 'baixo', `${r + 1},${c},V`);
  }
  for (let r = 0; r < A; r++) for (let c = 0; c < L; c++) {
    if (!g[r][c]) continue;
    if (letra(r, c + 1)) usar(r, c, 'direita-baixo', `${r},${c + 1},V`);
    if (letra(r + 1, c)) usar(r, c, 'baixo-direita', `${r + 1},${c},H`);
  }
  let semDica = 0;
  for (const k of inicios) if (!cobertas.has(k)) semDica++;
  let dicasVazias = 0;
  for (let r = 0; r < A; r++) for (let c = 0; c < L; c++) if (g[r][c] && !porCasa[r + ',' + c]) dicasVazias++;
  return { dicas, semDica, dicasVazias };
}

/** "Feiura" do esqueleto; 0 = pronto. */
function custo(g, perfil) {
  let s = 0, duas = 0;
  const contagem = Array.from({ length: A }, () => Array(L).fill(0)); // em quantas palavras cada letra está
  for (const seq of sequencias(g)) {
    const n = seq.casas.length;
    if (n > perfil.maxLetras) s += (n - perfil.maxLetras) * 2;
    if (n === 2) duas++;
    if (n >= 2) for (const [r, c] of seq.casas) contagem[r][c]++;
  }
  if (duas > perfil.maxDuas) s += duas - perfil.maxDuas;
  let dicas = 0, simples = 0;
  for (let r = 0; r < A; r++) for (let c = 0; c < L; c++) {
    if (!g[r][c]) {
      if (contagem[r][c] === 0) s += 4;                          // letra sem palavra
      else if (contagem[r][c] === 1 && r > 0 && c > 0) simples++; // miolo: letra de uma palavra só
      continue;
    }
    dicas++;
    if (r >= 1 && c >= 1) { // evita blocos de casas de dica no miolo
      if (c + 2 < L && g[r][c + 1] && g[r][c + 2]) s += 2;
      if (r + 2 < A && g[r + 1][c] && g[r + 2][c]) s += 2;
      if (c + 1 < L && r + 1 < A && g[r][c + 1] && g[r + 1][c] && g[r + 1][c + 1]) s += 2;
    }
  }
  if (dicas > perfil.alvoDicas) s += (dicas - perfil.alvoDicas) * 0.5;
  if (simples > perfil.simples) s += (simples - perfil.simples) * 0.6;
  const { semDica, dicasVazias } = atribuirDicas(g);
  return s + semDica * 3 + dicasVazias * 2;
}

/**
 * Sorteia um esqueleto: bordas e miolo aleatórios, ajustados por recozimento
 * simulado até o custo zerar. Devolve null se não convergir.
 */
export function gerarEsqueleto(rand, perfil, passos = 40000) {
  const g = Array.from({ length: A }, (_, r) => Array.from({ length: L }, (_, c) =>
    (r === 0 && c === 0) || ((r === 0 || c === 0) && rand() < 0.55) || (r > 0 && c > 0 && rand() < perfil.densidade)));
  const todas = [];
  for (let r = 0; r < A; r++) for (let c = 0; c < L; c++) if (r || c) todas.push([r, c]);
  const bordas = todas.filter(([r, c]) => r === 0 || c === 0);
  let atual = custo(g, perfil);
  let temp = 2;
  for (let p = 0; p < passos && atual > 0; p++) {
    const fonte = rand() < 0.15 ? bordas : todas;
    const [r, c] = fonte[Math.floor(rand() * fonte.length)];
    g[r][c] = !g[r][c];
    const novo = custo(g, perfil);
    if (novo <= atual || rand() < Math.exp((atual - novo) / temp)) atual = novo;
    else g[r][c] = !g[r][c];
    temp = Math.max(0.05, temp * 0.9998);
  }
  return atual === 0 ? g : null;
}

/**
 * Preenche o esqueleto com palavras da lista (busca com retrocesso; escolhe
 * sempre a vaga com menos opções). A lista vem em ordem de preferência.
 */
export function preencher(g, palavras, rand, limiteNos = 80000, inicial = null) {
  const vagas = sequencias(g).filter(s => s.casas.length >= 2);
  const porTamanho = {};
  palavras.forEach((p, i) => { (porTamanho[p.length] ||= []).push(i); });
  // inicial: letras já fixas (conserto local); vagas completas não mudam
  const atual = inicial ? inicial.map(l => l.slice()) : Array.from({ length: A }, () => Array(L).fill(''));
  const usadas = new Set();
  const atribuida = new Array(vagas.length).fill(-1);
  let fixas = 0;
  vagas.forEach((v, i) => {
    const p = v.casas.map(([r, c]) => atual[r][c]).join('');
    if (p.length === v.casas.length) { atribuida[i] = -2; usadas.add(p); fixas++; }
  });
  const vagasDaCasa = {};
  vagas.forEach((v, i) => v.casas.forEach(([r, c]) => (vagasDaCasa[r + ',' + c] ||= []).push(i)));

  const candidatas = (i, limite = Infinity) => {
    const padrao = vagas[i].casas.map(([r, c]) => atual[r][c]);
    const out = [];
    for (const id of porTamanho[padrao.length] || []) {
      const p = palavras[id];
      if (usadas.has(p)) continue;
      let ok = true;
      for (let k = 0; k < padrao.length; k++) if (padrao[k] && padrao[k] !== p[k]) { ok = false; break; }
      if (ok) { out.push(id); if (out.length >= limite) break; }
    }
    return out;
  };

  let nos = 0;
  const buscar = restantes => {
    if (restantes === 0) return true;
    if (++nos > limiteNos) return false;
    let melhor = -1, menos = Infinity;
    for (let i = 0; i < vagas.length; i++) {
      if (atribuida[i] !== -1) continue;
      const n = candidatas(i, menos).length;
      if (n < menos) { menos = n; melhor = i; if (n === 0) return false; }
    }
    // as primeiras da lista têm preferência, com um pouco de sorte
    const ordem = candidatas(melhor).map((id, k) => [id, k * (0.3 + rand())])
      .sort((a, b) => a[1] - b[1]).map(x => x[0]).slice(0, 40);
    for (const id of ordem) {
      const p = palavras[id];
      const novas = [];
      vagas[melhor].casas.forEach(([r, c], k) => { if (!atual[r][c]) { atual[r][c] = p[k]; novas.push([r, c]); } });
      usadas.add(p); atribuida[melhor] = id;
      let viva = true; // checagem adiante: as vagas cruzadas ainda têm opção?
      for (const [r, c] of novas) {
        for (const j of vagasDaCasa[r + ',' + c]) {
          if (j !== melhor && atribuida[j] === -1 && candidatas(j, 1).length === 0) { viva = false; break; }
        }
        if (!viva) break;
      }
      if (viva && buscar(restantes - 1)) return true;
      usadas.delete(p); atribuida[melhor] = -1;
      for (const [r, c] of novas) atual[r][c] = '';
      if (nos > limiteNos) return false;
    }
    return false;
  };
  return { ok: buscar(vagas.length - fixas), nos, letras: atual };
}

/**
 * Conserto local: apaga as palavras ruins (e as que as cruzam) e preenche só
 * esse pedaço de novo, mantendo o esqueleto e o resto da grade.
 * Devolve { g, letras } ou null se não achar substitutas.
 */
export function consertar(grade, ruins, palavras, rand) {
  const g = grade.map(l => [...l].map(ch => ch === '#'));
  const letras = grade.map(l => [...l].map(ch => (ch === '#' ? '' : ch)));
  const seqs = sequencias(g).filter(s => s.casas.length >= 2);
  const palavraDe = s => s.casas.map(([r, c]) => letras[r][c]).join('');
  const ruinsSeq = seqs.filter(s => ruins.has(palavraDe(s)));
  if (!ruinsSeq.length) return null;
  // casas a apagar: as das palavras ruins; se não der, também as das que cruzam
  const apagar = new Set(ruinsSeq.flatMap(s => s.casas.map(([r, c]) => r + ',' + c)));
  const tentar = casas => {
    const inicial = letras.map((l, r) => l.map((ch, c) => (casas.has(r + ',' + c) ? '' : ch)));
    const res = preencher(g, palavras, rand, 20000, inicial);
    return res.ok ? { g, letras: res.letras } : null;
  };
  // se não achar, alarga o pedaço apagado: as palavras que cruzam, depois as que cruzam essas
  let area = apagar;
  for (let anel = 0; anel <= 2; anel++) {
    const r = tentar(area);
    if (r) return r;
    const maior = new Set(area);
    for (const s of seqs) if (s.casas.some(([rr, c]) => area.has(rr + ',' + c))) s.casas.forEach(([rr, c]) => maior.add(rr + ',' + c));
    area = maior;
  }
  return null;
}

/** Grade (strings com #) + dicas com resposta e texto em branco. */
export function montar(g, letras) {
  const grade = letras.map((linha, r) => linha.map((x, c) => (g[r][c] ? '#' : x)).join(''));
  const palavra = (r, c, dl, dc) => { let s = ''; while (r < A && c < L && !g[r][c]) { s += letras[r][c]; r += dl; c += dc; } return s; };
  const ordem = { 'direita': 0, 'direita-baixo': 0, 'baixo': 1, 'baixo-direita': 1 }; // → em cima, ↓ embaixo
  const dicas = atribuirDicas(g).dicas.map(({ linha, coluna, direcao, chave }) => {
    const [r, c, sentido] = chave.split(',');
    const resposta = sentido === 'H' ? palavra(+r, +c, 0, 1) : palavra(+r, +c, 1, 0);
    return { linha, coluna, direcao, texto: '', resposta };
  });
  dicas.sort((a, b) => a.linha - b.linha || a.coluna - b.coluna || ordem[a.direcao] - ordem[b.direcao]);
  return { grade, dicas };
}
