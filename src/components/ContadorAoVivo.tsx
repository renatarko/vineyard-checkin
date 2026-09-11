import type { Contadores } from "@/lib/busca";
import { cn } from "@/lib/utils";

function Cartao({
  rotulo,
  valor,
  cor,
}: {
  rotulo: string;
  valor: number;
  cor: "verde" | "vermelho";
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border bg-card p-4">
      <div>
        <p className="text-sm text-muted-foreground">{rotulo}</p>
        <p className="mt-1 text-3xl font-bold tabular-nums leading-none">{valor}</p>
      </div>
      <span
        className={cn(
          "mt-1 h-2.5 w-2.5 shrink-0 rounded-full",
          cor === "verde" ? "bg-success" : "bg-destructive",
        )}
        aria-hidden
      />
    </div>
  );
}

/**
 * Os dois números que a produção fica olhando a noite toda. Atualizados por
 * Realtime, então batem entre todos os aparelhos da portaria.
 */
export function ContadorAoVivo({ contadores }: { contadores: Contadores }) {
  const { total, credenciados, pendentesIdentificacao } = contadores;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-3">
        <Cartao rotulo="Check-in realizado" valor={credenciados} cor="verde" />
        <Cartao rotulo="Check-in pendente" valor={total - credenciados} cor="vermelho" />
      </div>

      {pendentesIdentificacao > 0 && (
        <p className="text-sm text-muted-foreground">
          {pendentesIdentificacao}{" "}
          {pendentesIdentificacao === 1
            ? "ingresso coletivo ainda sem nome do participante"
            : "ingressos coletivos ainda sem nome do participante"}
        </p>
      )}
    </div>
  );
}
