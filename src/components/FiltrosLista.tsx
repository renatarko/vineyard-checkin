import { cn } from "@/lib/utils";
import type { Situacao } from "@/lib/busca";

/** Chips de lote. Saem dos próprios dados, não de uma lista fixa. */
export function ChipsLote({
  lotes,
  selecionado,
  onSelecionar,
}: {
  lotes: string[];
  selecionado: string | null;
  onSelecionar: (lote: string | null) => void;
}) {
  if (lotes.length === 0) return null;

  const chip = (ativo: boolean) =>
    cn(
      "shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-colors",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      // Laranja marca o que está selecionado; o magenta fica reservado para
      // ação. O rótulo por cima do laranja é o navy — branco reprova no
      // contraste.
      ativo
        ? "border-accent bg-accent text-accent-foreground"
        : "border-input bg-card hover:bg-hover",
    );

  return (
    // Rola de lado quando há muitos lotes, em vez de quebrar em várias linhas
    // e empurrar a tabela para baixo da dobra.
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
      <button type="button" className={chip(selecionado === null)} onClick={() => onSelecionar(null)}>
        Todos
      </button>
      {lotes.map((lote) => (
        <button
          key={lote}
          type="button"
          className={chip(selecionado === lote)}
          onClick={() => onSelecionar(lote)}
        >
          {lote}
        </button>
      ))}
    </div>
  );
}

const SITUACOES: { valor: Situacao; rotulo: string }[] = [
  { valor: "todos", rotulo: "Todos" },
  { valor: "realizados", rotulo: "Realizados" },
  { valor: "pendentes", rotulo: "Pendentes" },
];

export function AbasSituacao({
  valor,
  onMudar,
}: {
  valor: Situacao;
  onMudar: (s: Situacao) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Filtrar por situação do check-in"
      className="flex shrink-0 rounded-lg border bg-card p-1"
    >
      {SITUACOES.map((s) => (
        <button
          key={s.valor}
          role="tab"
          type="button"
          aria-selected={valor === s.valor}
          onClick={() => onMudar(s.valor)}
          className={cn(
            "flex-1 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            valor === s.valor
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:bg-hover",
          )}
        >
          {s.rotulo}
        </button>
      ))}
    </div>
  );
}
