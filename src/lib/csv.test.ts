import { describe, expect, it } from "vitest";
import {
  ErroCsv,
  decodificar,
  documentoSuspeito,
  normalizarCabecalho,
  parseCsv,
} from "@/lib/csv";

const CABECALHO = "nome participante;cpf/cnpj;email;nome comprador;fatura;lote";

describe("decodificar", () => {
  it("lê UTF-8", () => {
    const bytes = new TextEncoder().encode("José Antônio");
    expect(decodificar(bytes.buffer as ArrayBuffer)).toBe("José Antônio");
  });

  it("cai para windows-1252 quando o UTF-8 é inválido", () => {
    // "José" em windows-1252: o 0xE9 sozinho é UTF-8 inválido.
    const bytes = new Uint8Array([0x4a, 0x6f, 0x73, 0xe9]);
    expect(decodificar(bytes.buffer as ArrayBuffer)).toBe("José");
  });

  it("lê acentos variados em windows-1252", () => {
    // "Conceição"
    const bytes = new Uint8Array([
      0x43, 0x6f, 0x6e, 0x63, 0x65, 0x69, 0xe7, 0xe3, 0x6f,
    ]);
    expect(decodificar(bytes.buffer as ArrayBuffer)).toBe("Conceição");
  });
});

describe("normalizarCabecalho", () => {
  it("remove BOM, acento, aspas e caixa", () => {
    expect(normalizarCabecalho("\uFEFFNome Participante")).toBe("nome participante");
    expect(normalizarCabecalho('"CPF/CNPJ"')).toBe("cpf/cnpj");
    expect(normalizarCabecalho("E-mail:")).toBe("e-mail");
  });
});

describe("parseCsv", () => {
  it("lê o formato esperado com separador ;", () => {
    const r = parseCsv(`${CABECALHO}\nMarina Alves;123.456.789-01;M@Exemplo.com;Marina Alves;INV-1;1º lote`);
    expect(r.linhas).toHaveLength(1);
    expect(r.linhas[0]).toMatchObject({
      nome: "Marina Alves",
      documento: "123.456.789-01",
      email: "m@exemplo.com",
      comprador: "Marina Alves",
      fatura: "INV-1",
      lote: "1º lote",
    });
  });

  it("detecta separador vírgula sozinho", () => {
    const r = parseCsv("nome participante,cpf/cnpj,fatura\nAna,111,INV-2");
    expect(r.linhas[0]).toMatchObject({ nome: "Ana", documento: "111", fatura: "INV-2" });
  });

  it("aceita BOM no primeiro cabeçalho", () => {
    const r = parseCsv(`\uFEFF${CABECALHO}\nAna;1;a@b.c;Ana;INV-3;L1`);
    expect(r.linhas[0].nome).toBe("Ana");
  });

  it("aceita cabeçalho com acento e caixa diferente", () => {
    const r = parseCsv("Nome do Participante;Documento;E-mail\nAna;1;a@b.c");
    expect(r.linhas[0].nome).toBe("Ana");
    expect(r.mapeamento.documento).toBe("Documento");
    expect(r.mapeamento.email).toBe("E-mail");
  });

  it("preserva ; dentro de campo entre aspas", () => {
    const r = parseCsv(`${CABECALHO}\n"Silva; Jr";1;a@b.c;Silva;INV-4;L1`);
    expect(r.linhas[0].nome).toBe("Silva; Jr");
  });

  it("pula linhas em branco no meio", () => {
    const r = parseCsv(`${CABECALHO}\nAna;1;a@b.c;Ana;INV-5;L1\n\n\nBia;2;b@b.c;Bia;INV-6;L1`);
    expect(r.linhas).toHaveLength(2);
  });

  it("conta como ignorada a linha sem nome", () => {
    const r = parseCsv(`${CABECALHO}\n;1;a@b.c;Ana;INV-7;L1\nBia;2;b@b.c;Bia;INV-8;L1`);
    expect(r.linhas).toHaveLength(1);
    expect(r.ignoradas).toBe(1);
  });

  it("dá erro nomeado quando não há coluna de nome", () => {
    expect(() => parseCsv("cpf;fatura\n1;INV-9")).toThrow(ErroCsv);
  });

  it("lista colunas que não reconheceu", () => {
    const r = parseCsv("nome participante;observacao interna\nAna;qualquer");
    expect(r.colunasIgnoradas).toEqual(["observacao interna"]);
  });

  it("prefere 'nome participante' quando também existe 'nome'", () => {
    const r = parseCsv("nome;nome participante\nComprador X;Participante Y");
    expect(r.linhas[0].nome).toBe("Participante Y");
  });

  it("aguenta CRLF", () => {
    const r = parseCsv(`${CABECALHO}\r\nAna;1;a@b.c;Ana;INV-10;L1\r\n`);
    expect(r.linhas).toHaveLength(1);
    expect(r.linhas[0].lote).toBe("L1");
  });

  it("campos ausentes viram string vazia, não quebram", () => {
    const r = parseCsv("nome participante\nAna");
    expect(r.linhas[0]).toMatchObject({ nome: "Ana", documento: "", fatura: "" });
  });
});

describe("documentoSuspeito", () => {
  const base = { linha: 1, nome: "Ana", email: "", comprador: "", fatura: "", lote: "" };

  it("aceita CPF e CNPJ", () => {
    expect(documentoSuspeito({ ...base, documento: "123.456.789-01" })).toBe(false);
    expect(documentoSuspeito({ ...base, documento: "12.345.678/0001-99" })).toBe(false);
  });

  it("marca tamanho estranho", () => {
    expect(documentoSuspeito({ ...base, documento: "123" })).toBe(true);
  });

  it("documento vazio não é suspeito", () => {
    expect(documentoSuspeito({ ...base, documento: "" })).toBe(false);
  });
});
