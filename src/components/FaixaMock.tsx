import { MODO_MOCK } from "@/lib/mock-flag";

/**
 * Deixa explícito que os dados são de mentira.
 *
 * Sem isto, é fácil olhar a tela com 31 participantes e achar que a planilha
 * já foi importada — ou pior, mostrar para alguém achando que é real.
 */
export function FaixaMock() {
  if (!MODO_MOCK) return null;

  return (
    <div className="bg-warning px-4 py-1 text-center text-xs font-medium text-warning-foreground">
      Modo demonstração · dados de mentira, nada é salvo
    </div>
  );
}
