import { beforeEach, describe, expect, it } from "vitest";
import { mock } from "@/lib/mock";

/**
 * O mock imita as RPCs. Se ele divergir delas, o layout passa a ser avaliado
 * contra um comportamento que não existe — por isso as regras que importam
 * estão testadas aqui também.
 */
beforeEach(() => {
  mock.reiniciar();
});

describe("dados de demonstração", () => {
  it("monta a lista com os casos que interessam", async () => {
    const lista = await mock.listarParticipantes();
    expect(lista.length).toBeGreaterThan(20);

    // A coletiva do enunciado: 5 ingressos com o nome de quem comprou.
    const coletiva = lista.filter((p) => p.nome_origem === "Renata Karolina Rocha");
    expect(coletiva).toHaveLength(5);
    expect(coletiva.every((p) => p.precisa_identificacao)).toBe(true);

    // Dois já identificados e credenciados, três ainda anônimos.
    expect(coletiva.filter((p) => p.checkin_em !== null)).toHaveLength(2);
    expect(coletiva.filter((p) => p.nome_real === null)).toHaveLength(3);
  });

  it("mostra o nome real acrescentado ao da planilha", async () => {
    const lista = await mock.listarParticipantes();
    const identificada = lista.find((p) => p.nome_real === "Ana Gabriela Prado");
    expect(identificada?.nome_exibicao).toBe("Renata Karolina Rocha - Ana Gabriela Prado");
  });

  it("não duplica o nome quando o comprador é o próprio participante", async () => {
    const lista = await mock.listarParticipantes();
    const marcos = lista.find((p) => p.nome_real === "Marcos Aurélio Pinto");
    expect(marcos?.nome_exibicao).toBe("Marcos Aurélio Pinto");
  });

  it("não expõe o documento em claro", async () => {
    const lista = await mock.listarParticipantes();
    expect(lista.every((p) => !("documento_claro" in p))).toBe(true);
  });

  it("tem gente fora da planilha e compra sem fatura", async () => {
    const lista = await mock.listarParticipantes();
    expect(lista.some((p) => p.sumido_em !== null)).toBe(true);
    expect(lista.some((p) => p.fatura === null)).toBe(true);
  });
});

describe("credenciar", () => {
  it("acrescenta o nome real sem apagar o original", async () => {
    const lista = await mock.listarParticipantes();
    const anonima = lista.find(
      (p) => p.precisa_identificacao && p.nome_real === null && p.checkin_em === null,
    )!;

    const depois = await mock.credenciar(anonima.id, "Carla Dias");
    expect(depois.nome_origem).toBe(anonima.nome_origem);
    expect(depois.nome_exibicao).toBe(`${anonima.nome_origem} - Carla Dias`);
    expect(depois.checkin_em).not.toBeNull();
  });

  it("é idempotente: repetir não move a hora de entrada", async () => {
    const lista = await mock.listarParticipantes();
    const pendente = lista.find((p) => p.checkin_em === null)!;

    const primeira = await mock.credenciar(pendente.id);
    const segunda = await mock.credenciar(pendente.id);
    expect(segunda.checkin_em).toBe(primeira.checkin_em);
  });

  it("desfazer preserva o nome informado", async () => {
    const lista = await mock.listarParticipantes();
    const pendente = lista.find(
      (p) => p.checkin_em === null && p.precisa_identificacao,
    )!;

    await mock.credenciar(pendente.id, "Helena Souza");
    const desfeito = await mock.desfazer(pendente.id);

    expect(desfeito.checkin_em).toBeNull();
    expect(desfeito.nome_real).toBe("Helena Souza");
  });
});

describe("busca por documento", () => {
  it("acha com o documento completo", async () => {
    const ids = await mock.buscarPorDocumento("345.678.901-23");
    expect(ids).toHaveLength(5); // a coletiva inteira usa o CPF do comprador
  });

  it("ignora documento incompleto, como o hash faria", async () => {
    expect(await mock.buscarPorDocumento("34567")).toEqual([]);
  });
});

describe("importação", () => {
  it("reimportar o mesmo arquivo não cria nada", async () => {
    const linhas = [
      {
        linha: 1,
        nome: "José Antônio Sá",
        documento: "456.789.012-34",
        email: "jose@exemplo.com",
        comprador: "Luciana Sá",
        fatura: "INV-1004",
        lote: "2º lote",
      },
    ];

    // Já existe no seed: nem a primeira passada deve criar alguém.
    expect((await mock.importar(linhas, true)).novos).toBe(0);
    expect((await mock.importar(linhas, false)).novos).toBe(0);
  });

  it("importar de novo o que acabou de entrar não duplica", async () => {
    const linhas = [
      {
        linha: 1,
        nome: "Antônio Conceição Júnior",
        documento: "222.333.444-55",
        email: "antonio@exemplo.com",
        comprador: "Antônio Conceição Júnior",
        fatura: "INV-8888",
        lote: "1º lote",
      },
    ];

    expect((await mock.importar(linhas, true)).novos).toBe(1);
    // Acento e caixa passam pela mesma normalização do banco.
    expect((await mock.importar(linhas, false)).novos).toBe(0);
  });

  it("confirma e acrescenta os novos", async () => {
    const antes = (await mock.listarParticipantes()).length;
    await mock.importar(
      [
        {
          linha: 1,
          nome: "Pessoa Nova da Silva",
          documento: "111.111.111-11",
          email: "nova@exemplo.com",
          comprador: "Pessoa Nova da Silva",
          fatura: "INV-9999",
          lote: "3º lote",
        },
      ],
      true,
    );
    const depois = await mock.listarParticipantes();
    expect(depois.length).toBeGreaterThan(antes);
    expect(depois.some((p) => p.nome_origem === "Pessoa Nova da Silva")).toBe(true);
  });
});

describe("convites", () => {
  it("lista os três estados e revoga", async () => {
    const convites = await mock.listarConvites();
    expect(convites.length).toBeGreaterThanOrEqual(3);

    const ativo = convites.find((c) => c.revogado_em === null && c.usos === 0)!;
    await mock.revogarConvite(ativo.id);

    const depois = await mock.listarConvites();
    expect(depois.find((c) => c.id === ativo.id)?.revogado_em).not.toBeNull();
  });

  it("criar devolve um token para montar o link", async () => {
    const { token } = await mock.criarConvite("Teste", "operador", 48);
    expect(token.length).toBeGreaterThan(10);
  });
});
