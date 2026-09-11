import { ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/lib/auth-context";

/**
 * Sessão sem perfil ativo.
 *
 * Cai aqui quem nunca teve acesso e também quem teve o acesso revogado — a
 * sessão continua válida no Auth, mas `perfis.ativo` é o que manda.
 */
export default function SemAcesso() {
  const { sessao, sair } = useAuth();

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <ShieldOff className="h-6 w-6 text-muted-foreground" aria-hidden />
          </div>
          <CardTitle>Sem acesso</CardTitle>
          <CardDescription>
            Este aparelho não está autorizado a credenciar. Peça um link de convite para
            quem organiza o evento.
          </CardDescription>
        </CardHeader>
        {sessao !== null && (
          <CardContent>
            <Button variant="outline" className="w-full" onClick={sair}>
              Sair desta conta
            </Button>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
