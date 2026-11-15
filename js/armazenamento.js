// Persistência local da tinta no IndexedDB: um registro por data (AAAA-MM-DD).
// Tudo com try/catch: se o armazenamento falhar, o app continua funcionando
// (só não guarda), e quem chama recebe o erro para avisar o usuário.

const BANCO = 'cruzadas-do-dia';
const VERSAO_BANCO = 1;
const LOJA_TINTA = 'tinta'; // { data, tracos: [{ ferramenta, pontos }], atualizado }

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
    pedido.onupgradeneeded = () => {
      const banco = pedido.result;
      if (!banco.objectStoreNames.contains(LOJA_TINTA)) {
        banco.createObjectStore(LOJA_TINTA, { keyPath: 'data' });
      }
    };
    pedido.onsuccess = () => resolver(pedido.result);
    pedido.onerror = () => rejeitar(pedido.error);
    pedido.onblocked = () => rejeitar(new Error('IndexedDB bloqueado por outra aba'));
  });
  bancoAberto.catch(() => { bancoAberto = null; }); // permite tentar de novo depois
  return bancoAberto;
}

function transacao(modo, operacao) {
  return abrir().then(banco => new Promise((resolver, rejeitar) => {
    const tx = banco.transaction(LOJA_TINTA, modo);
    const pedido = operacao(tx.objectStore(LOJA_TINTA));
    tx.oncomplete = () => resolver(pedido ? pedido.result : undefined);
    tx.onerror = () => rejeitar(tx.error);
    tx.onabort = () => rejeitar(tx.error || new Error('transação abortada'));
  }));
}

/** Traços salvos para a data, ou [] se ainda não houver nada. */
export async function carregarTinta(data) {
  const registro = await transacao('readonly', loja => loja.get(data));
  return registro ? registro.tracos : [];
}

/** Grava (substitui) os traços da data. */
export function salvarTinta(data, tracos) {
  return transacao('readwrite', loja => loja.put({ data, tracos, atualizado: new Date().toISOString() }));
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
