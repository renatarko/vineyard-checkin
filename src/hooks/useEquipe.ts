import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { MODO_MOCK } from "@/lib/mock-flag";
import { mock } from "@/lib/mock";
import { useAuth } from "@/lib/auth-context";
import type { Papel, Perfil } from "@/lib/types";

const CHAVE = ["equipe"];

const MENSAGENS: Record<string, string> = {
  SEM_PERMISSAO: "Só quem administra pode fazer isso.",
  EMAIL_INVALIDO: "E-mail inválido.",
  NOME_OBRIGATORIO: "Informe o nome.",
  PAPEL_INVALIDO: "Papel inválido.",
  PERFIL_INEXISTENTE: "Essa pessoa não está mais na equipe.",
  NAO_PODE_DESATIVAR_A_SI_MESMO: "Você não pode remover o seu próprio acesso.",
  NAO_PODE_REBAIXAR_A_SI_MESMO: "Você não pode tirar o seu próprio acesso de administrador.",
};

function traduzir(mensagem: string, padrao: string): string {
  const chave = Object.keys(MENSAGENS).find((c) => mensagem.includes(c));
  return chave ? MENSAGENS[chave] : padrao;
}

/**
 * A equipe é a lista de quem pode entrar.
 *
 * Quem não está aqui, ativo, não recebe código no /login — a checagem mora na
 * Edge Function `enviar-codigo`, que consulta esta mesma tabela.
 */
export function useEquipe() {
  const queryClient = useQueryClient();
  const { perfil } = useAuth();
  const atualizar = () => queryClient.invalidateQueries({ queryKey: CHAVE });

  const lista = useQuery({
    queryKey: CHAVE,
    queryFn: async (): Promise<Perfil[]> => {
      if (MODO_MOCK) return mock.listarEquipe();

      const { data, error } = await supabase
        .from("perfis")
        .select("user_id, nome, email, papel, ativo")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as Perfil[];
    },
  });

  const cadastrar = useMutation({
    mutationFn: async (dados: { nome: string; email: string; papel: Papel }) => {
      if (MODO_MOCK) return mock.cadastrarMembro(dados);

      const { data, error } = await supabase.functions.invoke("cadastrar-membro", {
        body: dados,
      });
      // A Edge Function devolve o motivo no corpo; o SDK só entrega "non-2xx".
      if (error) throw new Error(data?.erro ?? error.message);
      return data as { perfil: Perfil; avisado: boolean };
    },
    onSuccess: (r) => {
      atualizar();
      toast.success(
        r.avisado
          ? "Cadastrado. Um e-mail de aviso foi enviado."
          : "Cadastrado. O e-mail de aviso não saiu, mas a pessoa já consegue entrar.",
      );
    },
    onError: (e: Error) => toast.error(traduzir(e.message, "Não deu para cadastrar.")),
  });

  const definirPapel = useMutation({
    mutationFn: async ({ userId, papel }: { userId: string; papel: Papel }) => {
      if (MODO_MOCK) return mock.definirPapel(userId, papel);

      const { data, error } = await supabase
        .rpc("definir_papel", { p_user_id: userId, p_papel: papel })
        .maybeSingle();
      if (error) throw error;
      return data as unknown as Perfil;
    },
    onSuccess: (p) => {
      atualizar();
      toast.success(
        `${p.nome} agora ${p.papel === "admin" ? "administra o evento" : "só credencia"}.`,
      );
    },
    onError: (e: Error) => toast.error(traduzir(e.message, "Não deu para mudar o papel.")),
  });

  const definirAtivo = useMutation({
    mutationFn: async ({ userId, ativo }: { userId: string; ativo: boolean }) => {
      if (MODO_MOCK) return mock.definirAtivo(userId, ativo);

      const { data, error } = await supabase
        .rpc("definir_ativo", { p_user_id: userId, p_ativo: ativo })
        .maybeSingle();
      if (error) throw error;
      return data as unknown as Perfil;
    },
    onSuccess: (p) => {
      atualizar();
      toast.success(p.ativo ? `${p.nome} voltou para a equipe.` : `${p.nome} perdeu o acesso.`);
    },
    onError: (e: Error) => toast.error(traduzir(e.message, "Não deu para mudar o acesso.")),
  });

  return {
    lista,
    cadastrar,
    definirPapel,
    definirAtivo,
    /** Para a tela não oferecer ações que a RPC vai recusar. */
    meuUserId: perfil?.user_id ?? null,
  };
}
