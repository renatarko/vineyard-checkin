import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { MODO_MOCK } from "@/lib/mock-flag";
import { mock } from "@/lib/mock";
import { CHAVE_PARTICIPANTES } from "@/hooks/useParticipantes";
import { ErroCsv, decodificar, paraPayload, parseCsv, type ResultadoParse } from "@/lib/csv";
import type { ResumoImportacao } from "@/lib/types";

export interface ArquivoLido extends ResultadoParse {
  nome: string;
}

export function useImportacao() {
  const queryClient = useQueryClient();
  const [arquivo, setArquivo] = useState<ArquivoLido | null>(null);
  const [preview, setPreview] = useState<ResumoImportacao | null>(null);

  /** Lê o arquivo no navegador. Nada sai daqui antes de você confirmar. */
  const ler = useMutation({
    mutationFn: async (file: File): Promise<ArquivoLido> => {
      const buffer = await file.arrayBuffer();
      const texto = decodificar(buffer);
      return { ...parseCsv(texto), nome: file.name };
    },
    onSuccess: (lido) => {
      setArquivo(lido);
      setPreview(null);
      simular.mutate(lido);
    },
    onError: (e: Error) => {
      setArquivo(null);
      setPreview(null);
      toast.error(e instanceof ErroCsv ? e.message : "Não deu para ler esse arquivo.");
    },
  });

  /**
   * Preview. Roda EXATAMENTE a mesma função SQL da gravação, com
   * `p_confirmar = false` — se o preview fosse calculado por outro caminho,
   * os dois algoritmos divergiriam com o tempo.
   */
  const simular = useMutation({
    mutationFn: async (lido: ArquivoLido): Promise<ResumoImportacao> => {
      if (MODO_MOCK) return mock.importar(lido.linhas, false);

      const { data, error } = await supabase.rpc("importar_participantes", {
        p_linhas: paraPayload(lido.linhas),
        p_arquivo: lido.nome,
        p_confirmar: false,
      });
      if (error) throw error;
      return data as unknown as ResumoImportacao;
    },
    onSuccess: setPreview,
    onError: () => toast.error("Não deu para analisar o arquivo."),
  });

  const confirmar = useMutation({
    mutationFn: async (): Promise<ResumoImportacao> => {
      if (arquivo === null) throw new Error("SEM_ARQUIVO");
      if (MODO_MOCK) return mock.importar(arquivo.linhas, true);

      const { data, error } = await supabase.rpc("importar_participantes", {
        p_linhas: paraPayload(arquivo.linhas),
        p_arquivo: arquivo.nome,
        p_confirmar: true,
      });
      if (error) throw error;
      return data as unknown as ResumoImportacao;
    },
    onSuccess: (resumo) => {
      queryClient.invalidateQueries({ queryKey: CHAVE_PARTICIPANTES });
      setArquivo(null);
      setPreview(null);
      toast.success(
        `${resumo.novos} novos, ${resumo.atualizados} atualizados, ${resumo.sumidos} fora da planilha.`,
      );
    },
    onError: (e: Error) =>
      toast.error(
        e.message.includes("SEM_PERMISSAO")
          ? "Só quem é admin pode importar."
          : "Não deu para importar.",
      ),
  });

  const limpar = () => {
    setArquivo(null);
    setPreview(null);
  };

  return {
    arquivo,
    preview,
    ler,
    simular,
    confirmar,
    limpar,
    analisando: simular.isPending || ler.isPending,
  };
}
