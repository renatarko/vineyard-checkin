import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { contar, indexar, type ParticipanteBuscavel } from "@/lib/busca";
import { pareceDocumentoCompleto } from "@/lib/documento";
import type { Participante } from "@/lib/types";

export const CHAVE_PARTICIPANTES = ["participantes"];

/** Colunas que a portaria precisa. O documento nunca sai do banco em claro. */
const COLUNAS =
  "id, nome_origem, nome_real, nome_exibicao, documento_hash, documento_tipo, email, " +
  "comprador_nome, fatura, fatura_norm, lote, precisa_identificacao, sumido_em, " +
  "checkin_em, checkin_por, nome_real_em, nome_real_por";

/**
 * Carrega a lista inteira de uma vez e mantém em dia por Realtime.
 *
 * Com alguns milhares de linhas isso é alguns megabytes uma vez só, e a busca
 * passa a ser instantânea e imune a oscilação de rede no meio da fila — o que
 * uma busca que vai ao servidor a cada tecla não consegue ser.
 */
export function useParticipantes() {
  const queryClient = useQueryClient();

  const consulta = useQuery({
    queryKey: CHAVE_PARTICIPANTES,
    staleTime: 30_000,
    // Realtime é o caminho normal; isto é a rede de segurança para quando o
    // websocket cai sem avisar.
    refetchInterval: 120_000,
    queryFn: async (): Promise<Participante[]> => {
      const { data, error } = await supabase
        .from("participantes")
        .select(COLUNAS)
        .order("nome_exibicao");
      if (error) throw error;
      return (data ?? []) as unknown as Participante[];
    },
  });

  useEffect(() => {
    const canal = supabase
      .channel("participantes-ao-vivo")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "participantes" },
        () => {
          queryClient.invalidateQueries({ queryKey: CHAVE_PARTICIPANTES });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(canal);
    };
  }, [queryClient]);

  const lista = useMemo<ParticipanteBuscavel[]>(
    () => indexar(consulta.data ?? []),
    [consulta.data],
  );

  const contadores = useMemo(() => contar(consulta.data ?? []), [consulta.data]);

  return { ...consulta, lista, contadores };
}

/**
 * Busca por documento.
 *
 * O CPF está criptografado e o front não tem a chave, então esta é a única
 * parte da busca que precisa do servidor. Só dispara com o documento completo
 * — hash não casa pedaço.
 */
export function useBuscaPorDocumento(termo: string) {
  const [ids, setIds] = useState<Set<string> | undefined>(undefined);

  useEffect(() => {
    if (!pareceDocumentoCompleto(termo)) {
      setIds(undefined);
      return;
    }

    let cancelado = false;
    supabase
      .rpc("buscar_por_documento", { p_texto: termo })
      .then(({ data, error }) => {
        if (cancelado) return;
        if (error) {
          setIds(new Set());
          return;
        }
        const encontrados = (data ?? []) as unknown as string[];
        setIds(new Set(encontrados));
      });

    return () => {
      cancelado = true;
    };
  }, [termo]);

  return ids;
}
