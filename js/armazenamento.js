// Persistência local no IndexedDB, uma entrada por data (AAAA-MM-DD):
//  - tinta:    os traços do dia;
//  - registro: o que aconteceu no dia (terminei, avaliação do gabarito).
// Se o armazenamento falhar, o app continua funcionando (só não guarda),
// e quem chama recebe o erro para avisar o usuário.

const BANCO = 'cruzadas-do-dia';
const VERSAO_BANCO = 2;          // 1: tinta · 2: + registro
const LOJA_TINTA = 'tinta';       // { data, tracos: [...], atualizado }
const LOJA_REGISTRO = 'registro'; // { data, puzzle, terminei, termineiEm, avaliacao, avaliadoEm }

/** Avaliações possíveis do dia, na ordem dos botões. */
export const AVALIACOES = {
  'acertei-tudo': 'Acertei tudo',
  'errei-algumas': 'Errei algumas',
  'nao-terminei': 'Não terminei',
};

let bancoAberto = null;

function abrir() {
  if (bancoAberto) return bancoAberto;
  bancoAberto = new Promise((resolver, rejeitar) => {
    let pedido;
    try {
      pedido = indexedDB.open(BANCO, VERSAO_BANCO);
    } catch (erro) {
      rejeitar(erro);
      return;
    }
    // Cria só o que falta: a tinta já salva na versão 1 continua lá.
    pedido.onupgradeneeded = () => {
      const banco = pedido.result;
      for (const loja of [LOJA_TINTA, LOJA_REGISTRO]) {
        if (!banco.objectStoreNames.contains(loja)) banco.createObjectStore(loja, { keyPath: 'data' });
      }
    };
    pedido.onsuccess = () => {
      const banco = pedido.result;
      // Outra aba abriu uma versão mais nova do banco: fecha esta conexão para não travá-la.
      banco.onversionchange = () => { banco.close(); bancoAberto = null; };
      resolver(banco);
    };
    pedido.onerror = () => rejeitar(pedido.error);
    // Outra aba com a versão antiga aberta segura a atualização do banco (às vezes sem
    // nem disparar "blocked"). Se não abrir em alguns segundos, desiste para a página
    // não travar; quem chama avisa e não grava por cima de nada.
    setTimeout(() => rejeitar(new Error('IndexedDB bloqueado por outra aba do Cruzadas aberta')), 5000);
  });
  bancoAberto.catch(() => { bancoAberto = null; }); // permite tentar de novo depois
  return bancoAberto;
}

function transacao(nomeLoja, modo, operacao) {
  return abrir().then(banco => new Promise((resolver, rejeitar) => {
    const tx = banco.transaction(nomeLoja, modo);
    const pedido = operacao(tx.objectStore(nomeLoja));
    tx.oncomplete = () => resolver(pedido ? pedido.result : undefined);
    tx.onerror = () => rejeitar(tx.error);
    tx.onabort = () => rejeitar(tx.error || new Error('transação abortada'));
  }));
}

// ---------- Tinta ----------

/** Traços salvos para a data, ou [] se ainda não houver nada. */
export async function carregarTinta(data) {
  const salvo = await transacao(LOJA_TINTA, 'readonly', loja => loja.get(data));
  return salvo ? salvo.tracos : [];
}

/** Grava (substitui) os traços da data. */
export function salvarTinta(data, tracos) {
  return transacao(LOJA_TINTA, 'readwrite', loja => loja.put({ data, tracos, atualizado: new Date().toISOString() }));
}

// ---------- Registro do dia ----------

/** Registro da data, ou null se nada foi marcado. */
export async function carregarRegistro(data) {
  return (await transacao(LOJA_REGISTRO, 'readonly', loja => loja.get(data))) || null;
}

/** Junta `mudancas` ao registro da data (lê e grava na mesma transação). Devolve o registro novo. */
export function atualizarRegistro(data, mudancas) {
  let novo;
  return transacao(LOJA_REGISTRO, 'readwrite', loja => {
    const leitura = loja.get(data);
    leitura.onsuccess = () => {
      novo = { data, terminei: false, termineiEm: null, avaliacao: null, avaliadoEm: null, ...leitura.result, ...mudancas };
      loja.put(novo);
    };
    return null;
  }).then(() => novo);
}

// ---------- Tudo de uma vez (histórico e backup) ----------

/** Todas as entradas de tinta e de registro: { tinta: [...], registro: [...] }. */
export function lerTudo() {
  return abrir().then(banco => new Promise((resolver, rejeitar) => {
    const tx = banco.transaction([LOJA_TINTA, LOJA_REGISTRO], 'readonly');
    const tinta = tx.objectStore(LOJA_TINTA).getAll();
    const registro = tx.objectStore(LOJA_REGISTRO).getAll();
    tx.oncomplete = () => resolver({ tinta: tinta.result, registro: registro.result });
    tx.onerror = () => rejeitar(tx.error);
    tx.onabort = () => rejeitar(tx.error || new Error('transação abortada'));
  }));
}

/**
 * Grava as entradas de um backup numa transação só (ou entra tudo, ou nada).
 * Cada data do backup substitui a mesma data deste aparelho; as outras ficam.
 */
export function gravarBackup({ tinta, registro }) {
  return abrir().then(banco => new Promise((resolver, rejeitar) => {
    const tx = banco.transaction([LOJA_TINTA, LOJA_REGISTRO], 'readwrite');
    const lojaTinta = tx.objectStore(LOJA_TINTA);
    const lojaRegistro = tx.objectStore(LOJA_REGISTRO);
    tinta.forEach(item => lojaTinta.put(item));
    registro.forEach(item => lojaRegistro.put(item));
    tx.oncomplete = () => resolver();
    tx.onerror = () => rejeitar(tx.error);
    tx.onabort = () => rejeitar(tx.error || new Error('transação abortada'));
  }));
}

/**
 * Pede ao navegador para não apagar os dados sozinho quando faltar espaço.
 * O Chrome decide (costuma aceitar para sites instalados/muito usados).
 */
export async function pedirPersistencia() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    }
  } catch { /* sem suporte: tudo bem */ }
  return false;
}
