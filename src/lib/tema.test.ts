import { beforeEach, describe, expect, it } from "vitest";
import {
  CHAVE_TEMA,
  TEMA_PADRAO,
  aplicarTema,
  lerTemaSalvo,
  outroTema,
  salvarTema,
  temaAtual,
} from "@/lib/tema";

function armazenamentoFalso(inicial: Record<string, string> = {}) {
  const dados = { ...inicial };
  return {
    getItem: (k: string) => dados[k] ?? null,
    setItem: (k: string, v: string) => {
      dados[k] = v;
    },
    dados,
  };
}

/** Imita janela privada com storage bloqueado, onde o acesso lança. */
const armazenamentoQuebrado = {
  getItem() {
    throw new DOMException("bloqueado");
  },
  setItem() {
    throw new DOMException("bloqueado");
  },
};

describe("lerTemaSalvo", () => {
  it("lê o que foi salvo", () => {
    expect(lerTemaSalvo(armazenamentoFalso({ [CHAVE_TEMA]: "claro" }))).toBe("claro");
    expect(lerTemaSalvo(armazenamentoFalso({ [CHAVE_TEMA]: "escuro" }))).toBe("escuro");
  });

  it("devolve null quando não há nada salvo", () => {
    expect(lerTemaSalvo(armazenamentoFalso())).toBeNull();
  });

  it("ignora valor que não reconhece", () => {
    expect(lerTemaSalvo(armazenamentoFalso({ [CHAVE_TEMA]: "roxo" }))).toBeNull();
  });

  it("não quebra quando o storage está bloqueado", () => {
    expect(lerTemaSalvo(armazenamentoQuebrado)).toBeNull();
  });
});

describe("salvarTema", () => {
  it("grava a escolha", () => {
    const a = armazenamentoFalso();
    salvarTema("claro", a);
    expect(a.dados[CHAVE_TEMA]).toBe("claro");
  });

  it("storage bloqueado não derruba a tela", () => {
    expect(() => salvarTema("claro", armazenamentoQuebrado)).not.toThrow();
  });
});

describe("outroTema", () => {
  it("alterna entre os dois", () => {
    expect(outroTema("escuro")).toBe("claro");
    expect(outroTema("claro")).toBe("escuro");
  });
});

describe("aplicarTema", () => {
  let raiz: HTMLElement;

  beforeEach(() => {
    raiz = document.createElement("html");
  });

  it("escuro põe a classe e o color-scheme", () => {
    aplicarTema("escuro", raiz);
    expect(raiz.classList.contains("dark")).toBe(true);
    expect(raiz.style.colorScheme).toBe("dark");
  });

  it("claro tira a classe e ajusta o color-scheme", () => {
    aplicarTema("escuro", raiz);
    aplicarTema("claro", raiz);
    expect(raiz.classList.contains("dark")).toBe(false);
    expect(raiz.style.colorScheme).toBe("light");
  });

  it("aplicar duas vezes o mesmo tema não acumula classe", () => {
    aplicarTema("escuro", raiz);
    aplicarTema("escuro", raiz);
    expect(raiz.className).toBe("dark");
  });

  it("temaAtual lê de volta o que foi aplicado", () => {
    aplicarTema("claro", raiz);
    expect(temaAtual(raiz)).toBe("claro");
    aplicarTema("escuro", raiz);
    expect(temaAtual(raiz)).toBe("escuro");
  });
});

describe("padrão do produto", () => {
  it("é escuro", () => {
    expect(TEMA_PADRAO).toBe("escuro");
  });
});
