import { AlertTriangle, FilePlus2, MinusCircle, RefreshCw, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ResumoImportacao } from "@/lib/types";

function Numero({
  valor,
  rotulo,
  Icone,
  destaque,
}: {
  valor: number;
  rotulo: string;
  Icone: typeof FilePlus2;
  destaque?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-3",
        destaque && valor > 0 && "border-primary/40 bg-primary/5",
      )}
    >
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icone className="h-3.5 w-3.5" aria-hidden />
        {rotulo}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums leading-none">{valor}</p>
    </div>
  );
}

export function PreviewImportacao({ resumo }: { resumo: ResumoImportacao }) {
  const credenciadosSumidos = resumo.sumidos_credenciados ?? [];

  return (
    <div className="space-y-4">
      {/* Este é o aviso que não pode passar batido: gente que já entrou no
          evento e não está mais na planilha. Vai completo, nunca truncado. */}
      {credenciadosSumidos.length > 0 && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <p className="flex items-center gap-2 font-medium text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
            {credenciadosSumidos.length}{" "}
            {credenciadosSumidos.length === 1
              ? "pessoa já credenciada sumiu da planilha"
              : "pessoas já credenciadas sumiram da planilha"}
          </p>
          <p className="mt-1 text-sm">
            Elas continuam na lista e o check-in é mantido. Confira com a bilheteria antes
            de importar.
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {credenciadosSumidos.map((p, i) => (
              <li key={i} className="truncate">
                {p.nome} <span className="text-muted-foreground">· {p.fatura}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Numero valor={resumo.novos} rotulo="Novos" Icone={FilePlus2} destaque />
        <Numero valor={resumo.atualizados} rotulo="Atualizados" Icone={RefreshCw} />
        <Numero valor={resumo.inalterados} rotulo="Sem mudança" Icone={RefreshCw} />
        <Numero valor={resumo.sumidos} rotulo="Fora da planilha" Icone={MinusCircle} />
      </div>

      <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
        <Badge variant="secondary" className="gap-1">
          <Users className="h-3 w-3" aria-hidden />
          {resumo.coletivas} em inscrições coletivas
        </Badge>
        <Badge variant="secondary">{resumo.linhas_total} linhas no arquivo</Badge>
        {resumo.ignoradas > 0 && (
          <Badge variant="secondary">{resumo.ignoradas} sem nome, ignoradas</Badge>
        )}
      </div>

      {resumo.amostra_novos.length > 0 && (
        <details className="rounded-lg border bg-card p-3">
          <summary className="cursor-pointer text-sm font-medium">
            Ver quem vai entrar ({resumo.novos})
          </summary>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            {resumo.amostra_novos.map((p, i) => (
              <li key={i} className="truncate">
                {p.nome}
                {p.fatura && <span> · {p.fatura}</span>}
                {p.coletiva && <span className="text-primary"> · coletiva</span>}
              </li>
            ))}
            {resumo.novos > resumo.amostra_novos.length && (
              <li>… e mais {resumo.novos - resumo.amostra_novos.length}</li>
            )}
          </ul>
        </details>
      )}

      {resumo.amostra_sumidos.length > 0 && (
        <details className="rounded-lg border bg-card p-3">
          <summary className="cursor-pointer text-sm font-medium">
            Ver quem saiu da planilha ({resumo.sumidos})
          </summary>
          <p className="mt-1 text-xs text-muted-foreground">
            Ninguém é apagado: essas linhas ficam marcadas como fora da planilha.
          </p>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            {resumo.amostra_sumidos.map((p, i) => (
              <li key={i} className="truncate">
                {p.nome} · {p.fatura}
                {p.credenciado && <span className="text-destructive"> · já credenciado</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
