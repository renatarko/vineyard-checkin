import { describe, expect, it } from "vitest";
import {
  contar,
  filtrarParticipantes,
  filtrarPorLote,
  filtrarPorSituacao,
  indexar,
  lotesDisponiveis,
} from "@/lib/busca";
import { nomeExibicao } from "@/lib/nomes";
import type { Participante } from "@/lib/types";

function p(over: Partial<Participante> & { nome_origem: string }): Participante {
  const nome_real = over.nome_real ?? null;
  return {
    id: over.id ?? over.nome_origem,
    nome_real,
    nome_exibicao: nomeExibicao(nome_real, over.nome_origem),
    documento_hash: "",
    documento_tipo: null,
    email: null,
    comprador_nome: null,
    fatura: null,
    fatura_norm: "",
    lote: null,
    precisa_identificacao: false,
    sumido_em: null,
    checkin_em: null,
    checkin_por: null,
    nome_real_em: null,
    nome_real_por: null,
    ...over,
  };
}

const LISTA = indexar([
  p({
    nome_origem: "José Antônio Sá",
    documento_hash: "hash-jose",
    fatura: "INV-1004",
    lote: "2º lote",
    comprador_nome: "Luciana Sá",
  }),
  p({
    nome_origem: "Renata Karolina",
    nome_real: "Ana Gabriela",
    documento_hash: "hash-renata",
    fatura: "INV-1003",
    precisa_identificacao: true,
  }),
  p({
    nome_origem: "Renata Karolina",
    documento_hash: "hash-renata",
    fatura: "INV-1003",
    precisa_identificacao: true,
  }),
  p({
    nome_origem: "Marina Alves",
    documento_hash: "hash-marina",
    fatura: "INV-1001",
    checkin_em: "2026-09-11T20:00:00Z",
  }),
]);

const nomes = (lista: { nome_exibicao: string }[]) => lista.map((x) => x.nome_exibicao);

describe("filtrarParticipantes", () => {
  it("termo vazio devolve todo mundo", () => {
    expect(filtrarParticipantes(LISTA, "")).toHaveLength(4);
    expect(filtrarParticipantes(LISTA, "   ")).toHaveLength(4);
  });

  it("acha com acento quem foi digitado sem", () => {
    expect(nomes(filtrarParticipantes(LISTA, "jose antonio"))).toEqual(["José Antônio Sá"]);
  });

  it("acha sem acento quem foi digitado com", () => {
    expect(nomes(filtrarParticipantes(LISTA, "josé"))).toEqual(["José Antônio Sá"]);
  });

  it("acha pelo nome real informado na portaria", () => {
    expect(nomes(filtrarParticipantes(LISTA, "Ana Gabriela"))).toEqual([
      "Ana Gabriela - Renata Karolina",
    ]);
  });

  it("acha pelo nome original mesmo depois de identificado", () => {
    const achados = filtrarParticipantes(LISTA, "Renata Karolina");
    expect(achados).toHaveLength(2);
    expect(nomes(achados)).toContain("Ana Gabriela - Renata Karolina");
  });

  it("acha pelo nome do comprador", () => {
    expect(nomes(filtrarParticipantes(LISTA, "luciana"))).toEqual(["José Antônio Sá"]);
  });

  it("não acha por documento sozinho: o CPF está criptografado no banco", () => {
    // O front não tem a chave do HMAC, então não há o que comparar localmente.
    // Quem resolve isso é a RPC buscar_por_documento, testada abaixo.
    expect(filtrarParticipantes(LISTA, "123.456.789-01")).toHaveLength(0);
  });

  it("usa os ids que o servidor devolveu para a busca por documento", () => {
    const idsDoServidor = new Set(["Marina Alves"]);
    const achados = filtrarParticipantes(LISTA, "123.456.789-01", idsDoServidor);
    expect(nomes(achados)).toEqual(["Marina Alves"]);
  });

  it("documento e texto se somam, não se excluem", () => {
    // A pessoa digitou um CPF; a lista mostra quem casou por documento mesmo
    // que o termo não apareça em nenhum campo de texto.
    const idsDoServidor = new Set(["Marina Alves"]);
    const achados = filtrarParticipantes(LISTA, "12345678901", idsDoServidor);
    expect(achados).toHaveLength(1);
  });

  it("conjunto vazio do servidor não derruba a busca textual", () => {
    const achados = filtrarParticipantes(LISTA, "luciana", new Set<string>());
    expect(nomes(achados)).toEqual(["José Antônio Sá"]);
  });

  it("acha pela fatura, inteira ou em pedaço", () => {
    expect(filtrarParticipantes(LISTA, "INV-1003")).toHaveLength(2);
    expect(filtrarParticipantes(LISTA, "1004")).toHaveLength(1);
  });

  it("combina palavras de campos diferentes", () => {
    expect(nomes(filtrarParticipantes(LISTA, "ana 1003"))).toEqual([
      "Ana Gabriela - Renata Karolina",
    ]);
  });

  it("devolve vazio quando não acha", () => {
    expect(filtrarParticipantes(LISTA, "zzzz")).toHaveLength(0);
  });

  it("credenciado vai para o fim da lista", () => {
    const ordenada = nomes(filtrarParticipantes(LISTA, ""));
    expect(ordenada[ordenada.length - 1]).toBe("Marina Alves");
  });

  it("coletiva ainda sem identificação vem antes das demais", () => {
    expect(nomes(filtrarParticipantes(LISTA, ""))[0]).toBe("Renata Karolina");
  });
});

describe("contar", () => {
  it("conta total, credenciados e pendentes de identificação", () => {
    expect(contar(LISTA)).toEqual({
      total: 4,
      credenciados: 1,
      pendentesIdentificacao: 1,
    });
  });

  it("ignora quem sumiu da planilha sem ter entrado", () => {
    const comSumido = [...LISTA, p({ nome_origem: "Cancelado", sumido_em: "2026-09-10T10:00:00Z" })];
    expect(contar(comSumido).total).toBe(4);
  });

  it("mantém no total quem sumiu mas já tinha entrado", () => {
    const comSumido = [
      ...LISTA,
      p({
        nome_origem: "Entrou e sumiu",
        sumido_em: "2026-09-10T10:00:00Z",
        checkin_em: "2026-09-11T20:00:00Z",
      }),
    ];
    const c = contar(comSumido);
    expect(c.total).toBe(5);
    expect(c.credenciados).toBe(2);
  });

  it("lista vazia não quebra", () => {
    expect(contar([])).toEqual({ total: 0, credenciados: 0, pendentesIdentificacao: 0 });
  });
});

describe("lotesDisponiveis", () => {
  it("lista os lotes presentes, em ordem", () => {
    expect(lotesDisponiveis(LISTA)).toEqual(["2º lote"]);
  });

  it("não repete o mesmo lote escrito de formas diferentes", () => {
    const lista = indexar([
      p({ nome_origem: "A", lote: "1º Lote" }),
      p({ nome_origem: "B", lote: "1º lote" }),
      p({ nome_origem: "C", lote: "2º lote" }),
    ]);
    expect(lotesDisponiveis(lista)).toEqual(["1º Lote", "2º lote"]);
  });

  it("ignora quem está sem lote", () => {
    const lista = indexar([p({ nome_origem: "A", lote: null }), p({ nome_origem: "B", lote: "" })]);
    expect(lotesDisponiveis(lista)).toEqual([]);
  });
});

describe("filtrarPorLote", () => {
  it("null devolve tudo", () => {
    expect(filtrarPorLote(LISTA, null)).toHaveLength(4);
  });

  it("filtra ignorando caixa e acento", () => {
    expect(filtrarPorLote(LISTA, "2º LOTE")).toHaveLength(1);
  });
});

describe("filtrarPorSituacao", () => {
  it("separa credenciados de pendentes", () => {
    expect(filtrarPorSituacao(LISTA, "todos")).toHaveLength(4);
    expect(filtrarPorSituacao(LISTA, "realizados")).toHaveLength(1);
    expect(filtrarPorSituacao(LISTA, "pendentes")).toHaveLength(3);
  });
});
