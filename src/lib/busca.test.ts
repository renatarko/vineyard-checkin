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
    id: "renata-1",
    nome_origem: "Renata Karolina",
    nome_real: "Ana Gabriela",
    documento_hash: "hash-renata",
    fatura: "INV-1003",
    fatura_norm: "inv-1003",
    precisa_identificacao: true,
  }),
  p({
    id: "renata-2",
    nome_origem: "Renata Karolina",
    documento_hash: "hash-renata",
    fatura: "INV-1003",
    fatura_norm: "inv-1003",
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
      "Renata Karolina - Ana Gabriela",
    ]);
  });

  it("acha pelo nome original mesmo depois de identificado", () => {
    const achados = filtrarParticipantes(LISTA, "Renata Karolina");
    expect(achados).toHaveLength(2);
    expect(nomes(achados)).toContain("Renata Karolina - Ana Gabriela");
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
      "Renata Karolina - Ana Gabriela",
    ]);
  });

  it("devolve vazio quando não acha", () => {
    expect(filtrarParticipantes(LISTA, "zzzz")).toHaveLength(0);
  });

  it("ordena em ordem alfabética pelo nome da planilha", () => {
    expect(nomes(filtrarParticipantes(LISTA, ""))).toEqual([
      "José Antônio Sá",
      "Marina Alves",
      "Renata Karolina - Ana Gabriela",
      "Renata Karolina",
    ]);
  });

  it("credenciar não muda a posição de ninguém", () => {
    // A lista é a mesma de antes, mas com a Marina já credenciada: quem está
    // no balcão não pode ver a linha pular de lugar.
    const comCheckin = indexar(
      LISTA.map((x) =>
        x.nome_origem === "Renata Karolina" && x.nome_real === null
          ? { ...x, checkin_em: "2026-09-11T21:00:00Z" }
          : x,
      ),
    );
    expect(nomes(filtrarParticipantes(comCheckin, ""))).toEqual(
      nomes(filtrarParticipantes(LISTA, "")),
    );
  });

  it("acento não joga o nome para o fim", () => {
    const lista = indexar([
      p({ nome_origem: "Zuleica Dias" }),
      p({ nome_origem: "Álvaro Neves" }),
      p({ nome_origem: "Bruno Alves" }),
    ]);
    expect(nomes(filtrarParticipantes(lista, ""))).toEqual([
      "Álvaro Neves",
      "Bruno Alves",
      "Zuleica Dias",
    ]);
  });

  it("ordena pelo nome da planilha, não pelo exibido", () => {
    // A linha identificada fica onde o comprador está, e não na letra do nome
    // informado — senão ela some do bloco assim que é preenchida.
    const lista = indexar([
      p({ nome_origem: "Zuleica Dias", nome_real: "Ana Paula" }),
      p({ nome_origem: "Bruno Alves" }),
    ]);
    expect(nomes(filtrarParticipantes(lista, ""))).toEqual([
      "Bruno Alves",
      "Zuleica Dias - Ana Paula",
    ]);
  });

  it("identificar alguém não move a linha nem desfaz o bloco da coletiva", () => {
    // Os cinco ingressos saíram da mesma compra da Aline. Preencher o nome de
    // um deles não pode espalhar o bloco pela lista nem mudar a ordem: a
    // operadora está com a fila andando e já achou onde tinha que olhar.
    const coletiva = indexar([
      p({ id: "c1", nome_origem: "Aline Costa", fatura_norm: "inv-9", precisa_identificacao: true }),
      p({ id: "c2", nome_origem: "Aline Costa", fatura_norm: "inv-9", precisa_identificacao: true }),
      p({ id: "c3", nome_origem: "Aline Costa", fatura_norm: "inv-9", precisa_identificacao: true }),
      p({ nome_origem: "Bruno Alves" }),
      p({ nome_origem: "Zuleica Dias" }),
    ]);
    const antes = filtrarParticipantes(coletiva, "");

    const comNome = indexar(
      coletiva.map((x) =>
        x.id === "c2"
          ? { ...x, nome_real: "Renata", nome_exibicao: nomeExibicao("Renata", x.nome_origem) }
          : x,
      ),
    );
    const depois = filtrarParticipantes(comNome, "");

    expect(depois.map((x) => x.id)).toEqual(antes.map((x) => x.id));
    expect(nomes(depois)).toEqual([
      "Aline Costa",
      "Aline Costa - Renata",
      "Aline Costa",
      "Bruno Alves",
      "Zuleica Dias",
    ]);
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
