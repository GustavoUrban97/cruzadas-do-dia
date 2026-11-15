// Inicialização e escolha do puzzle por data.

// ?v=N: mesmo número usado em index.html (veja o comentário lá).
import { hojeEmBrasilia, dataValida, dataPorExtenso, dataCurta, diasEntre } from './datas.js?v=6';
import { renderizarGrade, ajustarTamanho } from './grade.js?v=6';
import { Tinta } from './tinta.js?v=6';
import { iniciarDiagnostico } from './diagnostico.js?v=6';

// Versão do app, mostrada discretamente no cabeçalho (ajuda a saber se o tablet
// pegou a versão nova ou está abrindo uma antiga do cache).
const VERSAO = 6;

const $ = id => document.getElementById(id);
const parametros = new URLSearchParams(location.search);

async function buscarJSON(caminho) {
  const resposta = await fetch(caminho, { cache: 'no-cache' });
  if (!resposta.ok) throw new Error(`${caminho}: HTTP ${resposta.status}`);
  return resposta.json();
}

/**
 * Decide qual arquivo de puzzle abrir para a data pedida.
 * Se a data não existe no banco, usa um fallback determinístico:
 * dias desde o primeiro puzzle, ciclando pelos disponíveis.
 */
function escolherPuzzle(data, datasDisponiveis) {
  if (datasDisponiveis.includes(data)) return { arquivo: data, substituto: false };
  const n = datasDisponiveis.length;
  const dias = diasEntre(datasDisponiveis[0], data);
  const indice = ((dias % n) + n) % n;
  return { arquivo: datasDisponiveis[indice], substituto: true };
}

// ---------- Preferências leves (localStorage, sempre com try/catch) ----------

function lerPreferencia(chave, padrao) {
  try { return localStorage.getItem(chave) ?? padrao; } catch { return padrao; }
}

function gravarPreferencia(chave, valor) {
  try { localStorage.setItem(chave, valor); } catch { /* sem armazenamento: tudo bem */ }
}

// ---------- Barra de ferramentas ----------

function configurarFerramentas(tinta) {
  const botoes = [...document.querySelectorAll('[data-ferramenta]')];
  const escolher = nome => {
    tinta.usar(nome);
    botoes.forEach(b => b.classList.toggle('ativa', b.dataset.ferramenta === tinta.ferramenta));
    gravarPreferencia('ferramenta', tinta.ferramenta);
  };
  botoes.forEach(b => b.addEventListener('click', () => escolher(b.dataset.ferramenta)));
  escolher(lerPreferencia('ferramenta', 'caneta'));

  $('desfazer').addEventListener('click', () => tinta.desfazer());
  $('refazer').addEventListener('click', () => tinta.refazer());

  // Atalhos de teclado (útil no PC): Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z
  document.addEventListener('keydown', e => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const tecla = e.key.toLowerCase();
    if (tecla === 'z' && !e.shiftKey) { e.preventDefault(); tinta.desfazer(); }
    else if (tecla === 'y' || (tecla === 'z' && e.shiftKey)) { e.preventDefault(); tinta.refazer(); }
  });
}

// ---------- Início ----------

async function iniciar() {
  $('versao').textContent = `v${VERSAO}`;
  if (parametros.get('debug') === '1') iniciarDiagnostico(VERSAO);

  // ?data=AAAA-MM-DD abre um dia específico (útil para testar).
  const pedida = parametros.get('data');
  const data = dataValida(pedida) ? pedida : hojeEmBrasilia();

  $('data-extenso').textContent = dataPorExtenso(data);

  try {
    const { datas } = await buscarJSON('puzzles/index.json');
    if (!datas || datas.length === 0) throw new Error('puzzles/index.json está vazio');

    const { arquivo, substituto } = escolherPuzzle(data, datas);
    const puzzle = await buscarJSON(`puzzles/${arquivo}.json`);

    $('edicao').textContent = `Nº ${puzzle.id} · ${puzzle.titulo}`;
    if (substituto) {
      const aviso = $('aviso');
      aviso.textContent = `Sem puzzle novo para hoje, mostrando o de ${dataCurta(arquivo)}. O banco precisa de puzzles novos.`;
      aviso.hidden = false;
    }

    renderizarGrade($('grade'), puzzle);
    const ajustar = () => ajustarTamanho($('grade'), $('folha'), puzzle);
    ajustar();
    // Girar a tela ou redimensionar a janela: recalcula o tamanho das casas.
    new ResizeObserver(() => requestAnimationFrame(ajustar)).observe($('folha'));

    const tinta = new Tinta($('papel'), {
      aoMudarHistorico: (podeDesfazer, podeRefazer) => {
        $('desfazer').disabled = !podeDesfazer;
        $('refazer').disabled = !podeRefazer;
      },
      // aoMudar: salvar no IndexedDB entra na Etapa 3.
    });
    configurarFerramentas(tinta);
  } catch (erro) {
    console.error(erro);
    $('folha').innerHTML = '';
    const p = document.createElement('p');
    p.className = 'erro';
    p.textContent = `Não foi possível carregar o puzzle (${erro.message}).`;
    $('folha').append(p);
  }
}

iniciar();
