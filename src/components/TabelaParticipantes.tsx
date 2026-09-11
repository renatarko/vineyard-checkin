import { Check, Loader2, UserPlus } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { Participante } from "@/lib/types";

/**
 * Botão de check-in.
 *
 * É uma ação, não uma caixa de seleção: marcar credencia na hora. Por isso é
 * um botão com `aria-pressed`, e não um checkbox — leitor de tela anuncia
 * "credenciado/não credenciado" em vez de "marcado".
 */
function BotaoCheckin({
  participante,
  ocupado,
  onAlternar,
}: {
  participante: Participante;
  ocupado: boolean;
  onAlternar: () => void;
}) {
  const credenciado = participante.checkin_em !== null;

  return (
    <button
      type="button"
      aria-pressed={credenciado}
      aria-label={`${credenciado ? "Desfazer check-in de" : "Credenciar"} ${participante.nome_exibicao}`}
      disabled={ocupado}
      onClick={(e) => {
        // A linha inteira abre o painel; o botão não pode disparar os dois.
        e.stopPropagation();
        onAlternar();
      }}
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-md border-2 transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        credenciado
          ? "border-success bg-success text-success-foreground"
          : "border-input bg-background hover:border-success/60 hover:bg-success/10",
        ocupado && "opacity-50",
      )}
    >
      {ocupado ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      ) : credenciado ? (
        <Check className="h-5 w-5" aria-hidden />
      ) : null}
    </button>
  );
}

export function TabelaParticipantes({
  lista,
  ocupadoId,
  onAbrir,
  onAlternar,
}: {
  lista: Participante[];
  ocupadoId: string | null;
  onAbrir: (p: Participante) => void;
  onAlternar: (p: Participante) => void;
}) {
  return (
    // A portaria trabalha no celular: as colunas secundárias somem antes de a
    // tabela precisar rolar de lado.
    <div className="overflow-hidden rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-[92px] whitespace-nowrap">Check-in</TableHead>
            <TableHead className="hidden w-[120px] sm:table-cell">Lote</TableHead>
            <TableHead>Nome</TableHead>
            <TableHead className="hidden w-[140px] md:table-cell">Fatura</TableHead>
            <TableHead className="hidden w-[180px] lg:table-cell">Observação</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {lista.map((p) => {
            const credenciado = p.checkin_em !== null;
            const precisaNome = p.precisa_identificacao && p.nome_real === null;

            return (
              <TableRow
                key={p.id}
                onClick={() => onAbrir(p)}
                className={cn(
                  "cursor-pointer",
                  // Linha credenciada com fundo verde, como na referência:
                  // é o sinal lido de relance com a fila andando.
                  credenciado && "bg-success/10 hover:bg-success/15",
                  // Coletiva ainda anônima: vai tomar tempo no balcão, então
                  // precisa saltar mesmo em telas estreitas, onde a coluna de
                  // observação não aparece.
                  precisaNome && !credenciado && "border-l-4 border-l-primary",
                )}
              >
                <TableCell>
                  <BotaoCheckin
                    participante={p}
                    ocupado={ocupadoId === p.id}
                    onAlternar={() => onAlternar(p)}
                  />
                </TableCell>

                <TableCell className="hidden text-muted-foreground sm:table-cell">
                  {p.lote ?? "—"}
                </TableCell>

                <TableCell>
                  <p className="font-medium leading-tight">{p.nome_exibicao}</p>

                  {/* Sob o nome vai o que desambigua homônimo no balcão. Na
                      referência esse lugar é o CPF mascarado; aqui o documento
                      está criptografado e não volta em claro nem em pedaço,
                      então usamos quem comprou — ou o e-mail, que é o outro
                      campo que a pessoa reconhece quando perguntada. */}
                  {(p.comprador_nome && p.comprador_nome !== p.nome_origem) || p.email ? (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {p.comprador_nome && p.comprador_nome !== p.nome_origem
                        ? `Comprado por ${p.comprador_nome}`
                        : p.email}
                    </p>
                  ) : null}

                  {/* Em telas estreitas o lote perde a coluna, mas não some. */}
                  {p.lote && (
                    <p className="mt-0.5 text-xs text-muted-foreground sm:hidden">{p.lote}</p>
                  )}
                </TableCell>

                <TableCell className="hidden text-muted-foreground md:table-cell">
                  {p.fatura ?? "—"}
                </TableCell>

                <TableCell className="hidden lg:table-cell">
                  <Observacao participante={p} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function Observacao({ participante }: { participante: Participante }) {
  const precisaNome = participante.precisa_identificacao && participante.nome_real === null;

  if (precisaNome) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
        <UserPlus className="h-3 w-3" aria-hidden />
        Informar quem é
      </span>
    );
  }

  if (participante.sumido_em !== null) {
    return <span className="text-xs text-muted-foreground">Fora da planilha</span>;
  }

  if (participante.nome_real !== null) {
    return (
      <span className="truncate text-xs text-muted-foreground">
        Planilha: {participante.nome_origem}
      </span>
    );
  }

  return <span className="text-muted-foreground">—</span>;
}
