// Web Worker: gera um puzzle (esqueleto + preenchimento) sem travar a página.
// Com "consertar", primeiro tenta trocar só as palavras ruins na grade existente.
import { rng, gerarEsqueleto, preencher, montar, consertar } from './esqueleto.js';

self.onmessage = ({ data: { id, lista, perfil, semente, tentativas = 40, conserto = null, soConserto = false } }) => {
  if (conserto) {
    const ruins = new Set(conserto.ruins);
    for (let s = semente; s < semente + 5; s++) {
      const r = consertar(conserto.grade, ruins, lista, rng(s));
      if (r) { self.postMessage({ id, pronto: { semente: conserto.semente, consertada: true, ...montar(r.g, r.letras) } }); return; }
    }
    if (soConserto) { self.postMessage({ id, falhou: true }); return; } // passada de variedade: não refaz tudo
    self.postMessage({ id, log: 'conserto local não deu; gerando a cruzada inteira' });
  }
  for (let s = semente; s < semente + tentativas; s++) {
    const rand = rng(s);
    const g = gerarEsqueleto(rand, perfil);
    if (!g) { self.postMessage({ id, log: `semente ${s}: esqueleto não fechou` }); continue; }
    const r = preencher(g, lista, rand);
    if (!r.ok) { self.postMessage({ id, log: `semente ${s}: não preencheu` }); continue; }
    self.postMessage({ id, pronto: { semente: s, ...montar(g, r.letras) } });
    return;
  }
  self.postMessage({ id, falhou: true });
};
