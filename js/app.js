// Inicialização e escolha do puzzle por data.

import { hojeEmBrasilia, dataValida, dataPorExtenso, dataCurta, diasEntre, somarDias } from './datas.js';
import { renderizarGrade, ajustarTamanho, colocarGabarito } from './grade.js';
import { Tinta } from './tinta.js';
import { iniciarDiagnostico } from './diagnostico.js';
import { iniciarHistorico } from './historico.js';
import { carregarTinta, salvarTinta, pedirPersistencia, carregarRegistro, atualizarRegistro } from './armazenamento.js';

// Versão do app, mostrada discretamente no cabeçalho.
// IMPORTANTE: precisa ser igual à VERSAO de sw.js, que deve subir a cada mudança
// em HTML/CSS/JS (é o que faz o tablet perceber que há versão nova).
const VERSAO = 9;

const $ = id => document.getElementById(id);
const parametros = new URLSearchParams(location.search);

// ?hoje=AAAA-MM-DD finge que hoje é outra data (só para testar o fluxo de "ontem").
const HOJE_FINGIDO = dataValida(parametros.get('hoje')) ? parametros.get('hoje') : null;
const hoje = () => HOJE_FINGIDO ?? hojeEmBrasilia();

/** Endereço da página para uma data, mantendo ?hoje e ?debug. Hoje = sem ?data. */
function endereco(data) {
  const p = new URLSearchParams(location.search);
  if (data === hoje()) p.delete('data'); else p.set('data', data);
  const busca = p.toString();
  return location.pathname + (busca ? `?${busca}` : '');
}

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

  // Cores da caneta: escolher uma cor também ativa a caneta.
  const cores = [...document.querySelectorAll('[data-cor]')];
  const escolherCor = (cor, ativarCaneta) => {
    tinta.usarCor(cor);
    cores.forEach(b => b.classList.toggle('escolhida', b.dataset.cor === tinta.cor));
    const escolhida = cores.find(b => b.dataset.cor === tinta.cor);
    if (escolhida) $('botao-caneta').style.color = getComputedStyle(escolhida).getPropertyValue('--cor');
    gravarPreferencia('cor', tinta.cor);
    if (ativarCaneta) escolher('caneta');
  };
  cores.forEach(b => b.addEventListener('click', () => escolherCor(b.dataset.cor, true)));
  escolherCor(lerPreferencia('cor', 'preta'), false);

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

// ---------- Avisos ----------

function mostrarAviso(texto) {
  const aviso = $('aviso');
  aviso.textContent = aviso.hidden || !aviso.textContent ? texto : `${aviso.textContent} ${texto}`;
  aviso.hidden = false;
}

let temporizadorToast = null;
function mostrarToast(texto) {
  const toast = $('toast');
  toast.textContent = texto;
  toast.hidden = false;
  clearTimeout(temporizadorToast);
  temporizadorToast = setTimeout(() => { toast.hidden = true; }, 3500);
}

// ---------- Salvar a tinta (IndexedDB) ----------

/** Salva os traços da data; várias mudanças seguidas viram uma gravação só. */
function criarSalvador(data, tinta) {
  let fila = Promise.resolve();
  let agendado = false;
  let falhou = false;
  return () => {
    if (agendado) return fila;
    agendado = true;
    fila = fila
      .then(() => { agendado = false; return salvarTinta(data, tinta.exportar()); })
      .catch(erro => {
        agendado = false;
        console.error(erro);
        if (!falhou) mostrarAviso('Atenção: não foi possível salvar a tinta neste aparelho.');
        falhou = true;
      });
    return fila;
  };
}

// ---------- Gesto de voltar ----------

/**
 * Coloca uma entrada extra no histórico depois de um traço. Se o gesto de voltar
 * do Android disparar sem querer, ele consome essa entrada e a página fica onde está.
 * O Chrome só respeita entradas criadas logo após uma ação do usuário (o traço),
 * por isso a proteção é rearmada no fim de cada traço, não dentro do popstate.
 */
function criarProtecaoVoltar() {
  const marca = `${Date.now()}-${Math.random()}`; // distingue de entradas de aberturas anteriores
  let armada = false;
  window.addEventListener('popstate', () => {
    if (armada && !(history.state && history.state.guarda === marca)) {
      armada = false;
      mostrarToast('Gesto de voltar ignorado. Para sair, faça o gesto de novo.');
    }
  });
  return () => {
    if (armada) return;
    try {
      history.pushState({ guarda: marca }, '');
      armada = true;
    } catch { /* sem histórico: tudo bem */ }
  };
}

// ---------- Virada da meia-noite ----------

/** Confere a data a cada minuto e ao voltar ao app; avisa, sem trocar à força. */
function vigiarVirada(dataAberta, aoTrocar) {
  const conferir = () => {
    if (hoje() === dataAberta) return;
    const faixa = $('novo-puzzle');
    faixa.hidden = false;
    faixa.onclick = aoTrocar;
  };
  setInterval(conferir, 60 * 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') conferir();
  });
}

// ---------- Service worker: abrir sem internet e avisar de versão nova ----------

/**
 * Registra o sw.js. Quando uma versão nova é publicada, o navegador baixa o sw.js
 * novo, que fica "esperando"; aí mostramos a faixa. Ao tocar, ele assume e a
 * página recarrega já com os arquivos novos. Nunca recarrega sozinho.
 */
function registrarServiceWorker(antesDeRecarregar) {
  if (!('serviceWorker' in navigator)) return;
  let recarregar = false;

  const oferecer = registro => {
    if (!registro.waiting || !navigator.serviceWorker.controller) return;
    const faixa = $('atualizacao');
    faixa.hidden = false;
    faixa.onclick = async () => {
      faixa.disabled = true;
      await antesDeRecarregar();
      recarregar = true;
      registro.waiting.postMessage({ tipo: 'atualizar' });
    };
  };

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (recarregar) location.reload();
  });

  navigator.serviceWorker.register('sw.js').then(registro => {
    oferecer(registro);
    registro.addEventListener('updatefound', () => {
      const novo = registro.installing;
      if (!novo) return;
      novo.addEventListener('statechange', () => {
        if (novo.state === 'installed') oferecer(registro);
      });
    });
    // Página aberta por muito tempo: procura versão nova ao voltar para ela.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') registro.update().catch(() => {});
    });
  }).catch(erro => console.warn('Service worker não registrado:', erro));
}

/** Busca os puzzles dos próximos 7 dias para o service worker guardar (uso offline). */
function precarregarProximos(hoje, datas) {
  for (let i = 1; i <= 7; i++) {
    const dia = somarDias(hoje, i);
    if (datas.includes(dia)) fetch(`puzzles/${dia}.json`, { cache: 'no-cache' }).catch(() => {});
  }
}

// ---------- Registro do dia: Terminei, gabarito e avaliação ----------

/**
 * Mostra as ações que fazem sentido para a data aberta:
 *  - hoje: "Terminei" (marca/desmarca) e "Ontem" (abre o gabarito de ontem);
 *  - dia passado: gabarito em verde, avaliação do dia e "Hoje";
 *  - dia futuro (só em teste): apenas "Hoje".
 * Editar a tinta de um dia passado não mexe no registro.
 */
async function configurarDia({ data, arquivo, irPara }) {
  const diaDeHoje = hoje();
  const passado = data < diaDeHoje;

  let registro = null;
  try {
    registro = await carregarRegistro(data);
  } catch (erro) {
    console.error(erro);
  }

  const gravar = async (mudancas, mensagem) => {
    try {
      registro = await atualizarRegistro(data, { puzzle: arquivo, ...mudancas });
      if (mensagem) mostrarToast(mensagem);
      return true;
    } catch (erro) {
      console.error(erro);
      mostrarAviso('Atenção: não foi possível salvar o registro do dia neste aparelho.');
      return false;
    }
  };

  if (data !== diaDeHoje) {
    const botao = $('ir-hoje');
    botao.hidden = false;
    botao.addEventListener('click', () => irPara(diaDeHoje));
  }

  if (data === diaDeHoje) {
    // "Terminei": opcional; tocar de novo desfaz (caso tenha sido sem querer).
    const terminei = $('terminei');
    const pintar = () => {
      const marcado = Boolean(registro && registro.terminei);
      terminei.setAttribute('aria-pressed', String(marcado));
      terminei.textContent = marcado ? '✓ Terminei' : 'Terminei';
    };
    pintar();
    terminei.hidden = false;
    terminei.addEventListener('click', async () => {
      const marcar = !(registro && registro.terminei);
      const ok = await gravar(
        { terminei: marcar, termineiEm: marcar ? new Date().toISOString() : null },
        marcar ? 'Registrado: terminei hoje. O gabarito sai amanhã.' : 'Registro de hoje desfeito.',
      );
      if (ok) pintar();
    });

    const ontem = somarDias(diaDeHoje, -1);
    const botaoOntem = $('ir-ontem');
    botaoOntem.hidden = false;
    botaoOntem.addEventListener('click', () => irPara(ontem));
    lembrarOntem(ontem, () => irPara(ontem));
  }

  if (passado) {
    // Gabarito em verde, por baixo da tinta.
    const grade = $('grade');
    const alternar = $('alternar-gabarito');
    const mostrar = visivel => {
      grade.classList.toggle('com-gabarito', visivel);
      alternar.textContent = visivel ? 'Ocultar gabarito' : 'Mostrar gabarito';
      gravarPreferencia('gabarito', visivel ? 'mostrar' : 'ocultar');
    };
    mostrar(lerPreferencia('gabarito', 'mostrar') !== 'ocultar');
    alternar.addEventListener('click', () => mostrar(!grade.classList.contains('com-gabarito')));

    // Avaliação do dia: pode ser trocada depois, se tocou errado.
    const opcoes = [...document.querySelectorAll('[data-avaliacao]')];
    const pintar = () => opcoes.forEach(b =>
      b.setAttribute('aria-pressed', String(Boolean(registro) && registro.avaliacao === b.dataset.avaliacao)));
    pintar();
    opcoes.forEach(b => b.addEventListener('click', async () => {
      if (registro && registro.avaliacao === b.dataset.avaliacao) return;
      const ok = await gravar(
        { avaliacao: b.dataset.avaliacao, avaliadoEm: new Date().toISOString() },
        `Registrado: ${b.textContent.toLowerCase()} em ${dataCurta(data)}.`,
      );
      if (ok) pintar();
    }));
    $('avaliacao').hidden = false;
  }
}

/** Ontem jogado (tinta ou "Terminei") e ainda sem avaliação: mostra um lembrete discreto. */
async function lembrarOntem(ontem, abrir) {
  try {
    const [registro, tracos] = await Promise.all([carregarRegistro(ontem), carregarTinta(ontem)]);
    if (registro && registro.avaliacao) return;
    if (!(registro && registro.terminei) && tracos.length === 0) return;
    const faixa = $('lembrete-ontem');
    faixa.hidden = false;
    faixa.onclick = abrir;
  } catch (erro) {
    console.error(erro);
  }
}

// ---------- Início ----------

async function iniciar() {
  $('versao').textContent = `v${VERSAO}`;
  if (parametros.get('debug') === '1') iniciarDiagnostico(VERSAO);

  // Antes de recarregar para uma versão nova, grava a tinta (trocado abaixo).
  let salvarAntesDeSair = async () => {};
  registrarServiceWorker(() => salvarAntesDeSair());

  // ?data=AAAA-MM-DD abre um dia específico (útil para testar).
  const pedida = parametros.get('data');
  const data = dataValida(pedida) ? pedida : hoje();

  // "domingo, 15 de novembro" + " de 2026" (o ano some em telas estreitas, para caber).
  const extenso = dataPorExtenso(data);
  const corte = extenso.lastIndexOf(' de ');
  const ano = document.createElement('span');
  ano.className = 'ano';
  ano.textContent = extenso.slice(corte);
  $('data-extenso').replaceChildren(extenso.slice(0, corte), ano);
  $('data-extenso').title = extenso;

  try {
    const { datas } = await buscarJSON('puzzles/index.json');
    if (!datas || datas.length === 0) throw new Error('puzzles/index.json está vazio');

    const { arquivo, substituto } = escolherPuzzle(data, datas);
    const puzzle = await buscarJSON(`puzzles/${arquivo}.json`);

    $('edicao').textContent = `Nº ${puzzle.id} · ${puzzle.titulo}`;
    if (substituto) {
      const aviso = $('aviso');
      aviso.textContent = `Sem puzzle novo para ${data === hoje() ? "hoje" : "este dia"}, mostrando o de ${dataCurta(arquivo)}. O banco precisa de puzzles novos.`;
      aviso.hidden = false;
    }

    renderizarGrade($('grade'), puzzle);
    if (data < hoje()) colocarGabarito($('grade'), puzzle); // como no jornal: só no dia seguinte
    const ajustar = () => ajustarTamanho($('grade'), $('folha'), puzzle);
    ajustar();
    // Girar a tela ou redimensionar a janela: recalcula o tamanho das casas.
    new ResizeObserver(() => requestAnimationFrame(ajustar)).observe($('folha'));

    // Tinta salva desta data (antes de liberar a caneta, para nada ser sobrescrito).
    let salvos = [];
    let leuTinta = true;
    try {
      salvos = await carregarTinta(data);
    } catch (erro) {
      console.error(erro);
      leuTinta = false;
      mostrarAviso(String(erro.message).includes('bloqueado')
        ? 'Há outra aba do Cruzadas aberta com a versão antiga: feche-a e recarregue esta.'
        : 'Atenção: não foi possível ler a tinta salva neste aparelho.');
    }

    const armarVoltar = criarProtecaoVoltar();
    let persistenciaPedida = false;
    let salvar = () => {};

    const tinta = new Tinta($('papel'), {
      aoMudarHistorico: (podeDesfazer, podeRefazer) => {
        $('desfazer').disabled = !podeDesfazer;
        $('refazer').disabled = !podeRefazer;
      },
      aoMudar: () => salvar(),          // ao fim de cada traço, apagada, desfazer, refazer
      aoTerminarGesto: () => {
        armarVoltar();
        if (!persistenciaPedida) { persistenciaPedida = true; pedirPersistencia(); }
      },
    });
    tinta.importar(salvos);
    // Se não deu para ler a tinta guardada, não grava por cima dela (perderia o que já estava lá).
    salvar = leuTinta ? criarSalvador(data, tinta) : async () => {};
    salvarAntesDeSair = () => salvar();
    configurarFerramentas(tinta);
    precarregarProximos(hojeEmBrasilia(), datas);

    // Trocar de dia (Ontem / Hoje / lembrete): grava a tinta antes de sair.
    const irPara = async destino => {
      await salvar();
      location.assign(endereco(destino));
    };
    configurarDia({ data, arquivo, irPara });

    // Painel "Meu histórico" (estatísticas, calendário, backup).
    iniciarHistorico({
      hoje,
      antesDeLer: () => salvar(),
      irPara,
      aoImportar: async gravarBackup => {
        // Para de salvar a tinta aberta, senão ela gravaria por cima do dia importado.
        await salvar();
        const salvarAnterior = salvar;
        salvar = async () => {};
        try {
          await gravarBackup();
        } catch (erro) {
          salvar = salvarAnterior;
          throw erro;
        }
        location.reload();
      },
    });

    // Ao sair do app (trocar de app, apagar a tela), garante a última gravação.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') salvar();
    });

    // Aberto como "hoje": avisa quando virar o dia em Brasília.
    if (!dataValida(pedida)) {
      vigiarVirada(data, async () => {
        await salvar();
        location.replace(location.pathname);
      });
    }
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
