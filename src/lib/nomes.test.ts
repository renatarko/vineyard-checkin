import { describe, expect, it } from "vitest";
import {
  LIMITE_NOME,
  mesmoNome,
  nomeExibicao,
  normalizarNomeDigitado,
  normalizarTexto,
  validarNomeReal,
} from "@/lib/nomes";

describe("normalizarTexto", () => {
  it("remove acento, colapsa espaço e baixa a caixa", () => {
    expect(normalizarTexto("  José   Antônio  SÁ ")).toBe("jose antonio sa");
  });

  it("trata nulo e vazio", () => {
    expect(normalizarTexto(null)).toBe("");
    expect(normalizarTexto(undefined)).toBe("");
    expect(normalizarTexto("   ")).toBe("");
  });

  it("preserva a letra ç normalizada", () => {
    expect(normalizarTexto("Conceição")).toBe("conceicao");
  });
});

describe("normalizarNomeDigitado", () => {
  it("colapsa espaços internos", () => {
    expect(normalizarNomeDigitado(" Ana   Gabriela ")).toBe("Ana Gabriela");
  });

  it("devolve null quando não sobra nada", () => {
    expect(normalizarNomeDigitado("   ")).toBeNull();
    expect(normalizarNomeDigitado("")).toBeNull();
    expect(normalizarNomeDigitado(null)).toBeNull();
  });
});

describe("nomeExibicao", () => {
  it("sem nome real, mostra o nome do CSV", () => {
    expect(nomeExibicao(null, "Renata Karolina")).toBe("Renata Karolina");
    expect(nomeExibicao("", "Renata Karolina")).toBe("Renata Karolina");
    expect(nomeExibicao("   ", "Renata Karolina")).toBe("Renata Karolina");
  });

  it("acrescenta o nome real depois do da planilha", () => {
    // Nessa ordem: é o nome do comprador que ancora a linha na lista.
    expect(nomeExibicao("Ana Gabriela", "Renata Karolina")).toBe(
      "Renata Karolina - Ana Gabriela",
    );
  });

  it("não duplica quando o comprador é o próprio participante", () => {
    expect(nomeExibicao("Renata Karolina", "Renata Karolina")).toBe("Renata Karolina");
    expect(nomeExibicao("  renata karolina  ", "Renata Karolina")).toBe("Renata Karolina");
  });

  it("trata acento digitado a menos como a mesma pessoa", () => {
    expect(nomeExibicao("Jose Antonio Sa", "José Antônio Sá")).toBe("José Antônio Sá");
  });

  it("limpa os espaços do nome digitado antes de concatenar", () => {
    expect(nomeExibicao("  Ana   Gabriela  ", "Renata Karolina")).toBe(
      "Renata Karolina - Ana Gabriela",
    );
  });
});

describe("mesmoNome", () => {
  it("ignora acento e caixa", () => {
    expect(mesmoNome("José", "jose")).toBe(true);
    expect(mesmoNome("ANA BEATRIZ", "  ana   beatriz ")).toBe(true);
  });

  it("nomes diferentes não casam", () => {
    expect(mesmoNome("Ana Gabriela", "Renata Karolina")).toBe(false);
  });

  it("vazio não casa com vazio", () => {
    expect(mesmoNome("", "")).toBe(false);
    expect(mesmoNome(null, null)).toBe(false);
  });
});

describe("validarNomeReal", () => {
  it("aceita nome comum", () => {
    expect(validarNomeReal(" Ana Gabriela ")).toEqual({ ok: true, nome: "Ana Gabriela" });
  });

  it("recusa vazio e curto demais", () => {
    expect(validarNomeReal("  ").ok).toBe(false);
    expect(validarNomeReal("A").ok).toBe(false);
  });

  it("recusa acima do limite do banco", () => {
    expect(validarNomeReal("x".repeat(LIMITE_NOME + 1)).ok).toBe(false);
    expect(validarNomeReal("x".repeat(LIMITE_NOME)).ok).toBe(true);
  });
});
