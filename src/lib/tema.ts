export type Tema = "claro" | "escuro";

export const CHAVE_TEMA = "vineyard:tema";

/** Padrão do produto: escuro. A portaria trabalha à noite, no salão. */
export const TEMA_PADRAO: Tema = "escuro";

/**
 * O que está salvo, se for um valor que reconhecemos.
 *
 * Aceita `Storage` por parâmetro para o teste não depender do navegador — e
 * porque `localStorage` lança em janela privada com cookies bloqueados, caso
 * em que a aplicação precisa seguir funcionando no tema padrão.
 */
export function lerTemaSalvo(armazenamento?: Pick<Storage, "getItem">): Tema | null {
  try {
    const bruto = (armazenamento ?? localStorage).getItem(CHAVE_TEMA);
    return bruto === "claro" || bruto === "escuro" ? bruto : null;
  } catch {
    return null;
  }
}

export function salvarTema(tema: Tema, armazenamento?: Pick<Storage, "setItem">): void {
  try {
    (armazenamento ?? localStorage).setItem(CHAVE_TEMA, tema);
  } catch {
    // Sem persistência a escolha vale só para esta aba. Melhor isso do que
    // derrubar a tela de credenciamento por causa de um storage bloqueado.
  }
}

export function outroTema(tema: Tema): Tema {
  return tema === "escuro" ? "claro" : "escuro";
}

/**
 * Escreve o tema no documento.
 *
 * A classe é o que o Tailwind usa (`darkMode: ["class"]`); `color-scheme` é o
 * que faz barra de rolagem, seleção de texto e controles nativos
 * acompanharem em vez de continuarem claros.
 */
export function aplicarTema(tema: Tema, raiz: HTMLElement = document.documentElement): void {
  raiz.classList.toggle("dark", tema === "escuro");
  raiz.style.colorScheme = tema === "escuro" ? "dark" : "light";
}

/** O tema que o documento está exibindo agora. */
export function temaAtual(raiz: HTMLElement = document.documentElement): Tema {
  return raiz.classList.contains("dark") ? "escuro" : "claro";
}
