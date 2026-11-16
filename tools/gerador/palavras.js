// Listas de palavras: frequência (mais comuns primeiro) filtrada pelo dicionário.
// As listas não ficam no repositório (têm licenças próprias); são baixadas por URL.

export const URL_FREQUENCIA = 'https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/pt_br/pt_br_50k.txt';
export const URL_DICIONARIO = 'https://raw.githubusercontent.com/pythonprobr/palavras/master/palavras.txt';

// Palavras curtas aceitas. Na lista de frequência (legendas de filmes) as palavras
// de 2 e 3 letras vêm cheias de siglas, inglês e nomes; por isso só entram estas,
// escolhidas uma a uma. Acrescente aqui se faltar alguma boa.
const DUAS_LETRAS = new Set('AR FE PE JA LA CA DO DA NO NA OS AS UM EM OU EU TU ME TE SE OI AI PO PA NU MA RE SI LE VE VI RI LI DE NE GO OH'.split(' '));
const TRES_LETRAS = new Set((
  'QUE NAO UMA COM POR ELE MAS BEM ELA SIM TEM MEU SEU VAI SER SEI NOS ERA BOM TER SAO MIM ATE VER TAO DOS SEM ' +
  'DIA PAI MAE VEZ NEM BOA FAZ DAS DAR LHE VAO OLA DIZ VEM NAS MAL AMO ANO FOR ALI NUM VIR FIM MAO TAL IRA MIL ' +
  'PAZ SOB LUZ VIM REI ALO AMA RUA TIO DOR VOZ DAI SAI TOM DEZ SOL LEI CEU MES DEI LER BAR MAR MAU TEU PES TIA ' +
  'CHA SUL RIO TUA ORA UAU LUA CAO SOM COR PAR AVO LAR CAI DOI RIR PAO VIA GAS MEL ATO PAU VOO CEM DOM SAL FIO ' +
  'SOS OVO EVA ACO LAS VOS NUA REU ALA PUS CLA EGO CAL VOA AVE PIA RIM GOL ASA TOA SPA RUM FAX VEU BAU ELO ECO ' +
  'CRU BOI UVA VIL GIZ GIM GEL POS PIO PAS OCA NOZ IMA TAU CIO EPA ZOO RAS ABC OLE PSI OCO ARO ANU SOR ETA TIL ' +
  'HUM DAO JUS ZEN NUS ROI POE VAS RES SUA'
).split(' '));

/** Tira acentos e põe em maiúsculas: "ação" -> "ACAO". */
export const normalizar = p => p.normalize('NFD').replace(/\p{M}/gu, '').toUpperCase();

/**
 * Monta a lista base, da mais comum para a menos comum.
 *  - textoFrequencia: linhas "palavra contagem";
 *  - textoDicionario: uma palavra por linha (só as em minúscula contam: as
 *    com maiúscula são nomes próprios);
 *  - proibidas: Set de palavras já normalizadas.
 */
export function montarLista(textoFrequencia, textoDicionario, proibidas, maxLetras = 8) {
  const dicionario = new Set(textoDicionario.split(/\r?\n/).filter(p => p && p === p.toLowerCase()));
  const vistas = new Set();
  const lista = [];
  for (const linha of textoFrequencia.split(/\r?\n/)) {
    const palavra = linha.split(' ')[0];
    if (!palavra || !dicionario.has(palavra)) continue;
    const p = normalizar(palavra);
    if (p.length < 2 || p.length > maxLetras || !/^[A-Z]+$/.test(p)) continue;
    if (vistas.has(p) || proibidas.has(p)) continue;
    if (p.length === 2 && !DUAS_LETRAS.has(p)) continue;
    if (p.length === 3 && !TRES_LETRAS.has(p)) continue;
    vistas.add(p);
    lista.push(p);
  }
  return lista;
}

/** Lê tools/proibidas.txt: uma palavra por linha; # começa comentário. */
export function lerProibidas(texto) {
  return new Set(texto.split(/\r?\n/)
    .map(l => l.replace(/#.*/, '').trim())
    .filter(Boolean)
    .flatMap(l => l.split(/\s+/))
    .map(normalizar));
}
