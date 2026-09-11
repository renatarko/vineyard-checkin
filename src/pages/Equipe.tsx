import { useState } from "react";
import { Check, Copy, Link2, Loader2, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useConvites } from "@/hooks/useConvites";
import { descreverEstado, estadoDoConvite } from "@/lib/convites";
import type { Papel } from "@/lib/types";

const VALIDADE_HORAS = 48;

export default function Equipe() {
  const { lista, criar, revogar } = useConvites();
  const [rotulo, setRotulo] = useState("");
  const [email, setEmail] = useState("");
  const [papel, setPapel] = useState<Papel>("operador");
  const [linkNovo, setLinkNovo] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  const copiar = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
      toast.success("Link copiado.");
    } catch {
      toast.error("Copie o link manualmente.");
    }
  };

  const criarConvite = () => {
    const nome = rotulo.trim();
    if (nome === "") {
      toast.error("Dê um nome para saber de quem é o link.");
      return;
    }
    criar.mutate(
      { rotulo: nome, papel, email: email.trim() || null, horasValidade: VALIDADE_HORAS },
      {
        onSuccess: ({ link }) => {
          setLinkNovo(link);
          setCopiado(false);
          setRotulo("");
          setEmail("");
        },
      },
    );
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <section className="space-y-3">
          <div>
            <h1 className="text-lg font-semibold">Equipe</h1>
            <p className="text-sm text-muted-foreground">
              Cada pessoa recebe um link próprio, que vale uma vez e por{" "}
              {VALIDADE_HORAS} horas. Quem abre o link entra — mande por conversa privada.
            </p>
          </div>

          <div className="space-y-3 rounded-xl border bg-card p-4">
            <div className="space-y-2">
              <Label htmlFor="rotulo">De quem é este link?</Label>
              <Input
                id="rotulo"
                value={rotulo}
                onChange={(e) => setRotulo(e.target.value)}
                placeholder="Bia — portaria"
                autoComplete="off"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">E-mail (opcional)</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="bia@exemplo.com"
                autoComplete="off"
              />
              {/* Nada é enviado para este endereço: quem entrega o link é você.
                  Ele serve para a conta ficar identificável no painel do
                  Supabase em vez de virar um endereço inventado. */}
              <p className="text-xs text-muted-foreground">
                Não enviamos nada — serve só para identificar a conta.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Pode fazer o quê?</Label>
              <div className="flex gap-2">
                {(["operador", "admin"] as const).map((p) => (
                  <Button
                    key={p}
                    type="button"
                    variant={papel === p ? "default" : "outline"}
                    className="flex-1"
                    onClick={() => setPapel(p)}
                  >
                    {p === "operador" ? "Só credenciar" : "Tudo"}
                  </Button>
                ))}
              </div>
            </div>

            <Button className="w-full" onClick={criarConvite} disabled={criar.isPending}>
              {criar.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Link2 className="mr-2 h-4 w-4" aria-hidden />
              )}
              Gerar link
            </Button>
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">Links criados</h2>

          {lista.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }, (_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          ) : (lista.data ?? []).length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhum link criado ainda.
            </p>
          ) : (
            <ul className="space-y-2">
              {(lista.data ?? []).map((c) => {
                const estado = estadoDoConvite(c);
                return (
                  <li
                    key={c.id}
                    className="flex items-center gap-3 rounded-xl border bg-card p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{c.rotulo}</p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant={estado === "revogado" ? "outline" : "secondary"}>
                          {descreverEstado(estado)}
                        </Badge>
                        <span>{c.papel === "admin" ? "Tudo" : "Só credenciar"}</span>
                        {c.email && <span className="truncate">{c.email}</span>}
                      </div>
                    </div>

                    {c.revogado_em === null && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label="Revogar acesso">
                            <ShieldOff className="h-4 w-4" aria-hidden />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Revogar o acesso de {c.rotulo}?</AlertDialogTitle>
                            <AlertDialogDescription>
                              O link para de funcionar e, se essa pessoa já estiver com o
                              sistema aberto, ela perde o acesso na próxima ação. Os
                              check-ins que ela já fez continuam valendo.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => revogar.mutate(c.id)}>
                              Revogar
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {/* O link aparece UMA vez: só o hash é guardado, nem o servidor sabe o
          valor. Fechar sem copiar significa gerar outro convite. */}
      <Dialog open={linkNovo !== null} onOpenChange={(v) => !v && setLinkNovo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copie o link agora</DialogTitle>
            <DialogDescription>
              Ele aparece uma única vez. Se fechar sem copiar, é só gerar outro.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="rounded-lg border bg-muted/50 p-3">
              <p className="break-all font-mono text-xs">{linkNovo}</p>
            </div>

            <Button className="w-full" onClick={() => linkNovo && copiar(linkNovo)}>
              {copiado ? (
                <Check className="mr-2 h-4 w-4" aria-hidden />
              ) : (
                <Copy className="mr-2 h-4 w-4" aria-hidden />
              )}
              {copiado ? "Copiado" : "Copiar link"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
