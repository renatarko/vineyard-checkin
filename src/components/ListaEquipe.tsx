import { MoreVertical, ShieldCheck, UserRoundX, UserRoundCheck } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Papel, Perfil } from "@/lib/types";

/**
 * Quem pode entrar no sistema.
 *
 * Desativar aqui é o corte real de acesso: a RLS lê `perfis.ativo` a cada
 * consulta, então a pessoa perde tudo na query seguinte, mesmo com o aparelho
 * dela ainda aberto.
 */
export function ListaEquipe({
  equipe,
  meuUserId,
  ocupado,
  onDefinirPapel,
  onDefinirAtivo,
}: {
  equipe: Perfil[];
  meuUserId: string | null;
  ocupado: boolean;
  onDefinirPapel: (userId: string, papel: Papel) => void;
  onDefinirAtivo: (userId: string, ativo: boolean) => void;
}) {
  if (equipe.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Ninguém cadastrado ainda.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {equipe.map((p) => {
        const souEu = p.user_id === meuUserId;
        const ehAdmin = p.papel === "admin";

        return (
          <li
            key={p.user_id}
            className={cn(
              "flex items-center gap-3 rounded-xl border bg-card p-3",
              !p.ativo && "opacity-60",
            )}
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">
                {p.nome}
                {souEu && <span className="ml-2 text-xs text-muted-foreground">(você)</span>}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {p.email ?? "sem e-mail — só entra por link de convite"}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <Badge variant={ehAdmin ? "default" : "secondary"} className="gap-1">
                  {ehAdmin && <ShieldCheck className="h-3 w-3" aria-hidden />}
                  {ehAdmin ? "Administra" : "Só credencia"}
                </Badge>
                {!p.ativo && <Badge variant="outline">Sem acesso</Badge>}
              </div>
            </div>

            {/* Um admin não pode se rebaixar nem se desativar: num evento com
                um admin só, isso o trancaria para fora e a saída seria o SQL
                Editor. A RPC recusa de qualquer jeito; aqui só não oferecemos. */}
            {!souEu && (
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={ocupado}
                  aria-label={
                    ehAdmin
                      ? `Tornar ${p.nome} apenas operador`
                      : `Tornar ${p.nome} administrador`
                  }
                  title={ehAdmin ? "Tornar operador" : "Tornar administrador"}
                  onClick={() => onDefinirPapel(p.user_id, ehAdmin ? "operador" : "admin")}
                >
                  {ehAdmin ? (
                    <MoreVertical className="h-4 w-4" aria-hidden />
                  ) : (
                    <ShieldCheck className="h-4 w-4" aria-hidden />
                  )}
                </Button>

                {p.ativo ? (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={ocupado}
                        aria-label={`Remover acesso de ${p.nome}`}
                      >
                        <UserRoundX className="h-4 w-4" aria-hidden />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remover o acesso de {p.nome}?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Ela perde o acesso na próxima ação, mesmo com o sistema aberto, e
                          deixa de receber código no login. Os check-ins que já fez continuam
                          valendo. Dá para devolver o acesso depois.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => onDefinirAtivo(p.user_id, false)}>
                          Remover acesso
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={ocupado}
                    aria-label={`Devolver acesso a ${p.nome}`}
                    title="Devolver acesso"
                    onClick={() => onDefinirAtivo(p.user_id, true)}
                  >
                    <UserRoundCheck className="h-4 w-4" aria-hidden />
                  </Button>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
