import { UserCheck, Users } from "lucide-react";
import type { Contadores } from "@/lib/busca";

/**
 * O número que a produção fica olhando a noite toda. Grande, no topo, sempre
 * visível — atualizado por Realtime, então bate entre todos os aparelhos.
 */
export function ContadorAoVivo({ contadores }: { contadores: Contadores }) {
  const { total, credenciados, pendentesIdentificacao } = contadores;
  const percentual = total === 0 ? 0 : Math.round((credenciados / total) * 100);

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <UserCheck className="h-4 w-4" aria-hidden />
            Credenciados
          </p>
          <p className="mt-1 text-3xl font-bold tabular-nums leading-none">
            {credenciados}
            <span className="ml-1 text-lg font-normal text-muted-foreground">
              de {total}
            </span>
          </p>
        </div>
        <p className="text-2xl font-semibold tabular-nums text-muted-foreground">
          {percentual}%
        </p>
      </div>

      <div
        className="mt-3 h-2 overflow-hidden rounded-full bg-secondary"
        role="progressbar"
        aria-valuenow={percentual}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Percentual credenciado"
      >
        <div
          className="h-full rounded-full bg-success transition-all duration-500"
          style={{ width: `${percentual}%` }}
        />
      </div>

      {pendentesIdentificacao > 0 && (
        <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
          <Users className="h-4 w-4" aria-hidden />
          {pendentesIdentificacao}{" "}
          {pendentesIdentificacao === 1
            ? "ingresso coletivo ainda sem nome"
            : "ingressos coletivos ainda sem nome"}
        </p>
      )}
    </div>
  );
}
