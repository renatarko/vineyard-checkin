import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { MODO_MOCK } from "@/lib/mock-flag";
import { mock } from "@/lib/mock";
import { gerarToken, hashToken, linkDeConvite } from "@/lib/convites";
import type { Convite, Papel } from "@/lib/types";

const CHAVE = ["convites"];

export function useConvites() {
  const queryClient = useQueryClient();

  const lista = useQuery({
    queryKey: CHAVE,
    queryFn: async (): Promise<Convite[]> => {
      if (MODO_MOCK) return mock.listarConvites();

      const { data, error } = await supabase
        .from("convites")
        .select(
          "id, rotulo, papel, email, expira_em, revogado_em, max_usos, usos, " +
            "auth_user_id, resgatado_em, primeiro_user_agent, criado_em",
        )
        .order("criado_em", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Convite[];
    },
  });

  /**
   * Cria o convite e devolve o LINK, uma única vez.
   *
   * O token é sorteado aqui no navegador e só o hash vai para o banco — nem o
   * servidor guarda o valor. Se a tela for fechada sem copiar, não há como
   * recuperar: o caminho é criar outro convite.
   */
  const criar = useMutation({
    mutationFn: async ({
      rotulo,
      papel,
      email,
      horasValidade,
    }: {
      rotulo: string;
      papel: Papel;
      email?: string | null;
      horasValidade: number;
    }) => {
      if (MODO_MOCK) {
        const { id, token } = await mock.criarConvite(rotulo, papel, horasValidade, email);
        return { id, link: linkDeConvite(token) };
      }

      const token = gerarToken();
      const token_hash = await hashToken(token);
      const expira_em = new Date(Date.now() + horasValidade * 3600_000).toISOString();

      const { data, error } = await supabase
        .from("convites")
        .insert({ token_hash, rotulo, papel, email: email || null, expira_em, max_usos: 1 })
        .select("id")
        .single();
      if (error) throw error;

      return { id: data.id as string, link: linkDeConvite(token) };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CHAVE });
    },
    onError: () => toast.error("Não deu para criar o convite."),
  });

  /**
   * Revoga. Passa pela Edge Function porque além de marcar o convite ela
   * derruba o refresh token de quem já estava dentro.
   */
  const revogar = useMutation({
    mutationFn: async (conviteId: string) => {
      if (MODO_MOCK) return mock.revogarConvite(conviteId);

      const { error } = await supabase.functions.invoke("revogar-acesso", {
        body: { convite_id: conviteId },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CHAVE });
      toast.success("Acesso revogado.");
    },
    onError: () => toast.error("Não deu para revogar."),
  });

  return { lista, criar, revogar };
}
