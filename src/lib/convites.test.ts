import { describe, expect, it } from "vitest";
import {
  estadoDoConvite,
  gerarToken,
  hashToken,
  linkDeConvite,
  podeReenviar,
} from "@/lib/convites";
import type { Convite } from "@/lib/types";

const AGORA = new Date("2026-09-11T12:00:00Z");

function convite(over: Partial<Convite> = {}): Convite {
  return {
    id: "c1",
    rotulo: "Bia (portaria)",
    papel: "operador",
    expira_em: "2026-09-13T12:00:00Z",
    revogado_em: null,
    max_usos: 1,
    usos: 0,
    auth_user_id: null,
    resgatado_em: null,
    primeiro_user_agent: null,
    criado_em: "2026-09-11T10:00:00Z",
    ...over,
  };
}

describe("gerarToken", () => {
  it("gera token longo, seguro para URL e diferente a cada chamada", () => {
    const a = gerarToken();
    const b = gerarToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(40);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe("hashToken", () => {
  it("bate com o SHA-256 que o Postgres calcula", async () => {
    // encode(sha256('dev-admin-token-local-nao-usar-em-prod'::bytea), 'hex')
    const hash = await hashToken("abc");
    expect(hash).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("é estável para a mesma entrada", async () => {
    expect(await hashToken("x")).toBe(await hashToken("x"));
  });
});

describe("linkDeConvite", () => {
  it("monta a rota registrada no App", () => {
    expect(linkDeConvite("abc123", "https://credenciamento.exemplo.com")).toBe(
      "https://credenciamento.exemplo.com/convite/abc123",
    );
  });

  it("não duplica barra quando a origem termina em /", () => {
    expect(linkDeConvite("abc", "https://exemplo.com/")).toBe("https://exemplo.com/convite/abc");
  });
});

describe("estadoDoConvite", () => {
  it("novo e dentro do prazo está ativo", () => {
    expect(estadoDoConvite(convite(), AGORA)).toBe("ativo");
  });

  it("passou do prazo está expirado", () => {
    expect(estadoDoConvite(convite({ expira_em: "2026-09-10T12:00:00Z" }), AGORA)).toBe(
      "expirado",
    );
  });

  it("revogado ganha de expirado e de resgatado", () => {
    const revogado = convite({
      revogado_em: "2026-09-11T11:00:00Z",
      expira_em: "2026-09-01T12:00:00Z",
      usos: 1,
      resgatado_em: "2026-09-11T10:30:00Z",
    });
    expect(estadoDoConvite(revogado, AGORA)).toBe("revogado");
  });

  it("usado por alguém aparece como em uso", () => {
    const usado = convite({ usos: 1, resgatado_em: "2026-09-11T11:00:00Z" });
    expect(estadoDoConvite(usado, AGORA)).toBe("resgatado");
  });

  it("esgotado sem resgate registrado é esgotado", () => {
    expect(estadoDoConvite(convite({ usos: 1 }), AGORA)).toBe("esgotado");
  });

  it("convite de vários usos continua ativo até o último", () => {
    expect(estadoDoConvite(convite({ max_usos: 3, usos: 2 }), AGORA)).toBe("ativo");
    expect(estadoDoConvite(convite({ max_usos: 3, usos: 3 }), AGORA)).toBe("esgotado");
  });
});

describe("podeReenviar", () => {
  it("só o convite ativo vale reenviar", () => {
    expect(podeReenviar(convite(), AGORA)).toBe(true);
    expect(podeReenviar(convite({ usos: 1 }), AGORA)).toBe(false);
    expect(podeReenviar(convite({ revogado_em: "2026-09-11T11:00:00Z" }), AGORA)).toBe(false);
  });
});
