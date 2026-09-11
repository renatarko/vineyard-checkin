import Papa from "papaparse";
import { normalizarTexto } from "@/lib/nomes";
import { soDigitos } from "@/lib/documento";

/** Uma linha do arquivo, já mapeada para os campos que o sistema entende. */
export interface LinhaCsv {
  linha: number;
  nome: string;
  documento: string;
  email: string;
  comprador: string;
  fatura: string;
  lote: string;
}

export interface ResultadoParse {
  linhas: LinhaCsv[];
  /** Linhas descartadas por não terem nome — a portaria não teria o que chamar. */
  ignoradas: number;
  /** Cabeçalhos do arquivo que não casaram com nenhum campo conhecido. */
  colunasIgnoradas: string[];
  /** Como cada campo foi resolvido, para a tela mostrar e deixar corrigir. */
  mapeamento: Record<CampoConhecido, string | null>;
}

export type CampoConhecido =
  | "nome"
  | "documento"
  | "email"
  | "comprador"
  | "fatura"
  | "lote";

/**
 * Apelidos aceitos por campo, já normalizados. O cabeçalho real varia entre
 * exportadores ("CPF/CNPJ", "Cpf", "Documento"), e forçar um formato único
 * significaria editar a planilha à mão antes de cada importação.
 */
const ALIASES: Record<CampoConhecido, string[]> = {
  nome: ["nome participante", "nome do participante", "participante", "nome"],
  documento: ["cpf/cnpj", "cpf cnpj", "cpf", "cnpj", "documento", "doc"],
  email: ["email", "e-mail", "email participante", "e-mail do participante"],
  comprador: [
    "nome comprador",
    "nome do comprador",
    "comprador",
    "titular",
    "nome do titular",
  ],
  fatura: ["fatura", "invoice", "numero da fatura", "n da fatura", "pedido"],
  lote: ["lote", "tipo de ingresso", "ingresso", "categoria"],
};

export class ErroCsv extends Error {}

/**
 * Decodifica o arquivo.
 *
 * Exportadores brasileiros mandam windows-1252 com frequência. Se assumirmos
 * UTF-8 sempre, "José" chega como "Jos<fffd>" — e aí o nome nunca casa na busca
 * nem entre duas importações. Tentamos UTF-8 estrito e caímos para 1252.
 */
export function decodificar(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder("windows-1252").decode(buffer);
  }
}

/** Normaliza o cabeçalho: tira BOM, acento, caixa e pontuação de borda. */
export function normalizarCabecalho(bruto: string): string {
  return normalizarTexto(bruto.replace(/^\uFEFF/, "").replace(/["']/g, "")).replace(
    /[.:]+$/,
    "",
  );
}

function resolverMapeamento(cabecalhos: string[]): {
  mapeamento: Record<CampoConhecido, string | null>;
  ignoradas: string[];
} {
  const mapeamento = {
    nome: null,
    documento: null,
    email: null,
    comprador: null,
    fatura: null,
    lote: null,
  } as Record<CampoConhecido, string | null>;
  const usados = new Set<string>();

  // Percorre os aliases em ordem: o primeiro da lista é o nome canônico, então
  // "nome participante" ganha de "nome" quando as duas colunas existem.
  for (const campo of Object.keys(ALIASES) as CampoConhecido[]) {
    for (const alias of ALIASES[campo]) {
      const achado = cabecalhos.find(
        (c) => !usados.has(c) && normalizarCabecalho(c) === alias,
      );
      if (achado) {
        mapeamento[campo] = achado;
        usados.add(achado);
        break;
      }
    }
  }

  return {
    mapeamento,
    ignoradas: cabecalhos.filter((c) => !usados.has(c) && c.trim() !== ""),
  };
}

/**
 * Lê o CSV. `delimiter: ""` deixa o papaparse detectar `;` ou `,` sozinho —
 * e o parser trata aspas, então "Silva; Jr" num campo não quebra a linha.
 */
export function parseCsv(texto: string): ResultadoParse {
  const saida = Papa.parse<Record<string, string>>(texto, {
    header: true,
    delimiter: "",
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.replace(/^\uFEFF/, "").trim(),
  });

  const cabecalhos = saida.meta.fields ?? [];
  const { mapeamento, ignoradas: colunasIgnoradas } = resolverMapeamento(cabecalhos);

  if (mapeamento.nome === null) {
    throw new ErroCsv(
      `O arquivo não tem uma coluna de nome do participante. Colunas encontradas: ${
        cabecalhos.join(", ") || "nenhuma"
      }`,
    );
  }

  const pegar = (registro: Record<string, string>, campo: CampoConhecido): string => {
    const coluna = mapeamento[campo];
    return coluna === null ? "" : (registro[coluna] ?? "").trim();
  };

  const linhas: LinhaCsv[] = [];
  let ignoradas = 0;

  saida.data.forEach((registro, i) => {
    const nome = pegar(registro, "nome");
    if (nome === "") {
      ignoradas += 1;
      return;
    }
    linhas.push({
      linha: i + 1,
      nome,
      documento: pegar(registro, "documento"),
      email: pegar(registro, "email").toLowerCase(),
      comprador: pegar(registro, "comprador"),
      fatura: pegar(registro, "fatura"),
      lote: pegar(registro, "lote"),
    });
  });

  return { linhas, ignoradas, colunasIgnoradas, mapeamento };
}

/** Formato aceito pela RPC `importar_participantes`. */
export function paraPayload(linhas: LinhaCsv[]) {
  return linhas.map((l) => ({
    nome: l.nome,
    documento: l.documento,
    email: l.email,
    comprador: l.comprador,
    fatura: l.fatura,
    lote: l.lote,
  }));
}

/** Só para a tela conseguir mostrar "documento inválido" antes de importar. */
export function documentoSuspeito(linha: LinhaCsv): boolean {
  const d = soDigitos(linha.documento);
  return d !== "" && d.length !== 11 && d.length !== 14;
}
