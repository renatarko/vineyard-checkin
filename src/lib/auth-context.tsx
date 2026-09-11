import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Perfil } from "@/lib/types";

interface Auth {
  sessao: Session | null;
  perfil: Perfil | null;
  carregando: boolean;
  ehAdmin: boolean;
  /** Tem sessão E perfil ativo. Sessão sozinha não dá acesso a nada. */
  ehEquipe: boolean;
  sair: () => Promise<void>;
}

const Contexto = createContext<Auth | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [sessao, setSessao] = useState<Session | null>(null);
  const [sessaoCarregada, setSessaoCarregada] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSessao(data.session);
      setSessaoCarregada(true);
    });

    const { data: inscricao } = supabase.auth.onAuthStateChange((_evento, nova) => {
      setSessao(nova);
      // Trocou de usuário: o cache da sessão anterior não vale mais.
      queryClient.invalidateQueries();
    });

    return () => inscricao.subscription.unsubscribe();
  }, [queryClient]);

  const { data: perfil, isLoading: carregandoPerfil } = useQuery({
    queryKey: ["perfil", sessao?.user.id],
    enabled: sessao !== null,
    // O perfil é o que a RLS consulta. Revogar acesso apaga `ativo`, e uma
    // aba aberta precisa perceber isso sem depender de recarregar a página.
    refetchInterval: 60_000,
    queryFn: async (): Promise<Perfil | null> => {
      const { data, error } = await supabase
        .from("perfis")
        .select("user_id, nome, papel, ativo")
        .eq("user_id", sessao!.user.id)
        .maybeSingle();
      if (error) throw error;
      return (data as Perfil | null) ?? null;
    },
  });

  const sair = async () => {
    await supabase.auth.signOut();
    queryClient.clear();
  };

  const ativo = perfil?.ativo === true;

  return (
    <Contexto.Provider
      value={{
        sessao,
        perfil: perfil ?? null,
        carregando: !sessaoCarregada || (sessao !== null && carregandoPerfil),
        ehAdmin: ativo && perfil?.papel === "admin",
        ehEquipe: ativo,
        sair,
      }}
    >
      {children}
    </Contexto.Provider>
  );
}

export function useAuth(): Auth {
  const ctx = useContext(Contexto);
  if (ctx === undefined) throw new Error("useAuth precisa estar dentro de AuthProvider");
  return ctx;
}
