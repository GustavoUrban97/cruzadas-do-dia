// Página do gerador: gera um lote de cruzadas (dias × níveis) em Web Workers,
// evita repetir palavras de 5+ letras no mês, aplica os textos das dicas e
// salva os arquivos (e o puzzles/index.json) na pasta puzzles/.

import { NIVEIS, PERFIS, MAX_CURTA, listaDoNivel } from './perfis.js';
import { URL_FREQUENCIA, URL_DICIONARIO, CORINGAS, montarLista, lerProibidas } from './palavras.js';
import { rng } from './esqueleto.js';

const $ = id => document.getElementById(id);
const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const JANELA_SEM_REPETIR = 30; // dias
const MIN_SEM_REPETIR = 5;     // palavras com 5+ letras não se repetem no mês (as curtas são a "cola" da grade)
const JANELA_CURTAS = 14;      // dias: curtas usadas nesse intervalo vão para o fim da fila

const estado = {
  base: null,          // lista geral de palavras
  indice: {},          // puzzles/index.json atual: { data: [níveis] }
  puzzles: new Map(),  // "AAAA-MM-DD-nivel" -> puzzle gerado
  curtas: new Map(),   // data -> Map(palavra curta ou numeral -> vezes usada naquele dia)
  trabalhadores: [],
};

// ---------- Variedade das palavras curtas ----------

const contaComoCurta = p => p.length <= MAX_CURTA || CORINGAS.has(p);

/** Anota as palavras curtas (e numerais) de um puzzle no dia dele. */
function registrarCurtas(data, dicas) {
  const dia = estado.curtas.get(data) || new Map();
  for (const { resposta } of dicas) if (contaComoCurta(resposta)) dia.set(resposta, (dia.get(resposta) || 0) + 1);
  estado.curtas.set(data, dia);
}

/**
 * Quanto cada curta foi usada perto desta data (±14 dias, todos os níveis).
 * No mesmo dia pesa o triplo: os três níveis do dia não devem se parecer.
 */
function usosPara(data) {
  const usos = new Map();
  for (const [dia, palavras] of estado.curtas) {
    const distancia = Math.abs(new Date(`${dia}T12:00:00Z`) - new Date(`${data}T12:00:00Z`)) / 864e5;
    if (distancia > JANELA_CURTAS) continue;
    const peso = dia === data ? 3 : 1;
    for (const [p, n] of palavras) usos.set(p, (usos.get(p) || 0) + n * peso);
  }
  return usos;
}

/** Tira as curtas de um puzzle da contagem (antes de trocá-las). */
function desregistrarCurtas(data, dicas) {
  const dia = estado.curtas.get(data);
  if (!dia) return;
  for (const { resposta } of dicas) {
    const n = dia.get(resposta);
    if (n > 1) dia.set(resposta, n - 1); else if (n) dia.delete(resposta);
  }
}

const VIZINHOS = 7; // dias

/**
 * Palavras de um puzzle que pesam na repetição: numerais e ordinais; e curtas de
 * 3–4 letras que já estão noutro nível do mesmo dia ou em 2+ cruzadas dos dias
 * vizinhos (±7). As de 2 letras ficam (são poucas, não tem como variar).
 */
function repetitivas(p) {
  const conta = new Map(); // palavra -> [vezes nos vizinhos, vezes no mesmo dia]
  for (const [dia, palavras] of estado.curtas) {
    const distancia = Math.abs(new Date(`${dia}T12:00:00Z`) - new Date(`${p.data}T12:00:00Z`)) / 864e5;
    if (distancia > VIZINHOS) continue;
    for (const [w, n] of palavras) {
      const c = conta.get(w) || [0, 0];
      c[0] += n; if (dia === p.data) c[1] += n;
      conta.set(w, c);
    }
  }
  return p.dicas.map(d => d.resposta).filter(w => {
    if (CORINGAS.has(w)) return true;
    if (w.length < 3 || w.length > MAX_CURTA) return false;
    const [vizinhos, mesmoDia] = conta.get(w) || [0, 0];
    return mesmoDia >= 1 || vizinhos >= 2; // a própria cruzada já saiu da contagem
  });
}

/**
 * Passada de variedade: uma cruzada por vez (na ordem das datas), troca por
 * conserto local as palavras repetitivas, já sabendo o que as anteriores usaram.
 * Se o conserto não achar substitutas, a cruzada fica como estava.
 */
export function variarLote() {
  return ocupado(async () => {
    const base = await carregarBase();
    // por data e, no dia, fácil → média → difícil (o fácil fica como saiu; os outros se afastam dele)
    const ordem = a => { const p = estado.puzzles.get(a); return `${p.data}-${NIVEIS.indexOf(p.nivel)}`; };
    const arquivos = [...estado.puzzles.keys()].sort((a, b) => ordem(a).localeCompare(ordem(b)));
    if (!arquivos.length) return;
    const datas = arquivos.map(a => estado.puzzles.get(a).data).sort();
    const { recentes } = await lerExistentes(datas[0], 31);
    for (const p of estado.puzzles.values()) registrarCurtas(p.data, p.dicas);
    let trocadas = 0;
    for (const arquivo of arquivos) {
      const p = estado.puzzles.get(arquivo);
      desregistrarCurtas(p.data, p.dicas);
      const ruins = repetitivas(p);
      if (!ruins.length) { registrarCurtas(p.data, p.dicas); continue; }
      const evitar = new Set([...recentes, ...palavrasDoLote(new Set([arquivo]))]);
      const antes = p.dicas.length;
      await executar([{
        arquivo, data: p.data, nivel: p.nivel, id: p.id, tentativa: 10 * (1 + Math.floor(Math.random() * 100)),
        conserto: { grade: p.grade, semente: p.semente, ruins }, soConserto: true,
      }], base, evitar);
      const depois = estado.puzzles.get(arquivo);
      if (depois === p) { registrarCurtas(p.data, p.dicas); log(`${arquivo}: não deu para trocar ${ruins.length}.`); continue; }
      trocadas += ruins.length;
      log(`${arquivo}: trocou ${ruins.length} palavra(s) curta(s) (${antes} → ${depois.dicas.length} palavras).`);
    }
    log(`Variedade: ${trocadas} troca(s).\n${resumoRepeticoes()}`);
  });
}

/** Resumo das repetições do lote, para conferir antes de salvar. */
export function resumoRepeticoes(puzzles = [...estado.puzzles.values()]) {
  const conta = new Map();
  for (const p of puzzles) for (const d of p.dicas) conta.set(d.resposta, (conta.get(d.resposta) || 0) + 1);
  const linhas = [`${puzzles.length} cruzadas`];
  for (const n of [2, 3, 4]) {
    const ws = [...conta].filter(([w]) => w.length === n).sort((a, b) => b[1] - a[1]);
    const usos = ws.reduce((s, [, k]) => s + k, 0);
    linhas.push(`${n} letras: ${ws.length} diferentes, ${usos} usos; mais repetidas: ${ws.slice(0, 6).map(([w, k]) => `${w} ${k}`).join(', ')}`);
  }
  const longas = [...conta].filter(([w, k]) => w.length >= 5 && k > 1);
  linhas.push(`5+ letras repetidas no lote: ${longas.length}`);
  linhas.push(`numerais/ordinais: ${[...conta].filter(([w]) => CORINGAS.has(w)).reduce((s, [, k]) => s + k, 0)}`);
  return linhas.join('\n');
}

// ---------- Utilidades ----------

const log = texto => { const el = $('log'); el.textContent += texto + '\n'; el.scrollTop = el.scrollHeight; };

function somarDias(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** "Terça tranquila" / "Terça-feira" / "Terça de mestre" (sábado e domingo no masculino). */
function titulo(data, nivel) {
  const dia = new Date(`${data}T12:00:00Z`).getUTCDay();
  const nome = DIAS_SEMANA[dia];
  const fimDeSemana = dia === 0 || dia === 6;
  if (nivel === 'facil') return `${nome} ${fimDeSemana ? 'tranquilo' : 'tranquila'}`;
  if (nivel === 'media') return fimDeSemana ? nome : `${nome}-feira`;
  return `${nome} de mestre`;
}

/** Semente a partir do nome do arquivo: o mesmo dia e nível gera o mesmo puzzle. */
function semente(texto, tentativa) {
  let h = 2166136261;
  for (const ch of texto) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return ((h >>> 0) % 1e8) + tentativa * 1e5;
}

async function buscarTexto(url) {
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.text();
}

/** Mesmo formato dos arquivos de puzzles/ (uma dica por linha). */
// Banco: palavras de ajuda impressas de ponta-cabeça embaixo da grade.
// Quantas por nível (o difícil ajuda menos).
const BANCO_POR_NIVEL = { facil: 5, media: 4, dificil: 3 };

/**
 * Escolhe as palavras do banco: as mais raras do puzzle (pela posição na lista
 * de frequência; fora da lista conta como raríssima), de preferência as de 3 a
 * 5 letras, que são as que mais travam. Em ordem alfabética.
 */
export function escolherBanco(p, base = estado.base) {
  const posicao = new Map((base || []).map((w, i) => [w, i]));
  const rank = w => posicao.get(w) ?? Infinity;
  const proibidas = estado.proibidas || new Set();
  const respostas = [...new Set(p.dicas.map(d => d.resposta))].filter(w => w.length >= 3 && !proibidas.has(w));
  const porRaridade = lista => lista.sort((a, b) => rank(b) - rank(a) || a.localeCompare(b));
  const curtas = porRaridade(respostas.filter(w => w.length <= 5));
  const longas = porRaridade(respostas.filter(w => w.length > 5));
  return [...curtas, ...longas].slice(0, BANCO_POR_NIVEL[p.nivel] ?? 4).sort();
}

export function serializar(p) {
  const campo = d => '    ' + JSON.stringify(d).replace(/":/g, '": ').replace(/,"/g, ', "');
  const banco = p.banco || (estado.base ? escolherBanco(p) : []);
  return '{\n' +
    `  "id": ${p.id},\n  "data": "${p.data}",\n  "nivel": "${p.nivel}",\n` +
    `  "titulo": ${JSON.stringify(p.titulo)},\n  "autor": ${JSON.stringify(p.autor)},\n` +
    '  "largura": 13,\n  "altura": 17,\n  "grade": [\n' +
    p.grade.map(l => `    "${l}"`).join(',\n') + '\n  ],\n' +
    (banco.length ? `  "banco": ${JSON.stringify(banco).replace(/,/g, ', ')},\n` : '') +
    '  "dicas": [\n' +
    p.dicas.map(d => campo({ linha: d.linha, coluna: d.coluna, direcao: d.direcao, texto: d.texto, resposta: d.resposta })).join(',\n') +
    '\n  ]\n}\n';
}

/** index.json no mesmo formato que tools/validar.py gera (datas e níveis em ordem). */
function indiceAtualizado() {
  const datas = { ...Object.fromEntries(Object.entries(estado.indice).map(([d, n]) => [d, [...n]])) };
  for (const p of estado.puzzles.values()) {
    datas[p.data] ||= [];
    if (!datas[p.data].includes(p.nivel)) datas[p.data].push(p.nivel);
  }
  const ordenado = {};
  for (const d of Object.keys(datas).sort()) ordenado[d] = datas[d].sort((a, b) => NIVEIS.indexOf(a) - NIVEIS.indexOf(b));
  return JSON.stringify({ datas: ordenado }, null, 2) + '\n';
}

// ---------- Dados existentes ----------

async function carregarBase(recarregar = false) {
  if (estado.base && !recarregar) return estado.base;
  log('Baixando as listas de palavras…');
  const [freq, dic, proib] = await Promise.all([
    buscarTexto($('url-frequencia').value), buscarTexto($('url-dicionario').value), buscarTexto('proibidas.txt'),
  ]);
  estado.proibidas = lerProibidas(proib);
  estado.base = montarLista(freq, dic, estado.proibidas);
  log(`${estado.base.length} palavras na lista (${estado.proibidas.size} proibidas).`);
  return estado.base;
}

/** Lê os puzzles já publicados: maior id e palavras usadas perto das datas do lote. */
async function lerExistentes(inicio, dias) {
  estado.indice = (JSON.parse(await buscarTexto('../puzzles/index.json')).datas) || {};
  let maiorId = 0;
  const recentes = new Set();
  const desde = somarDias(inicio, -JANELA_SEM_REPETIR);
  const ate = somarDias(inicio, dias + JANELA_SEM_REPETIR);
  estado.curtas = new Map();
  for (const [data, niveis] of Object.entries(estado.indice)) {
    for (const nivel of niveis) {
      const p = JSON.parse(await buscarTexto(`../puzzles/${data}-${nivel}.json`));
      maiorId = Math.max(maiorId, p.id);
      if (data >= desde && data < ate) {
        p.dicas.forEach(d => d.resposta.length >= MIN_SEM_REPETIR && recentes.add(d.resposta));
        registrarCurtas(data, p.dicas);
      }
    }
  }
  return { maiorId, recentes };
}

// ---------- Lote guardado no navegador (fechar a aba não perde o trabalho) ----------

const CHAVE_LOTE = 'gerador-lote';

function guardarLote() {
  try { localStorage.setItem(CHAVE_LOTE, JSON.stringify([...estado.puzzles])); } catch { /* sem espaço: segue */ }
}

function restaurarLote() {
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE_LOTE) || '[]');
    estado.puzzles = new Map(salvo);
  } catch { estado.puzzles = new Map(); }
  if (estado.puzzles.size) log(`Lote anterior restaurado (${estado.puzzles.size} cruzadas). "Limpar lote" começa outro.`);
}

// ---------- Geração ----------

/** Palavras de 5+ letras do lote (menos as cruzadas indicadas). */
function palavrasDoLote(exceto = new Set()) {
  const out = new Set();
  for (const [arquivo, p] of estado.puzzles) {
    if (!exceto.has(arquivo)) p.dicas.forEach(d => d.resposta.length >= MIN_SEM_REPETIR && out.add(d.resposta));
  }
  return out;
}

/** Roda as tarefas nos Web Workers. Cada tarefa: { arquivo, data, nivel, id, tentativa }. */
function executar(fila, base, evitar) {
  const paralelos = Math.max(1, Number($('paralelos').value) || 4);
  log(`Gerando ${fila.length} cruzada(s) com ${Math.min(paralelos, fila.length)} trabalho(s) em paralelo…`);
  return new Promise(resolver => {
    let ativos = 0;
    const proximo = trabalhador => {
      const tarefa = fila.shift();
      if (!tarefa) { trabalhador.terminate(); if (--ativos === 0) resolver(); return; }
      // no conserto, as palavras trocadas não podem voltar
      const excluir = new Set(tarefa.conserto ? tarefa.conserto.ruins : []);
      // a ordem por uso (variedade) só no conserto: gerar com ela fica lento demais
      const lista = listaDoNivel(base, tarefa.nivel, evitar, tarefa.soConserto ? {
        usos: usosPara(tarefa.data), rand: rng(semente(tarefa.arquivo, tarefa.tentativa) + 7),
      } : {}).filter(p => !excluir.has(p));
      trabalhador.onmessage = ({ data: msg }) => {
        if (msg.log) return;
        if (msg.falhou) {
          log(`${tarefa.arquivo}: não consegui gerar (tentativa ${tarefa.tentativa + 1}).`);
          if (tarefa.tentativa % 10 < 3) fila.push({ ...tarefa, tentativa: tarefa.tentativa + 1 });
          proximo(trabalhador);
          return;
        }
        const longas = msg.pronto.dicas.map(d => d.resposta).filter(p => p.length >= MIN_SEM_REPETIR);
        // Outro trabalho pode ter usado a palavra enquanto este rodava. Uma ou duas
        // repetições passam; mais que isso, gera de novo (gerar custa minutos).
        const repetidas = longas.filter(p => evitar.has(p));
        if (repetidas.length > 2 && tarefa.tentativa % 10 < 3) {
          log(`${tarefa.arquivo}: repetiu ${repetidas.join(', ')}; gerando de novo.`);
          fila.push({ ...tarefa, tentativa: tarefa.tentativa + 1 });
        } else {
          longas.forEach(p => evitar.add(p));
          registrarCurtas(tarefa.data, msg.pronto.dicas);
          estado.puzzles.set(tarefa.arquivo, {
            id: tarefa.id, data: tarefa.data, nivel: tarefa.nivel, titulo: titulo(tarefa.data, tarefa.nivel),
            autor: 'Gustavo', semente: msg.pronto.semente, grade: msg.pronto.grade, dicas: msg.pronto.dicas,
          });
          guardarLote();
          log(`${tarefa.arquivo}: ${msg.pronto.consertada ? "consertada" : "pronta"} (${msg.pronto.dicas.length} palavras).`);
          desenhar();
        }
        proximo(trabalhador);
      };
      trabalhador.postMessage({ id: tarefa.arquivo, lista, perfil: PERFIS[tarefa.nivel], semente: semente(tarefa.arquivo, tarefa.tentativa), conserto: tarefa.conserto || null, soConserto: Boolean(tarefa.soConserto) });
    };
    for (let i = 0; i < Math.min(paralelos, fila.length); i++) {
      const t = new Worker('gerador/trabalhador.js', { type: 'module' });
      estado.trabalhadores.push(t);
      ativos++;
      proximo(t);
    }
    if (ativos === 0) resolver();
    estado.pararTudo = () => { estado.trabalhadores.forEach(t => t.terminate()); fila.length = 0; resolver(); };
  });
}

/** Envolve uma ação longa: trava os botões e mostra erros no andamento. */
async function ocupado(acao) {
  $('gerar').disabled = $('refazer').disabled = $('variar').disabled = true; $('parar').disabled = false;
  try {
    await acao();
    log('Pronto.');
  } catch (erro) {
    log(`Erro: ${erro.message}`);
    console.error(erro);
  } finally {
    estado.trabalhadores = [];
    $('gerar').disabled = $('refazer').disabled = $('variar').disabled = false; $('parar').disabled = true;
    $('salvar-pasta').disabled = $('baixar').disabled = estado.puzzles.size === 0;
  }
}

/** Gera o lote pedido; o que já está no lote (ou publicado) é pulado. */
function gerar() {
  const inicio = $('inicio').value;
  const dias = Number($('dias').value);
  const niveis = NIVEIS.filter(n => document.querySelector(`[data-nivel="${n}"]`).checked);
  if (!inicio || !dias || !niveis.length) { log('Escolha o primeiro dia, a quantidade de dias e ao menos um nível.'); return Promise.resolve(); }
  return ocupado(async () => {
    const base = await carregarBase();
    const { maiorId, recentes } = await lerExistentes(inicio, dias);
    const evitar = new Set([...recentes, ...palavrasDoLote()]); // cresce a cada puzzle pronto
    for (const p of estado.puzzles.values()) registrarCurtas(p.data, p.dicas);
    const fila = [];
    let proximoId = Math.max(maiorId, ...[...estado.puzzles.values()].map(p => p.id)) + 1;
    for (let i = 0; i < dias; i++) {
      const data = somarDias(inicio, i);
      for (const nivel of niveis) {
        const arquivo = `${data}-${nivel}`;
        if ((estado.indice[data] || []).includes(nivel)) { log(`${arquivo}: já publicada, pulando.`); continue; }
        if (estado.puzzles.has(arquivo)) continue; // já gerada neste lote
        fila.push({ arquivo, data, nivel, id: proximoId++, tentativa: 0 });
      }
    }
    await executar(fila, base, evitar);
    log(resumoRepeticoes());
  });
}

/**
 * Relê tools/proibidas.txt e gera de novo só as cruzadas do lote que têm alguma
 * palavra proibida (mantendo número e data). As outras ficam como estão.
 */
function refazerProibidas() {
  return ocupado(async () => {
    const base = await carregarBase(true);
    const ruins = [...estado.puzzles].filter(([, p]) => p.dicas.some(d => estado.proibidas.has(d.resposta)));
    if (!ruins.length) { log('Nenhuma cruzada do lote tem palavra proibida.'); return; }
    for (const [arquivo, p] of ruins) {
      log(`${arquivo}: tem ${p.dicas.filter(d => estado.proibidas.has(d.resposta)).map(d => d.resposta).join(', ')}.`);
    }
    const datas = [...estado.puzzles.values()].map(p => p.data).sort();
    const { recentes } = await lerExistentes(datas[0], 31);
    const refazer = new Set(ruins.map(([a]) => a));
    const evitar = new Set([...recentes, ...palavrasDoLote(refazer)]);
    // primeiro tenta o conserto local (troca só as palavras ruins); se não der, gera de novo
    const fila = ruins.map(([arquivo, p]) => ({
      arquivo, data: p.data, nivel: p.nivel, id: p.id, tentativa: 10 * (1 + Math.floor(Math.random() * 100)), // sementes novas
      conserto: { grade: p.grade, semente: p.semente, ruins: p.dicas.map(d => d.resposta).filter(r => estado.proibidas.has(r)) },
    }));
    await executar(fila, base, evitar);
  });
}

// ---------- Dicas ----------

/** {nivel: {PALAVRA: texto}, "AAAA-MM-DD-nivel": {PALAVRA: texto}}; o do arquivo vale mais. */
export function aplicarDicas(textos) {
  const faltam = {};
  for (const [arquivo, p] of estado.puzzles) {
    const mapa = { ...(textos[p.nivel] || {}), ...(textos[arquivo] || {}) };
    for (const d of p.dicas) if (mapa[d.resposta]) d.texto = mapa[d.resposta];
    const sem = p.dicas.filter(d => !d.texto).map(d => d.resposta);
    if (sem.length) faltam[arquivo] = sem;
  }
  guardarLote();
  desenhar();
  return faltam;
}

/** Palavras ainda sem texto, por nível (para escrever as dicas). */
export function palavrasSemDica() {
  const out = {};
  for (const p of estado.puzzles.values()) {
    out[p.nivel] ||= new Set();
    p.dicas.forEach(d => !d.texto && out[p.nivel].add(d.resposta));
  }
  return Object.fromEntries(Object.entries(out).map(([n, s]) => [n, [...s].sort()]));
}

// ---------- Saída ----------

function desenhar() {
  const area = $('puzzles');
  area.replaceChildren();
  for (const [arquivo, p] of [...estado.puzzles].sort()) {
    const card = document.createElement('div');
    card.className = 'puzzle';
    const sem = p.dicas.filter(d => !d.texto).length;
    card.innerHTML = `<h3>${arquivo} · Nº ${p.id} · ${p.titulo}</h3><pre></pre><div class="palavras"></div>`;
    card.querySelector('pre').textContent = p.grade.join('\n');
    const palavras = card.querySelector('.palavras');
    palavras.textContent = p.dicas.map(d => d.resposta).join(' ');
    if (sem) { const f = document.createElement('div'); f.className = 'faltam'; f.textContent = `${sem} dica(s) sem texto`; palavras.append(f); }
    area.append(card);
  }
}

function avisarSemTexto() {
  const sem = [...estado.puzzles.values()].filter(p => p.dicas.some(d => !d.texto)).length;
  return sem === 0 || confirm(`${sem} cruzada(s) ainda têm dicas sem texto e não vão passar no validador. Salvar mesmo assim?`);
}

async function salvarNaPasta() {
  if (!('showDirectoryPicker' in window)) { alert('Este navegador não deixa salvar em pasta. Use "Baixar um por um".'); return; }
  if (!avisarSemTexto()) return;
  const pasta = await window.showDirectoryPicker({ mode: 'readwrite', id: 'puzzles' });
  const gravar = async (nome, conteudo) => {
    const arquivo = await pasta.getFileHandle(nome, { create: true });
    const escrita = await arquivo.createWritable();
    await escrita.write(conteudo);
    await escrita.close();
  };
  for (const [arquivo, p] of estado.puzzles) await gravar(`${arquivo}.json`, serializar(p));
  await gravar('index.json', indiceAtualizado());
  log(`${estado.puzzles.size} arquivo(s) e o index.json salvos em "${pasta.name}".`);
}

function baixar() {
  if (!avisarSemTexto()) return;
  const arquivos = [...[...estado.puzzles].map(([a, p]) => [`${a}.json`, serializar(p)]), ['index.json', indiceAtualizado()]];
  arquivos.forEach(([nome, conteudo], i) => setTimeout(() => {
    const url = URL.createObjectURL(new Blob([conteudo], { type: 'application/json' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: nome });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }, i * 300));
}

// ---------- Início ----------

async function iniciar() {
  $('url-frequencia').value = URL_FREQUENCIA;
  $('url-dicionario').value = URL_DICIONARIO;
  // um trabalho por núcleo do processador, deixando um livre para a página
  $('paralelos').value = Math.max(1, (navigator.hardwareConcurrency || 4) - 1);
  // Primeiro dia sugerido: o dia seguinte ao último puzzle publicado.
  try {
    const datas = Object.keys(JSON.parse(await buscarTexto('../puzzles/index.json')).datas || {}).sort();
    if (datas.length) $('inicio').value = somarDias(datas.at(-1), 1);
  } catch { /* sem index.json: o usuário escolhe */ }

  restaurarLote();
  desenhar();
  $('salvar-pasta').disabled = $('baixar').disabled = estado.puzzles.size === 0;
  $('gerar').addEventListener('click', gerar);
  $('refazer').addEventListener('click', refazerProibidas);
  $('variar').addEventListener('click', variarLote);
  $('limpar').addEventListener('click', () => {
    if (!estado.puzzles.size || confirm('Apagar o lote atual (cruzadas geradas e dicas aplicadas)?')) {
      estado.puzzles = new Map(); guardarLote(); desenhar(); log('Lote limpo.');
    }
  });
  $('parar').addEventListener('click', () => estado.pararTudo && estado.pararTudo());
  $('aplicar').addEventListener('click', () => {
    try {
      const faltam = aplicarDicas(JSON.parse($('dicas').value || '{}'));
      const total = Object.values(faltam).reduce((s, l) => s + l.length, 0);
      log(total ? `Dicas aplicadas; ainda faltam ${total} em ${Object.keys(faltam).length} cruzada(s).` : 'Todas as dicas têm texto.');
    } catch (erro) { log(`JSON das dicas inválido: ${erro.message}`); }
  });
  $('copiar-palavras').addEventListener('click', async () => {
    const texto = JSON.stringify(palavrasSemDica(), null, 1);
    try { await navigator.clipboard.writeText(texto); log('Lista de palavras copiada.'); } catch { $('dicas').value = texto; }
  });
  $('salvar-pasta').addEventListener('click', () => salvarNaPasta().catch(e => log(`Não salvou: ${e.message}`)));
  $('baixar').addEventListener('click', baixar);
}

// Para automação/testes pelo console.
window.gerador = { estado, gerar, refazerProibidas, variarLote, aplicarDicas, palavrasSemDica, serializar, indiceAtualizado, escolherBanco, carregarBase, resumoRepeticoes };

iniciar();
