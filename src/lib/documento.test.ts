import { describe, expect, it } from "vitest";
import {
  documentoIncompleto,
  pareceDocumentoCompleto,
  rotularTipo,
  soDigitos,
  tipoDocumento,
} from "@/lib/documento";

describe("soDigitos", () => {
  it("tira pontuação de CPF e CNPJ", () => {
    expect(soDigitos("123.456.789-01")).toBe("12345678901");
    expect(soDigitos("12.345.678/0001-99")).toBe("12345678000199");
  });

  it("trata vazio e nulo", () => {
    expect(soDigitos("")).toBe("");
    expect(soDigitos(null)).toBe("");
    expect(soDigitos(undefined)).toBe("");
  });
});

describe("tipoDocumento", () => {
  it("distingue CPF de CNPJ pelo tamanho", () => {
    expect(tipoDocumento("123.456.789-01")).toBe("cpf");
    expect(tipoDocumento("12.345.678/0001-99")).toBe("cnpj");
    expect(tipoDocumento("123")).toBeNull();
    expect(tipoDocumento(null)).toBeNull();
  });
});

describe("pareceDocumentoCompleto", () => {
  it("aceita só documento inteiro, com ou sem pontuação", () => {
    expect(pareceDocumentoCompleto("123.456.789-01")).toBe(true);
    expect(pareceDocumentoCompleto("12345678901")).toBe(true);
    expect(pareceDocumentoCompleto("12.345.678/0001-99")).toBe(true);
  });

  it("recusa pedaço de documento — hash não casa parcial", () => {
    expect(pareceDocumentoCompleto("78901")).toBe(false);
    expect(pareceDocumentoCompleto("")).toBe(false);
  });
});

describe("documentoIncompleto", () => {
  it("avisa quando a pessoa digitou meio CPF", () => {
    expect(documentoIncompleto("1234567")).toBe(true);
    expect(documentoIncompleto("123.456.7")).toBe(true);
  });

  it("não avisa com o documento completo", () => {
    expect(documentoIncompleto("12345678901")).toBe(false);
    expect(documentoIncompleto("12345678000199")).toBe(false);
  });

  it("não confunde número de fatura com documento", () => {
    expect(documentoIncompleto("1003")).toBe(false);
    expect(documentoIncompleto("INV-1003")).toBe(false);
  });

  it("não avisa em busca por nome", () => {
    expect(documentoIncompleto("Renata")).toBe(false);
    expect(documentoIncompleto("")).toBe(false);
  });
});

describe("rotularTipo", () => {
  it("nomeia o tipo sem revelar o documento", () => {
    expect(rotularTipo("cpf")).toBe("CPF");
    expect(rotularTipo("cnpj")).toBe("CNPJ");
    expect(rotularTipo(null)).toBe("Sem documento");
  });
});
