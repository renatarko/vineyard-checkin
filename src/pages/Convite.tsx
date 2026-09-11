import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { KeyRound, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Resgate do convite.
 *
 * O resgate acontece SÓ no clique do botão, nunca ao carregar a página. Isso
 * não é detalhe: o link vai por WhatsApp, e o crawler de preview do WhatsApp
 * faz um GET na URL assim que a mensagem é enviada. Com um convite de uso
 * único, um resgate automático queimaria o acesso antes de a pessoa abrir.
 * Crawler não aperta botão.
 */
export default function Convite() {
  const { token = "" } = useParams();
  const navegar = useNavigate();
  const [entrando, setEntrando] = useState(false);
  const [falhou, setFalhou] = useState(false);

  const { data: convite, isLoading } = useQuery({
    queryKey: ["convite", token],
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc("validar_convite", { p_token: token })
        .maybeSingle();
      if (error) throw error;
      return data as { rotulo: string; papel: string } | null;
    },
  });

  // Se já houver sessão, não faz sentido ficar nesta tela.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session !== null && !entrando) navegar("/", { replace: true });
    });
  }, [navegar, entrando]);

  const entrar = async () => {
    setEntrando(true);
    setFalhou(false);
    try {
      const { data, error } = await supabase.functions.invoke("resgatar-convite", {
        body: { token },
      });
      if (error || !data?.access_token) throw new Error("falhou");

      await supabase.auth.setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      });

      // replace para o token sair do histórico e do Referer.
      navegar("/", { replace: true });
    } catch {
      setFalhou(true);
      setEntrando(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <KeyRound className="h-6 w-6 text-primary" aria-hidden />
          </div>
          <CardTitle className="text-xl">Credenciamento Vineyard</CardTitle>
          <CardDescription>
            {isLoading
              ? "Conferindo o convite…"
              : convite
                ? "Você foi convidado para a equipe."
                : "Este link não vale mais."}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden />
            </div>
          ) : convite ? (
            <>
              <div className="rounded-lg border bg-muted/40 p-4 text-center">
                <p className="text-lg font-semibold">{convite.rotulo}</p>
                <p className="text-sm text-muted-foreground">
                  {convite.papel === "admin" ? "Administrador" : "Operador"}
                </p>
              </div>

              <Button className="w-full" size="lg" onClick={entrar} disabled={entrando}>
                {entrando ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                    Entrando…
                  </>
                ) : (
                  "Entrar"
                )}
              </Button>

              {falhou && (
                <p className="text-center text-sm text-destructive">
                  Não deu para entrar. Se o link já foi usado, peça um novo.
                </p>
              )}

              <p className="text-center text-xs text-muted-foreground">
                Este link vale uma vez só. Depois de entrar, este aparelho fica conectado.
              </p>
            </>
          ) : (
            // Mesma mensagem para inválido, expirado, revogado e já usado: a
            // tela não pode servir de oráculo sobre quais tokens existem.
            <p className="text-center text-sm text-muted-foreground">
              O link pode ter expirado, já ter sido usado ou ter sido cancelado. Peça um
              convite novo para quem organiza o evento.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
