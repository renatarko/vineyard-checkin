import { useEffect, useState } from "react";
import { Check, Loader2, Undo2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useCredenciamento } from "@/hooks/useCredenciamento";
import { nomeExibicao, validarNomeReal } from "@/lib/nomes";
import { rotularTipo } from "@/lib/documento";
import type { Participante } from "@/lib/types";

/**
 * Detalhe do ingresso e ações da portaria.
 *
 * O campo de nome real é o coração da tela: nele se resolve a inscrição
 * coletiva. O nome digitado é ACRESCENTADO ao que veio da planilha, nunca
 * substitui — e o preview mostra exatamente como vai ficar, antes de salvar.
 */
export function SheetParticipante({
  participante,
  aberto,
  onFechar,
}: {
  participante: Participante | null;
  aberto: boolean;
  onFechar: () => void;
}) {
  const { credenciar, desfazer, identificar } = useCredenciamento();
  const [nome, setNome] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    setNome(participante?.nome_real ?? "");
    setErro(null);
  }, [participante]);

  if (participante === null) return null;

  const credenciado = participante.checkin_em !== null;
  const precisaNome = participante.precisa_identificacao && participante.nome_real === null;
  const mudouNome = nome.trim() !== (participante.nome_real ?? "").trim();
  const preview = nomeExibicao(nome, participante.nome_origem);
  const salvando = credenciar.isPending || desfazer.isPending || identificar.isPending;

  /** Valida antes de mandar. `null` quando o campo está vazio de propósito. */
  const nomeParaEnviar = (): string | null | undefined => {
    if (nome.trim() === "") return null;
    const r = validarNomeReal(nome);
    if (!r.ok) {
      setErro(r.erro);
      return undefined;
    }
    return r.nome;
  };

  const aoCredenciar = () => {
    const nomeReal = nomeParaEnviar();
    if (nomeReal === undefined) return;
    credenciar.mutate({ id: participante.id, nomeReal }, { onSuccess: onFechar });
  };

  const aoSalvarNome = () => {
    const nomeReal = nomeParaEnviar();
    if (nomeReal === undefined) return;
    identificar.mutate({ id: participante.id, nomeReal });
  };

  return (
    <Sheet open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <SheetContent
        side="bottom"
        className="max-h-[calc(92dvh_-_var(--teclado,0px))] overflow-y-auto rounded-t-2xl"
      >
        <SheetHeader className="text-left">
          <SheetTitle className="pr-8 text-xl">{participante.nome_exibicao}</SheetTitle>
          <SheetDescription asChild>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
              {participante.fatura && <span>Fatura {participante.fatura}</span>}
              {participante.lote && <span>{participante.lote}</span>}
              <span>{rotularTipo(participante.documento_tipo)}</span>
            </div>
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {participante.comprador_nome &&
            participante.comprador_nome !== participante.nome_origem && (
              <p className="text-sm text-muted-foreground">
                Comprado por {participante.comprador_nome}
              </p>
            )}

          {precisaNome && (
            <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm">
              Inscrição coletiva: a planilha trouxe o nome de quem comprou. Informe quem
              está usando este ingresso.
            </div>
          )}

          {participante.sumido_em !== null && (
            <div className="rounded-lg border bg-muted/50 p-3 text-sm">
              Este ingresso não apareceu na última planilha importada. Confira com a
              bilheteria antes de liberar.
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="nome-real">Nome de quem está usando o ingresso</Label>
            <Input
              id="nome-real"
              value={nome}
              onChange={(e) => {
                setNome(e.target.value);
                setErro(null);
              }}
              placeholder={participante.nome_origem}
              autoComplete="off"
              autoCapitalize="words"
              onFocus={(e) => {
                // O painel já subiu acima do teclado, mas a rolagem interna
                // pode ter ficado no topo. O atraso espera a animação do
                // teclado terminar — antes dela a medida ainda é a antiga.
                const campo = e.currentTarget;
                setTimeout(() => campo.scrollIntoView({ block: "center", behavior: "smooth" }), 350);
              }}
            />
            {erro !== null && <p className="text-sm text-destructive">{erro}</p>}

            {/* O original nunca some: o preview deixa isso explícito antes de salvar. */}
            {nome.trim() !== "" && (
              <p className="text-sm text-muted-foreground">
                Vai aparecer como <span className="font-medium text-foreground">{preview}</span>
              </p>
            )}
          </div>

          {credenciado && (
            <div className="flex items-center gap-2 rounded-lg border bg-success/10 p-3 text-sm">
              <Check className="h-4 w-4 shrink-0 text-success" aria-hidden />
              <span>
                Credenciado às{" "}
                {new Intl.DateTimeFormat("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                }).format(new Date(participante.checkin_em!))}
              </span>
            </div>
          )}
        </div>

        <div className="mt-6 flex flex-col gap-2 pb-2">
          {!credenciado ? (
            <Button size="lg" className="bg-green-600 hover:bg-green-700" onClick={aoCredenciar} disabled={salvando}>
              {salvando ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Check className="mr-2 h-4 w-4" aria-hidden />
              )}
              Credenciar
            </Button>
          ) : (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="lg" disabled={salvando}>
                  <Undo2 className="mr-2 h-4 w-4" aria-hidden />
                  Desfazer check-in
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Desfazer o check-in?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {participante.nome_exibicao} volta para a lista de quem ainda não
                    entrou. O nome informado é mantido.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => desfazer.mutate(participante.id, { onSuccess: onFechar })}
                  >
                    Desfazer
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {/* Dá para identificar sem credenciar: resolve a coletiva na fila,
              antes de a pessoa chegar no balcão. */}
          {mudouNome && (
            <Button variant="outline" onClick={aoSalvarNome} disabled={salvando}>
              Só salvar o nome
            </Button>
          )}
        </div>

        {participante.nome_real !== null && (
          <Badge variant="secondary" className="mb-2 ">
            Nome da planilha: {participante.nome_origem}
          </Badge>
        )}
      </SheetContent>
    </Sheet>
  );
}
