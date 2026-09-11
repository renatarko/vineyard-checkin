import type { Convite } from "@/lib/types";

/**
 * Convites de acesso.
 *
 * O link É a credencial: quem tem o link entra. Por isso o token é gerado aqui
 * no navegador, só o hash vai para o banco, e o valor bruto aparece uma única
 * vez — se a pessoa fechar a tela sem copiar, o caminho é criar outro convite.
 */

/** 32 bytes em base64url. Sem padding e sem caractere que quebre numa URL. */
export function gerarToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binario = "";
  bytes.forEach((b) => {
    binario += String.fromCharCode(b);
  });
  return btoa(binario).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function linkDeConvite(token: string, origem: string = window.location.origin): string {
  return `${origem.replace(/\/+$/, "")}/convite/${token}`;
}

export type EstadoConvite = "ativo" | "resgatado" | "expirado" | "revogado" | "esgotado";

export function estadoDoConvite(convite: Convite, agora: Date = new Date()): EstadoConvite {
  // Revogado ganha de tudo: é a ação explícita de cortar o acesso.
  if (convite.revogado_em !== null) return "revogado";
  if (convite.usos >= convite.max_usos) {
    return convite.resgatado_em !== null ? "resgatado" : "esgotado";
  }
  if (new Date(convite.expira_em).getTime() <= agora.getTime()) return "expirado";
  return "ativo";
}

const ROTULOS: Record<EstadoConvite, string> = {
  ativo: "Link válido",
  resgatado: "Em uso",
  expirado: "Expirado",
  revogado: "Revogado",
  esgotado: "Esgotado",
};

export function descreverEstado(estado: EstadoConvite): string {
  return ROTULOS[estado];
}

/** Um convite ainda pendente é o único que vale a pena reenviar. */
export function podeReenviar(convite: Convite, agora: Date = new Date()): boolean {
  return estadoDoConvite(convite, agora) === "ativo";
}
