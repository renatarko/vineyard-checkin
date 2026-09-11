import { useRef } from "react";
import { FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { PreviewImportacao } from "@/components/PreviewImportacao";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useImportacao } from "@/hooks/useImportacao";

const CAMPOS: Record<string, string> = {
  nome: "Nome do participante",
  documento: "CPF/CNPJ",
  email: "E-mail",
  comprador: "Nome do comprador",
  fatura: "Fatura",
  lote: "Nome do lote",
};

export default function Importar() {
  const { arquivo, preview, ler, confirmar, limpar, analisando } = useImportacao();
  const input = useRef<HTMLInputElement>(null);

  return (
    <AppLayout>
      <div className="space-y-4">
        <div>
          <h1 className="text-lg font-semibold">Importar planilha</h1>
          <p className="text-sm text-muted-foreground">
            Pode importar o mesmo arquivo quantas vezes quiser. Quem já foi credenciado e
            os nomes informados na portaria nunca são sobrescritos.
          </p>
        </div>

        <input
          ref={input}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) ler.mutate(f);
            e.target.value = "";
          }}
        />

        {arquivo === null ? (
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed p-10 text-center transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Upload className="h-8 w-8 text-muted-foreground" aria-hidden />
            <span className="font-medium">Escolher arquivo CSV</span>
            <span className="text-sm text-muted-foreground">
              Separado por ponto e vírgula ou vírgula
            </span>
          </button>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
              <FileSpreadsheet className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{arquivo.nome}</p>
                <p className="text-sm text-muted-foreground">
                  {arquivo.linhas.length} linhas lidas
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={limpar}>
                Trocar
              </Button>
            </div>

            {/* Mostrar o mapeamento evita o erro silencioso de importar com uma
                coluna lida errada — e aí tudo vira "novo" na próxima vez. */}
            <div className="rounded-lg border bg-card p-3">
              <p className="text-sm font-medium">Colunas reconhecidas</p>
              <ul className="mt-2 space-y-1 text-sm">
                {Object.entries(CAMPOS).map(([campo, rotulo]) => {
                  const coluna = arquivo.mapeamento[campo as keyof typeof arquivo.mapeamento];
                  return (
                    <li key={campo} className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">{rotulo}</span>
                      {coluna ? (
                        <span className="truncate font-mono text-xs">{coluna}</span>
                      ) : (
                        <Badge variant="outline">não encontrada</Badge>
                      )}
                    </li>
                  );
                })}
              </ul>
              {arquivo.colunasIgnoradas.length > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Ignoradas: {arquivo.colunasIgnoradas.join(", ")}
                </p>
              )}
            </div>

            {analisando ? (
              <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                Analisando o que vai mudar…
              </div>
            ) : preview ? (
              <>
                <PreviewImportacao resumo={preview} />

                <div className="sticky bottom-0 -mx-4 border-t bg-background/95 px-4 py-3 backdrop-blur">
                  <Button
                    size="lg"
                    className="w-full"
                    onClick={() => confirmar.mutate()}
                    disabled={confirmar.isPending}
                  >
                    {confirmar.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                    )}
                    Confirmar importação
                  </Button>
                </div>
              </>
            ) : null}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
