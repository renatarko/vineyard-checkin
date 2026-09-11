import { describe, expect, it } from "vitest";
import type { LinhaCsv } from "@/lib/csv";
import {
  assinatura,
  detectarColetiva,
  diffImportacao,
  faturaNorm,
  prepararLinhas,
  type ParticipanteExistente,
} from "@/lib/importacao";

function linha(p: Partial<LinhaCsv> & { nome: string }): LinhaCsv {
  return {
    linha: 0,
    documento: "",
    email: "",
    comprador: "",
    fatura: "",
    lote: "",
    ...p,
  };
}

/** Converte linhas do CSV no estado "já importado", como o banco ficaria. */
function comoExistentes(
  linhas: LinhaCsv[],
  ajustes: Record<number, Partial<ParticipanteExistente>> = {},
): ParticipanteExistente[] {
  return prepararLinhas(linhas).map((l, i) => ({
    id: `id-${i}`,
    fatura_norm: l.faturaNorm,
    assinatura: l.assinatura,
    ocorrencia: l.rankCsv,
    nome_origem: l.nome,
    nome_real: null,
    checkin_em: null,
    sumido_em: null,
    email: l.email || null,
    lote: l.lote || null,
    comprador_nome: l.comprador || null,
    fatura: l.fatura || null,
    documento_hash: l.documento.replace(/\D/g, ""),
    precisa_identificacao: l.precisaIdentificacao,
    ...(ajustes[i] ?? {}),
  }));
}

/** A coletiva do enunciado: 5 ingressos, todos com o nome do comprador. */
const COLETIVA_5 = Array.from({ length: 5 }, () =>
  linha({
    nome: "Renata Karolina",
    documento: "345.678.901-23",
    comprador: "Renata Karolina",
    fatura: "INV-1003",
    lote: "2º lote",
    email: "renata@exemplo.com",
  }),
);

describe("assinatura", () => {
  it("é estável a caixa, acento e espaço extra", () => {
    expect(assinatura("José  Antônio", "1")).toBe(assinatura("jose antonio", "1"));
    expect(assinatura("ANA BEATRIZ", "1")).toBe(assinatura("  ana   beatriz  ", "1"));
  });

  it("é estável à formatação do documento", () => {
    expect(assinatura("Ana", "123.456.789-01")).toBe(assinatura("Ana", "12345678901"));
  });

  it("separa pessoas diferentes", () => {
    expect(assinatura("Ana", "1")).not.toBe(assinatura("Bia", "1"));
    expect(assinatura("Ana", "1")).not.toBe(assinatura("Ana", "2"));
  });
});

describe("faturaNorm", () => {
  it("normaliza a fatura", () => {
    expect(faturaNorm(" INV-1003 ", "1")).toBe("inv-1003");
  });

  it("sem fatura, agrupa por documento", () => {
    expect(faturaNorm("", "123.456.789-01")).toBe("semfatura:12345678901");
  });

  it("pessoas sem fatura não se misturam entre si", () => {
    expect(faturaNorm("", "111")).not.toBe(faturaNorm("", "222"));
  });
});

describe("detectarColetiva", () => {
  it("marca todas as linhas quando o nome repete o comprador", () => {
    expect(detectarColetiva(COLETIVA_5)).toEqual([true, true, true, true, true]);
  });

  it("não marca compra individual", () => {
    const uma = [linha({ nome: "Ana", comprador: "Ana", fatura: "INV-1", documento: "1" })];
    expect(detectarColetiva(uma)).toEqual([false]);
  });

  it("não marca fatura coletiva que já veio com nomes distintos", () => {
    const dupla = [
      linha({ nome: "José Antônio Sá", comprador: "Luciana Sá", fatura: "INV-4", documento: "4" }),
      linha({ nome: "Luciana Sá", comprador: "Luciana Sá", fatura: "INV-4", documento: "5" }),
    ];
    // Só a linha da própria compradora repete o nome dela, mas ela é uma pessoa
    // identificada — o que importa é que o acompanhante não vira anônimo.
    expect(detectarColetiva(dupla)).toEqual([false, true]);
  });

  it("comprador vazio nunca marca coletiva", () => {
    const sem = [
      linha({ nome: "Ana", fatura: "INV-9", documento: "1" }),
      linha({ nome: "Ana", fatura: "INV-9", documento: "1" }),
    ];
    expect(detectarColetiva(sem)).toEqual([false, false]);
  });
});

describe("diffImportacao", () => {
  it("primeira importação: tudo novo", () => {
    const d = diffImportacao(COLETIVA_5, []);
    expect(d.novos).toHaveLength(5);
    expect(d.sumidos).toHaveLength(0);
  });

  it("reimportar o mesmo arquivo não muda nada", () => {
    const existentes = comoExistentes(COLETIVA_5);
    const d = diffImportacao(COLETIVA_5, existentes);
    expect(d.novos).toHaveLength(0);
    expect(d.sumidos).toHaveLength(0);
    expect(d.atualizados).toHaveLength(0);
    expect(d.inalterados).toHaveLength(5);
  });

  it("INVARIANTE: embaralhar as linhas do CSV não muda o resultado", () => {
    const existentes = comoExistentes(COLETIVA_5);
    const embaralhado = [...COLETIVA_5].reverse();
    const d = diffImportacao(embaralhado, existentes);
    expect(d.novos).toHaveLength(0);
    expect(d.sumidos).toHaveLength(0);
    expect(d.inalterados).toHaveLength(5);
  });

  it("INVARIANTE: quem já foi credenciado nunca entra em sumidos", () => {
    // 5 ingressos idênticos; 2 já passaram pela portaria com nomes reais.
    const existentes = comoExistentes(COLETIVA_5, {
      1: { checkin_em: "2026-09-11T20:00:00Z", nome_real: "Ana Gabriela" },
      3: { checkin_em: "2026-09-11T20:05:00Z", nome_real: "Bruno Costa" },
    });

    // O fornecedor cancelou um ingresso: o CSV novo traz 4.
    const d = diffImportacao(COLETIVA_5.slice(0, 4), existentes);

    expect(d.sumidos).toHaveLength(1);
    expect(d.sumidosCredenciados).toHaveLength(0);
    expect(d.sumidos[0].checkin_em).toBeNull();
    expect(d.sumidos[0].nome_real).toBeNull();
  });

  it("INVARIANTE: quem já foi identificado sobrevive antes de quem está intocado", () => {
    const existentes = comoExistentes(COLETIVA_5, {
      2: { nome_real: "Carla Dias" },
    });
    const d = diffImportacao(COLETIVA_5.slice(0, 4), existentes);
    expect(d.sumidos).toHaveLength(1);
    expect(d.sumidos[0].nome_real).toBeNull();
  });

  it("lote novo só acrescenta", () => {
    const existentes = comoExistentes(COLETIVA_5);
    const novas = [
      linha({ nome: "Paulo Henrique", documento: "678", comprador: "Paulo Henrique", fatura: "INV-2000", lote: "3º lote" }),
      linha({ nome: "Ana Beatriz", documento: "789", comprador: "Ana Beatriz", fatura: "INV-2001", lote: "3º lote" }),
    ];
    const d = diffImportacao([...COLETIVA_5, ...novas], existentes);
    expect(d.novos).toHaveLength(2);
    expect(d.sumidos).toHaveLength(0);
  });

  it("mais ingressos na mesma coletiva viram novos, não conflito", () => {
    const existentes = comoExistentes(COLETIVA_5);
    const seteIguais = [...COLETIVA_5, COLETIVA_5[0], COLETIVA_5[0]];
    const d = diffImportacao(seteIguais, existentes);
    expect(d.novos).toHaveLength(2);
    expect(d.sumidos).toHaveLength(0);
  });

  it("mudança de e-mail ou lote é atualização, não troca de pessoa", () => {
    const existentes = comoExistentes(COLETIVA_5);
    const corrigido = COLETIVA_5.map((l) => ({ ...l, email: "novo@exemplo.com" }));
    const d = diffImportacao(corrigido, existentes);
    expect(d.novos).toHaveLength(0);
    expect(d.sumidos).toHaveLength(0);
    expect(d.atualizados).toHaveLength(5);
  });

  it("quem voltou para a planilha conta como atualizado, não como novo", () => {
    const existentes = comoExistentes(COLETIVA_5, {
      4: { sumido_em: "2026-09-10T10:00:00Z" },
    });
    const d = diffImportacao(COLETIVA_5, existentes);
    expect(d.novos).toHaveLength(0);
    expect(d.atualizados).toHaveLength(1);
    expect(d.sumidos).toHaveLength(0);
  });

  it("já marcado como sumido não é reportado de novo", () => {
    const existentes = comoExistentes(COLETIVA_5, {
      4: { sumido_em: "2026-09-10T10:00:00Z" },
    });
    const d = diffImportacao(COLETIVA_5.slice(0, 4), existentes);
    expect(d.sumidos).toHaveLength(0);
  });

  it("alerta vermelho quando um credenciado some da planilha", () => {
    const existentes = comoExistentes(COLETIVA_5, {
      0: { checkin_em: "2026-09-11T20:00:00Z" },
      1: { checkin_em: "2026-09-11T20:01:00Z" },
      2: { checkin_em: "2026-09-11T20:02:00Z" },
      3: { checkin_em: "2026-09-11T20:03:00Z" },
      4: { checkin_em: "2026-09-11T20:04:00Z" },
    });
    const d = diffImportacao(COLETIVA_5.slice(0, 3), existentes);
    expect(d.sumidos).toHaveLength(2);
    expect(d.sumidosCredenciados).toHaveLength(2);
  });

  it("faturas diferentes com pessoas de mesmo nome não se misturam", () => {
    const a = linha({ nome: "Ana Silva", documento: "111", comprador: "Ana Silva", fatura: "INV-A" });
    const b = linha({ nome: "Ana Silva", documento: "111", comprador: "Ana Silva", fatura: "INV-B" });
    const existentes = comoExistentes([a, b]);
    const d = diffImportacao([a, b], existentes);
    expect(d.inalterados).toHaveLength(2);
    expect(d.novos).toHaveLength(0);
    expect(d.sumidos).toHaveLength(0);
  });

  it("CSV vazio marca todo mundo como sumido, sem apagar ninguém", () => {
    const existentes = comoExistentes(COLETIVA_5);
    const d = diffImportacao([], existentes);
    expect(d.sumidos).toHaveLength(5);
    expect(d.novos).toHaveLength(0);
  });
});
