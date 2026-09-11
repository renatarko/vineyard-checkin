import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { MODO_MOCK } from "@/lib/mock-flag";
import { mock } from "@/lib/mock";
import { CHAVE_PARTICIPANTES } from "@/hooks/useParticipantes";
import type { Participante } from "@/lib/types";

const MENSAGENS: Record<string, string> = {
  SEM_PERMISSAO: "Seu acesso foi removido. Peça um link novo.",
  EVENTO_FECHADO: "O credenciamento está encerrado.",
  NOME_MUITO_LONGO: "Nome longo demais.",
  PARTICIPANTE_INEXISTENTE: "Esse ingresso não existe mais na lista.",
};

function traduzir(mensagem: string): string {
  const chave = Object.keys(MENSAGENS).find((c) => mensagem.includes(c));
  return chave ? MENSAGENS[chave] : "Não deu para salvar. Tente de novo.";
}

export function useCredenciamento() {
  const queryClient = useQueryClient();
  const atualizar = () =>
    queryClient.invalidateQueries({ queryKey: CHAVE_PARTICIPANTES });

  const credenciar = useMutation({
    mutationFn: async ({ id, nomeReal }: { id: string; nomeReal?: string | null }) => {
      if (MODO_MOCK) return mock.credenciar(id, nomeReal);

      const { data, error } = await supabase
        .rpc("credenciar", { p_id: id, p_nome_real: nomeReal ?? null })
        .maybeSingle();
      if (error) throw error;
      return data as unknown as Participante;
    },
    // Credenciar é idempotente no banco: repetir não move a hora de entrada,
    // então insistir quando a rede engasga é seguro.
    retry: 3,
    onSuccess: (p) => {
      atualizar();
      toast.success(`${p.nome_exibicao} credenciado`);
    },
    onError: (e: Error) => toast.error(traduzir(e.message)),
  });

  const desfazer = useMutation({
    mutationFn: async (id: string) => {
      if (MODO_MOCK) return mock.desfazer(id);

      const { data, error } = await supabase
        .rpc("desfazer_credenciamento", { p_id: id })
        .maybeSingle();
      if (error) throw error;
      return data as unknown as Participante;
    },
    onSuccess: (p) => {
      atualizar();
      toast.success(`Check-in de ${p.nome_exibicao} desfeito`);
    },
    onError: (e: Error) => toast.error(traduzir(e.message)),
  });

  const identificar = useMutation({
    mutationFn: async ({ id, nomeReal }: { id: string; nomeReal: string | null }) => {
      if (MODO_MOCK) return mock.identificar(id, nomeReal);

      const { data, error } = await supabase
        .rpc("atualizar_nome_real", { p_id: id, p_nome_real: nomeReal })
        .maybeSingle();
      if (error) throw error;
      return data as unknown as Participante;
    },
    onSuccess: (p) => {
      atualizar();
      toast.success(`Agora é ${p.nome_exibicao}`);
    },
    onError: (e: Error) => toast.error(traduzir(e.message)),
  });

  return { credenciar, desfazer, identificar };
}
