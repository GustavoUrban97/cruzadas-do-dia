// Painel "Meu histórico": estatísticas no estilo do Termo, calendário dos dias
// e backup (exportar/importar a tinta e o registro como arquivo JSON).

import { dataValida, somarDias, dataCurta } from './datas.js';
import { lerTudo, gravarBackup } from './armazenamento.js';

const $ = id => document.getElementById(id);

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho',
  'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const ROTULOS = {
  'acertei-tudo': 'Acertei tudo',
  'errei-algumas': 'Errei algumas',
  'nao-terminei': 'Não terminei',
  'terminei': 'Terminei (falta avaliar)',
  'jogou': 'Jogou (falta avaliar)',
};

// ---------- Cálculo (funções puras) ----------

/**
 * Estado de cada dia jogado: avaliação, se houver; senão "terminei" (marcou
 * Terminei e não avaliou) ou "jogou" (só tem tinta). Dia sem nada = não jogou.
 */
export function estadosDosDias({ tinta, registro }) {
  const estados = new Map();
  for (const t of tinta) {
    if (t && dataValida(t.data) && Array.isArray(t.tracos) && t.tracos.length) estados.set(t.data, 'jogou');
  }
  for (const r of registro) {
    if (!r || !dataValida(r.data)) continue;
    if (r.avaliacao && ROTULOS[r.avaliacao]) estados.set(r.data, r.avaliacao);
    else if (r.terminei) estados.set(r.data, 'terminei');
  }
  return estados;
}

const terminou = estado => estado === 'acertei-tudo' || estado === 'errei-algumas' || estado === 'terminei';

/** Números do painel. Só contam dias até hoje. */
export function calcularEstatisticas(estados, hoje) {
  const dias = [...estados.keys()].filter(d => d <= hoje).sort();
  const contagem = { 'acertei-tudo': 0, 'errei-algumas': 0, 'nao-terminei': 0 };
  for (const d of dias) {
    const e = estados.get(d);
    if (e in contagem) contagem[e]++;
  }
  const avaliados = contagem['acertei-tudo'] + contagem['errei-algumas'] + contagem['nao-terminei'];

  // Sequência atual: para trás a partir de hoje; hoje ainda em andamento não quebra.
  let atual = 0;
  let d = terminou(estados.get(hoje)) ? hoje : somarDias(hoje, -1);
  while (terminou(estados.get(d))) { atual++; d = somarDias(d, -1); }

  // Melhor sequência: maior trecho de dias seguidos terminados.
  let melhor = 0, trecho = 0, anterior = null;
  for (const dia of dias) {
    if (!terminou(estados.get(dia))) { trecho = 0; anterior = dia; continue; }
    trecho = anterior && somarDias(anterior, 1) === dia && trecho > 0 ? trecho + 1 : 1;
    melhor = Math.max(melhor, trecho);
    anterior = dia;
  }

  return {
    jogados: dias.length,
    porcentagem: avaliados ? Math.round((contagem['acertei-tudo'] / avaliados) * 100) : 0,
    atual,
    melhor: Math.max(melhor, atual),
    contagem,
  };
}

// ---------- Painel ----------

/**
 * Liga o botão do cabeçalho ao painel.
 *  - hoje():        data de hoje (AAAA-MM-DD), respeitando ?hoje= nos testes;
 *  - antesDeLer():  grava a tinta aberta, para o dia atual entrar na conta;
 *  - irPara(data):  abre o puzzle daquele dia;
 *  - aoImportar():  chamado depois de importar (a página para de salvar e recarrega).
 */
export function iniciarHistorico({ hoje, antesDeLer, irPara, aoImportar }) {
  const painel = $('historico');
  let mesVisto = null;   // 'AAAA-MM'
  let estados = new Map();
  let primeiroMes = null;

  const abrir = async () => {
    try { await antesDeLer(); } catch { /* segue com o que houver */ }
    try {
      estados = estadosDosDias(await lerTudo());
    } catch (erro) {
      console.error(erro);
      estados = new Map();
      $('historico-erro').textContent = 'Não foi possível ler o histórico neste aparelho.';
    }
    const diaDeHoje = hoje();
    const datas = [...estados.keys()].filter(d => d <= diaDeHoje).sort();
    primeiroMes = (datas[0] || diaDeHoje).slice(0, 7);
    mesVisto = diaDeHoje.slice(0, 7);
    desenharEstatisticas(calcularEstatisticas(estados, diaDeHoje));
    desenharCalendario();
    if (!painel.open) painel.showModal();
  };

  const desenharCalendario = () => {
    const diaDeHoje = hoje();
    const mesDeHoje = diaDeHoje.slice(0, 7);
    const [ano, mes] = mesVisto.split('-').map(Number);
    const nome = MESES[mes - 1];
    $('mes-nome').textContent = `${nome[0].toUpperCase()}${nome.slice(1)} de ${ano}`;
    $('mes-anterior').disabled = mesVisto <= primeiroMes;
    $('mes-seguinte').disabled = mesVisto >= mesDeHoje;

    const grade = $('calendario');
    grade.replaceChildren();
    for (const inicial of ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']) {
      const s = document.createElement('span');
      s.className = 'cal-semana';
      s.textContent = inicial;
      grade.append(s);
    }
    const primeiro = `${mesVisto}-01`;
    const semana = new Date(Date.UTC(ano, mes - 1, 1)).getUTCDay(); // 0 = domingo
    for (let i = 0; i < semana; i++) grade.append(document.createElement('span'));

    for (let dia = primeiro; dia.startsWith(mesVisto); dia = somarDias(dia, 1)) {
      const botao = document.createElement('button');
      botao.type = 'button';
      botao.className = 'cal-dia';
      botao.textContent = String(Number(dia.slice(8)));
      const estado = estados.get(dia);
      if (estado) botao.classList.add(`estado-${estado}`);
      if (dia === diaDeHoje) botao.classList.add('hoje');
      if (dia > diaDeHoje) {
        botao.disabled = true;
      } else {
        botao.title = `${dataCurta(dia)}: ${estado ? ROTULOS[estado] : 'não jogou'}`;
        const destino = dia;
        botao.addEventListener('click', () => { painel.close(); irPara(destino); });
      }
      grade.append(botao);
    }
  };

  const mudarMes = passo => {
    const [ano, mes] = mesVisto.split('-').map(Number);
    const d = new Date(Date.UTC(ano, mes - 1 + passo, 1));
    mesVisto = d.toISOString().slice(0, 7);
    desenharCalendario();
  };

  $('abrir-historico').addEventListener('click', abrir);
  $('fechar-historico').addEventListener('click', () => painel.close());
  $('mes-anterior').addEventListener('click', () => mudarMes(-1));
  $('mes-seguinte').addEventListener('click', () => mudarMes(1));
  // Tocar fora do quadro (no fundo escurecido) fecha.
  painel.addEventListener('click', e => { if (e.target === painel) painel.close(); });

  $('exportar').addEventListener('click', async () => {
    try {
      await antesDeLer();
      await exportar(hoje());
    } catch (erro) {
      console.error(erro);
      alert(`Não foi possível exportar: ${erro.message}`);
    }
  });

  const escolher = $('arquivo-backup');
  $('importar').addEventListener('click', () => escolher.click());
  escolher.addEventListener('change', async () => {
    const arquivo = escolher.files[0];
    escolher.value = '';
    if (!arquivo) return;
    try {
      const backup = lerBackup(await arquivo.text());
      const datas = [...new Set([...backup.tinta, ...backup.registro].map(x => x.data))].sort();
      if (datas.length === 0) { alert('O arquivo não tem nenhum dia salvo.'); return; }
      const ok = confirm(
        `O arquivo tem ${datas.length} dia(s), de ${formatar(datas[0])} a ${formatar(datas.at(-1))}.\n\n` +
        'Esses dias serão substituídos neste aparelho pelo que está no arquivo; os outros continuam como estão.\n\nContinuar?');
      if (!ok) return;
      await aoImportar(() => gravarBackup(backup));
    } catch (erro) {
      console.error(erro);
      alert(`Não foi possível importar: ${erro.message}`);
    }
  });
}

function desenharEstatisticas({ jogados, porcentagem, atual, melhor, contagem }) {
  $('historico-erro').textContent = '';
  $('est-jogados').textContent = jogados;
  $('est-porcentagem').textContent = porcentagem;
  $('est-atual').textContent = atual;
  $('est-melhor').textContent = melhor;

  const maior = Math.max(1, ...Object.values(contagem));
  const lista = $('distribuicao');
  lista.replaceChildren();
  for (const [chave, quantidade] of Object.entries(contagem)) {
    const linha = document.createElement('div');
    linha.className = 'dist-linha';
    const rotulo = document.createElement('span');
    rotulo.className = 'dist-rotulo';
    rotulo.textContent = ROTULOS[chave];
    const trilho = document.createElement('span');
    trilho.className = 'dist-trilho';
    const barra = document.createElement('span');
    barra.className = `dist-barra estado-${chave}`;
    barra.style.width = `${Math.max(8, (quantidade / maior) * 100)}%`;
    barra.textContent = quantidade;
    trilho.append(barra);
    linha.append(rotulo, trilho);
    lista.append(linha);
  }
}

const formatar = iso => `${dataCurta(iso)}/${iso.slice(0, 4)}`;

// ---------- Backup ----------

async function exportar(hoje) {
  const { tinta, registro } = await lerTudo();
  const conteudo = JSON.stringify({
    app: 'cruzadas-do-dia',
    formato: 1,
    exportadoEm: new Date().toISOString(),
    tinta,
    registro,
  });
  const url = URL.createObjectURL(new Blob([conteudo], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `cruzadas-backup-${hoje}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** Lê e confere um arquivo de backup; devolve só as entradas válidas. */
export function lerBackup(texto) {
  let dados;
  try { dados = JSON.parse(texto); } catch { throw new Error('o arquivo não é um JSON válido'); }
  if (!dados || dados.app !== 'cruzadas-do-dia' || !Array.isArray(dados.tinta) || !Array.isArray(dados.registro)) {
    throw new Error('não parece um backup do Cruzadas do Dia');
  }
  if (dados.formato !== 1) throw new Error(`formato de backup desconhecido (${dados.formato})`);
  const tinta = dados.tinta.filter(t => t && dataValida(t.data) && Array.isArray(t.tracos));
  const registro = dados.registro.filter(r => r && dataValida(r.data) && typeof r === 'object');
  return { tinta, registro };
}
