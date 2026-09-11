import { Check, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Participante } from "@/lib/types";

/**
 * Uma linha da lista.
 *
 * Três estados, e a diferença entre eles precisa ser lida de relance, a um
 * braço de distância, com a fila andando:
 *
 *  - pendente de identificação (coletiva): faixa na lateral, é o que mais
 *    pede atenção — vai tomar tempo no balcão;
 *  - normal: card comum;
 *  - credenciado: esmaecido, sai do caminho.
 */
export function CardParticipante({
  participante,
  onAbrir,
}: {
  participante: Participante;
  onAbrir: () => void;
}) {
  const credenciado = participante.checkin_em !== null;
  const precisaNome = participante.precisa_identificacao && participante.nome_real === null;

  return (
    <button
      type="button"
      onClick={onAbrir}
      className={cn(
        "relative w-full overflow-hidden rounded-xl border bg-card p-3 text-left transition-colors",
        "hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        credenciado && "opacity-60",
        precisaNome && !credenciado && "border-primary/40",
      )}
    >
      {precisaNome && !credenciado && (
        <span className="absolute inset-y-0 left-0 w-1 bg-primary" aria-hidden />
      )}

      <div className="flex items-center gap-3 pl-1">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{participante.nome_exibicao}</p>

          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            {participante.fatura && <span className="truncate">{participante.fatura}</span>}
            {participante.lote && <span className="truncate">· {participante.lote}</span>}
          </div>

          {precisaNome && (
            <Badge variant="outline" className="mt-1.5 gap-1 border-primary/40 text-primary">
              <UserPlus className="h-3 w-3" aria-hidden />
              Informar quem é
            </Badge>
          )}

          {participante.sumido_em !== null && (
            <Badge variant="outline" className="mt-1.5">
              Fora da planilha
            </Badge>
          )}
        </div>

        {credenciado && (
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-success/15"
            aria-label="Credenciado"
          >
            <Check className="h-4 w-4 text-success" aria-hidden />
          </span>
        )}
      </div>
    </button>
  );
}
