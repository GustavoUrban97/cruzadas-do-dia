// Inicialização e escolha do puzzle por data.

import { hojeEmBrasilia, dataValida, dataPorExtenso, dataCurta, diasEntre } from './datas.js';
import { renderizarGrade, ajustarTamanho } from './grade.js';

const $ = id => document.getElementById(id);

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

async function iniciar() {
  // ?data=AAAA-MM-DD abre um dia específico (útil para testar).
  const pedida = new URLSearchParams(location.search).get('data');
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
