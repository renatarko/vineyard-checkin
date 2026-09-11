import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { ContadorAoVivo } from "@/components/ContadorAoVivo";
import { TabelaParticipantes } from "@/components/TabelaParticipantes";
import { AbasSituacao, ChipsLote } from "@/components/FiltrosLista";
import { SheetParticipante } from "@/components/SheetParticipante";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useBuscaPorDocumento, useParticipantes } from "@/hooks/useParticipantes";
import { useCredenciamento } from "@/hooks/useCredenciamento";
import {
  filtrarParticipantes,
  filtrarPorLote,
  filtrarPorSituacao,
  lotesDisponiveis,
  type Situacao,
} from "@/lib/busca";
import { documentoIncompleto, pareceDocumentoCompleto } from "@/lib/documento";
import type { Participante } from "@/lib/types";

/** Quantas linhas renderizar de uma vez. Sem isto, 3.000 linhas travam o celular. */
const PAGINA = 60;

export default function Credenciamento() {
  const { lista, contadores, isLoading } = useParticipantes();
  const { credenciar, desfazer } = useCredenciamento();

  const [termo, setTermo] = useState("");
  const [lote, setLote] = useState<string | null>(null);
  const [situacao, setSituacao] = useState<Situacao>("todos");
  const [visiveis, setVisiveis] = useState(PAGINA);
  const [selecionado, setSelecionado] = useState<Participante | null>(null);
  const [paraDesfazer, setParaDesfazer] = useState<Participante | null>(null);

  const idsPorDocumento = useBuscaPorDocumento(termo);
  const lotes = useMemo(() => lotesDisponiveis(lista), [lista]);

  const resultados = useMemo(() => {
    setVisiveis(PAGINA);
    const porBusca = filtrarParticipantes(lista, termo, idsPorDocumento);
    return filtrarPorSituacao(filtrarPorLote(porBusca, lote), situacao);
  }, [lista, termo, idsPorDocumento, lote, situacao]);

  // A lista vem do Realtime, então o objeto selecionado precisa ser relido a
  // cada render — senão o painel mostra o estado de antes do check-in.
  const atual =
    selecionado === null
      ? null
      : (lista.find((p) => p.id === selecionado.id) ?? selecionado);

  const ocupadoId = credenciar.isPending
    ? credenciar.variables?.id ?? null
    : desfazer.isPending
      ? desfazer.variables ?? null
      : null;

  /**
   * Clique direto no quadradinho da tabela.
   *
   * Numa coletiva ainda anônima, credenciar sem saber quem é deixaria a lista
   * com dois "Renata Karolina" idênticos e nenhum jeito de diferenciar quem
   * entrou. Nesse caso o clique abre o painel para informar o nome.
   */
  const alternar = (p: Participante) => {
    if (p.checkin_em !== null) {
      // Desfazer pede confirmação: o alvo é pequeno, fica ao lado de dezenas
      // de linhas iguais, e um toque errado apaga a entrada de quem já passou
      // pela portaria.
      setParaDesfazer(p);
      return;
    }
    if (p.precisa_identificacao && p.nome_real === null) {
      setSelecionado(p);
      return;
    }
    credenciar.mutate({ id: p.id });
  };

  const avisoDocumento = documentoIncompleto(termo);
  const buscandoDocumento = pareceDocumentoCompleto(termo) && idsPorDocumento === undefined;

  return (
    <AppLayout>
      <div className="space-y-4">
        <ContadorAoVivo contadores={contadores} />

        <ChipsLote lotes={lotes} selecionado={lote} onSelecionar={setLote} />

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={termo}
              onChange={(e) => setTermo(e.target.value)}
              placeholder="Buscar por nome, fatura ou CPF completo…"
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

          <AbasSituacao valor={situacao} onMudar={setSituacao} />
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
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : resultados.length === 0 ? (
          <p className="py-12 text-center text-muted-foreground">
            {buscandoDocumento
              ? "Procurando…"
              : lista.length === 0
                ? "Nenhum participante importado ainda."
                : "Ninguém encontrado com esses filtros."}
          </p>
        ) : (
          <>
            <TabelaParticipantes
              lista={resultados.slice(0, visiveis)}
              ocupadoId={ocupadoId}
              onAbrir={setSelecionado}
              onAlternar={alternar}
            />

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

      <AlertDialog
        open={paraDesfazer !== null}
        onOpenChange={(aberto) => !aberto && setParaDesfazer(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desfazer o check-in?</AlertDialogTitle>
            <AlertDialogDescription>
              {paraDesfazer?.nome_exibicao} volta para a lista de quem ainda não entrou. O
              nome informado na portaria é mantido.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (paraDesfazer !== null) desfazer.mutate(paraDesfazer.id);
                setParaDesfazer(null);
              }}
            >
              Desfazer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
