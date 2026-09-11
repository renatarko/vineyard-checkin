import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { ContadorAoVivo } from "@/components/ContadorAoVivo";
import { CardParticipante } from "@/components/CardParticipante";
import { SheetParticipante } from "@/components/SheetParticipante";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useBuscaPorDocumento, useParticipantes } from "@/hooks/useParticipantes";
import { filtrarParticipantes } from "@/lib/busca";
import { documentoIncompleto, pareceDocumentoCompleto } from "@/lib/documento";
import type { Participante } from "@/lib/types";

/** Quantas linhas renderizar de uma vez. Sem isto, 3.000 cards travam o celular. */
const PAGINA = 60;

export default function Credenciamento() {
  const { lista, contadores, isLoading } = useParticipantes();
  const [termo, setTermo] = useState("");
  const [visiveis, setVisiveis] = useState(PAGINA);
  const [selecionado, setSelecionado] = useState<Participante | null>(null);

  const idsPorDocumento = useBuscaPorDocumento(termo);

  const resultados = useMemo(() => {
    setVisiveis(PAGINA);
    return filtrarParticipantes(lista, termo, idsPorDocumento);
  }, [lista, termo, idsPorDocumento]);

  // A lista vem do Realtime, então o objeto selecionado precisa ser relido a
  // cada render — senão o sheet mostra o estado de antes do check-in.
  const atual =
    selecionado === null
      ? null
      : (lista.find((p) => p.id === selecionado.id) ?? selecionado);

  const avisoDocumento = documentoIncompleto(termo);
  const buscandoDocumento = pareceDocumentoCompleto(termo) && idsPorDocumento === undefined;

  return (
    <AppLayout>
      <div className="space-y-4">
        <ContadorAoVivo contadores={contadores} />

        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            placeholder="Nome, fatura ou CPF completo"
            className="h-12 pl-9 pr-10"
            autoComplete="off"
            aria-label="Buscar participante"
          />
          {termo !== "" && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2"
              onClick={() => setTermo("")}
              aria-label="Limpar busca"
            >
              <X className="h-4 w-4" aria-hidden />
            </Button>
          )}
        </div>

        {/* O CPF está criptografado: busca parcial não existe, e é melhor
            dizer isso do que devolver uma lista vazia sem explicação. */}
        {avisoDocumento && (
          <p className="text-sm text-muted-foreground">
            Para buscar por documento, digite o CPF ou CNPJ completo.
          </p>
        )}

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-[72px] w-full rounded-xl" />
            ))}
          </div>
        ) : resultados.length === 0 ? (
          <p className="py-12 text-center text-muted-foreground">
            {buscandoDocumento
              ? "Procurando…"
              : termo === ""
                ? "Nenhum participante importado ainda."
                : "Ninguém encontrado."}
          </p>
        ) : (
          <>
            <div className="space-y-2">
              {resultados.slice(0, visiveis).map((p) => (
                <CardParticipante
                  key={p.id}
                  participante={p}
                  onAbrir={() => setSelecionado(p)}
                />
              ))}
            </div>

            {resultados.length > visiveis && (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setVisiveis((v) => v + PAGINA)}
              >
                Mostrar mais ({resultados.length - visiveis})
              </Button>
            )}
          </>
        )}
      </div>

      <SheetParticipante
        participante={atual}
        aberto={selecionado !== null}
        onFechar={() => setSelecionado(null)}
      />
    </AppLayout>
  );
}
