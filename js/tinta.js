// Camada de tinta sobre a grade: captura da S Pen, desenho, borracha,
// desfazer/refazer. O app não reconhece a escrita; só guarda os traços.
//
// Três canvas transparentes empilhados sobre a grade:
//   base     — traços terminados (redesenhado só quando algo é apagado/desfeito)
//   traco    — o traço em andamento, desenhado aos pedacinhos (só o segmento novo)
//   previsao — pontos previstos pelo Chrome e o círculo da borracha; limpo a cada quadro
//
// Os traços são guardados em coordenadas normalizadas (0–1) relativas à grade,
// para continuarem no mesmo quadrado ao girar a tela.

export const FERRAMENTAS = {
  caneta: { cor: '#1a1a1a', largura: 0.0032 },  // largura em fração da largura da grade
  lapis:  { cor: '#8a867e', largura: 0.0021 },
};
const RAIO_BORRACHA = 0.014; // fração da largura da grade

// Botões que transformam a caneta em borracha enquanto pressionados.
const BOTAO_BORRACHA = 32;  // ponta-borracha (buttons & 32)
const BOTAO_LATERAL = 2;    // botão lateral da S Pen / botão direito do mouse (buttons & 2)

// Modo de baixa latência (desynchronized): no Tab S9 ele deixa a parte transparente
// do canvas PRETA, cobrindo a grade (o canvas vai direto para a tela sem se misturar
// com o que está embaixo). Por isso fica desligado; dá para testar com ?baixalatencia=1.
const BAIXA_LATENCIA = new URLSearchParams(location.search).get('baixalatencia') === '1';

function criarCamada(classe, rapida) {
  const canvas = document.createElement('canvas');
  canvas.className = `tinta ${classe}`;
  const ctx = canvas.getContext('2d', rapida && BAIXA_LATENCIA ? { desynchronized: true } : {});
  return { canvas, ctx };
}

export class Tinta {
  /**
   * @param {HTMLElement} papel  elemento que envolve a grade (recebe os eventos)
   * @param {object} opcoes
   *   aoMudar()            — chamado ao fim de cada traço/apagada/desfazer (para salvar)
   *   aoMudarHistorico(podeDesfazer, podeRefazer)
   */
  constructor(papel, { aoMudar = () => {}, aoMudarHistorico = () => {} } = {}) {
    this.papel = papel;
    this.aoMudar = aoMudar;
    this.aoMudarHistorico = aoMudarHistorico;

    this.base = criarCamada('tinta-base', false);
    this.traco = criarCamada('tinta-traco', true);
    this.previsao = criarCamada('tinta-previsao', true);
    papel.append(this.base.canvas, this.traco.canvas, this.previsao.canvas);

    this.tracos = [];        // { ferramenta, pontos: [[x, y, pressao]], caixa, apagado }
    this.historico = [];     // { tracos: [...], apagar: bool }
    this.refazerPilha = [];
    this.ferramenta = 'caneta';
    this.gesto = null;       // gesto em andamento (um ponteiro por vez)
    this.quadroPedido = false;
    this.w = 1; this.h = 1;

    papel.addEventListener('pointerdown', e => this.aoPressionar(e));
    papel.addEventListener('pointermove', e => this.aoMover(e));
    papel.addEventListener('pointerup', e => this.aoSoltar(e));
    papel.addEventListener('pointercancel', e => this.aoSoltar(e));
    papel.addEventListener('contextmenu', e => e.preventDefault()); // botão lateral/direito

    // Tamanho: já agora, e de novo sempre que a grade mudar (girar a tela etc.).
    this.redimensionar();
    this.observador = new ResizeObserver(() => this.redimensionar());
    this.observador.observe(papel);
    window.addEventListener('resize', () => this.redimensionar());
  }

  // ---------- Tamanho ----------

  redimensionar() {
    const ret = this.papel.getBoundingClientRect();
    if (!ret.width || !ret.height) return;
    const dpr = window.devicePixelRatio || 1;
    const largura = Math.round(ret.width * dpr), altura = Math.round(ret.height * dpr);
    if (this.base.canvas.width === largura && this.base.canvas.height === altura) return; // nada mudou
    this.w = ret.width; this.h = ret.height;
    for (const { canvas, ctx } of [this.base, this.traco, this.previsao]) {
      canvas.width = largura;
      canvas.height = altura;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }
    this.redesenharBase();
  }

  redesenharBase() {
    const { ctx } = this.base;
    ctx.clearRect(0, 0, this.w, this.h);
    for (const t of this.tracos) if (!t.apagado) this.tracarCompleto(ctx, t);
  }

  // ---------- Entrada ----------

  ehBorracha(e) {
    return this.ferramenta === 'borracha'
      || (e.buttons & (BOTAO_BORRACHA | BOTAO_LATERAL)) !== 0
      || e.button === 5 || e.button === 2;
  }

  pontoDe(e) {
    const ret = this.papel.getBoundingClientRect();
    let p = e.pressure;
    if (e.pointerType !== 'pen' || !p) p = 0.5; // mouse: pressão fixa
    return { x: e.clientX - ret.left, y: e.clientY - ret.top, p };
  }

  aoPressionar(e) {
    if (e.pointerType === 'touch') return;      // dedo/palma nunca desenha
    if (this.gesto) return;                      // já tem um traço em andamento
    if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 2) return;
    e.preventDefault();
    this.redimensionar();                        // garantia: camada do tamanho da grade
    try { this.papel.setPointerCapture(e.pointerId); } catch { /* segue sem captura */ }
    this.gesto = { pointerId: e.pointerId, modo: null, pendentes: [], previstos: [] };
    this.iniciarModo(this.ehBorracha(e) ? 'apagar' : 'desenhar');
    this.gesto.pendentes.push(this.pontoDe(e));
    this.pedirQuadro();
  }

  aoMover(e) {
    const g = this.gesto;
    if (!g || e.pointerId !== g.pointerId) return;
    // Apertou/soltou o botão lateral no meio do gesto: troca de modo.
    const modo = this.ehBorracha(e) ? 'apagar' : 'desenhar';
    if (modo !== g.modo) {
      this.processarPendentes();
      this.encerrarModo();
      this.iniciarModo(modo);
    }
    const eventos = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    for (const ev of (eventos.length ? eventos : [e])) g.pendentes.push(this.pontoDe(ev));
    g.previstos = e.getPredictedEvents ? e.getPredictedEvents().map(ev => this.pontoDe(ev)) : [];
    this.pedirQuadro();
  }

  aoSoltar(e) {
    const g = this.gesto;
    if (!g || e.pointerId !== g.pointerId) return;
    this.processarPendentes();
    this.encerrarModo();
    this.previsao.ctx.clearRect(0, 0, this.w, this.h);
    this.gesto = null;
  }

  // ---------- Modos (desenhar / apagar) ----------

  iniciarModo(modo) {
    const g = this.gesto;
    g.modo = modo;
    if (modo === 'desenhar') {
      const ferramenta = this.ferramenta === 'borracha' ? 'caneta' : this.ferramenta;
      g.traco = { ferramenta, pontos: [], caixa: null, apagado: false };
      g.px = []; // pontos do traço em pixels
    } else {
      g.apagados = new Set();
      g.ultimo = null;
    }
  }

  encerrarModo() {
    const g = this.gesto;
    if (g.modo === 'desenhar') {
      const t = g.traco;
      this.traco.ctx.clearRect(0, 0, this.w, this.h);
      if (t.pontos.length) {
        t.caixa = caixaDe(t.pontos);
        this.tracos.push(t);
        this.tracarCompleto(this.base.ctx, t);
        this.registrar({ tracos: [t], apagar: false });
      }
    } else if (g.apagados.size) {
      this.registrar({ tracos: [...g.apagados], apagar: true });
    }
  }

  registrar(acao) {
    this.historico.push(acao);
    this.refazerPilha = [];
    this.notificar();
  }

  notificar() {
    this.aoMudarHistorico(this.historico.length > 0, this.refazerPilha.length > 0);
    this.aoMudar();
  }

  // ---------- Quadro a quadro ----------

  pedirQuadro() {
    if (this.quadroPedido) return;
    this.quadroPedido = true;
    requestAnimationFrame(() => {
      this.quadroPedido = false;
      if (!this.gesto) return;
      this.processarPendentes();
      this.desenharPrevisao();
    });
  }

  processarPendentes() {
    const g = this.gesto;
    if (!g || !g.pendentes.length) return;
    const pontos = g.pendentes;
    g.pendentes = [];
    if (g.modo === 'desenhar') {
      const estilo = FERRAMENTAS[g.traco.ferramenta];
      for (const pt of pontos) {
        g.traco.pontos.push([pt.x / this.w, pt.y / this.h, round3(pt.p)]);
        g.px.push(pt);
        // só o segmento novo
        if (g.px.length >= 2) this.segmento(this.traco.ctx, estilo, g.px, g.px.length - 1);
      }
    } else {
      let mudou = false;
      for (const pt of pontos) {
        if (this.apagarEm(g.ultimo || pt, pt, g.apagados)) mudou = true;
        g.ultimo = pt;
      }
      if (mudou) this.redesenharBase();
    }
  }

  desenharPrevisao() {
    const g = this.gesto;
    const ctx = this.previsao.ctx;
    ctx.clearRect(0, 0, this.w, this.h);
    if (g.modo === 'desenhar') {
      const ultimo = g.px[g.px.length - 1];
      if (!ultimo || !g.previstos.length) return;
      const estilo = FERRAMENTAS[g.traco.ferramenta];
      ctx.strokeStyle = estilo.cor;
      ctx.lineWidth = this.largura(estilo, ultimo.p);
      ctx.beginPath();
      ctx.moveTo(ultimo.x, ultimo.y);
      for (const pt of g.previstos) ctx.lineTo(pt.x, pt.y);
      ctx.stroke();
    } else if (g.ultimo) {
      ctx.strokeStyle = 'rgba(90, 86, 80, 0.7)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(g.ultimo.x, g.ultimo.y, RAIO_BORRACHA * this.w, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // ---------- Desenho ----------

  largura(estilo, pressao) {
    return estilo.largura * this.w * (0.7 + 0.6 * pressao); // pressão influencia levemente
  }

  /** Desenha o pedaço do traço que termina no ponto i (curva pelos pontos médios). */
  segmento(ctx, estilo, px, i) {
    const a = px[i - 1], b = px[i];
    ctx.strokeStyle = estilo.cor;
    ctx.lineWidth = this.largura(estilo, (a.p + b.p) / 2);
    ctx.beginPath();
    if (i === 1) {
      ctx.moveTo(a.x, a.y);
      ctx.lineTo((a.x + b.x) / 2, (a.y + b.y) / 2);
    } else {
      const z = px[i - 2];
      ctx.moveTo((z.x + a.x) / 2, (z.y + a.y) / 2);
      ctx.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2);
    }
    ctx.stroke();
  }

  /** Desenha um traço inteiro (mesmo algoritmo do desenho ao vivo). */
  tracarCompleto(ctx, t) {
    const estilo = FERRAMENTAS[t.ferramenta];
    const px = t.pontos.map(([x, y, p]) => ({ x: x * this.w, y: y * this.h, p }));
    if (px.length === 1) {
      ctx.fillStyle = estilo.cor;
      ctx.beginPath();
      ctx.arc(px[0].x, px[0].y, this.largura(estilo, px[0].p) / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    for (let i = 1; i < px.length; i++) this.segmento(ctx, estilo, px, i);
    // remate: do último ponto médio até o último ponto
    const a = px[px.length - 2], b = px[px.length - 1];
    ctx.lineWidth = this.largura(estilo, b.p);
    ctx.beginPath();
    ctx.moveTo((a.x + b.x) / 2, (a.y + b.y) / 2);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  // ---------- Borracha (apaga o traço inteiro tocado) ----------

  apagarEm(de, ate, apagados) {
    const r = RAIO_BORRACHA * this.w;
    let mudou = false;
    // amostra o caminho da borracha a cada meio raio, para não pular traços finos
    const passos = Math.max(1, Math.ceil(Math.hypot(ate.x - de.x, ate.y - de.y) / (r / 2)));
    for (const t of this.tracos) {
      if (t.apagado) continue;
      const [x0, y0, x1, y1] = t.caixa;
      for (let k = 0; k <= passos; k++) {
        const x = de.x + (ate.x - de.x) * k / passos;
        const y = de.y + (ate.y - de.y) * k / passos;
        if (x < x0 * this.w - r || x > x1 * this.w + r || y < y0 * this.h - r || y > y1 * this.h + r) continue;
        if (this.tocaTraco(t, x, y, r)) {
          t.apagado = true;
          apagados.add(t);
          mudou = true;
          break;
        }
      }
    }
    return mudou;
  }

  tocaTraco(t, x, y, r) {
    const pts = t.pontos;
    if (pts.length === 1) return Math.hypot(pts[0][0] * this.w - x, pts[0][1] * this.h - y) <= r;
    for (let i = 1; i < pts.length; i++) {
      const ax = pts[i - 1][0] * this.w, ay = pts[i - 1][1] * this.h;
      const bx = pts[i][0] * this.w, by = pts[i][1] * this.h;
      if (distSegmento(x, y, ax, ay, bx, by) <= r) return true;
    }
    return false;
  }

  // ---------- Ferramentas, desfazer, refazer ----------

  usar(ferramenta) {
    if (ferramenta in FERRAMENTAS || ferramenta === 'borracha') this.ferramenta = ferramenta;
  }

  desfazer() {
    if (this.gesto) return;
    const acao = this.historico.pop();
    if (!acao) return;
    for (const t of acao.tracos) t.apagado = !acao.apagar;
    this.refazerPilha.push(acao);
    this.redesenharBase();
    this.notificar();
  }

  refazer() {
    if (this.gesto) return;
    const acao = this.refazerPilha.pop();
    if (!acao) return;
    for (const t of acao.tracos) t.apagado = acao.apagar;
    this.historico.push(acao);
    this.redesenharBase();
    this.notificar();
  }

  /** Traços visíveis, prontos para salvar (usado na Etapa 3). */
  exportar() {
    return this.tracos.filter(t => !t.apagado).map(({ ferramenta, pontos }) => ({ ferramenta, pontos }));
  }
}

// ---------- utilitários ----------

function caixaDe(pontos) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pontos) {
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}

function distSegmento(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

const round3 = v => Math.round(v * 1000) / 1000;
