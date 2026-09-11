import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, KeyRound, Loader2, MailCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const TAMANHO_CODIGO = 6;

/**
 * Reentrada por código, para quem administra.
 *
 * O caminho normal de acesso é o link de convite. Esta tela existe para uma
 * única situação: o admin saiu e o convite dele já foi consumido — sem ela, a
 * saída seria inserir outro convite à mão no SQL Editor.
 *
 * Operador não usa esta porta: pede um link novo a quem administra.
 */
export default function Login() {
  const navegar = useNavigate();
  const [etapa, setEtapa] = useState<"email" | "codigo">("email");
  const [email, setEmail] = useState("");
  const [codigo, setCodigo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const pedirCodigo = async () => {
    const alvo = email.trim().toLowerCase();
    if (!alvo.includes("@")) {
      setErro("Digite um e-mail válido.");
      return;
    }

    setOcupado(true);
    setErro(null);
    try {
      await supabase.functions.invoke("enviar-codigo", { body: { email: alvo } });
      // Segue para a etapa do código mesmo que o e-mail não tenha acesso: a
      // tela não pode servir para descobrir quem é admin.
      setEtapa("codigo");
    } catch {
      setErro("Não deu para enviar agora. Tente de novo em instantes.");
    } finally {
      setOcupado(false);
    }
  };

  const entrar = async () => {
    const token = codigo.replace(/\D/g, "");
    if (token.length !== TAMANHO_CODIGO) {
      setErro(`O código tem ${TAMANHO_CODIGO} dígitos.`);
      return;
    }

    setOcupado(true);
    setErro(null);
    const { data, error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token,
      type: "email",
    });

    if (error || !data?.session) {
      setErro("Código inválido ou expirado.");
      setOcupado(false);
      return;
    }

    navegar("/", { replace: true });
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            {etapa === "email" ? (
              <KeyRound className="h-6 w-6 text-primary" aria-hidden />
            ) : (
              <MailCheck className="h-6 w-6 text-primary" aria-hidden />
            )}
          </div>
          <CardTitle className="text-xl">Entrar</CardTitle>
          <CardDescription>
            {etapa === "email"
              ? "Para quem administra o credenciamento. Enviamos um código para o seu e-mail."
              : `Digite o código de ${TAMANHO_CODIGO} dígitos que chegou em ${email}.`}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {etapa === "email" ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setErro(null);
                  }}
                  onKeyDown={(e) => e.key === "Enter" && pedirCodigo()}
                  placeholder="voce@exemplo.com"
                />
              </div>

              <Button className="w-full" size="lg" onClick={pedirCodigo} disabled={ocupado}>
                {ocupado && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
                Enviar código
              </Button>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="codigo">Código</Label>
                <Input
                  id="codigo"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={TAMANHO_CODIGO}
                  value={codigo}
                  onChange={(e) => {
                    setCodigo(e.target.value.replace(/\D/g, ""));
                    setErro(null);
                  }}
                  onKeyDown={(e) => e.key === "Enter" && entrar()}
                  placeholder="000000"
                  className="text-center text-2xl tracking-[0.4em]"
                  autoFocus
                />
              </div>

              <Button className="w-full" size="lg" onClick={entrar} disabled={ocupado}>
                {ocupado && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
                Entrar
              </Button>

              <Button
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setEtapa("email");
                  setCodigo("");
                  setErro(null);
                }}
              >
                <ArrowLeft className="mr-2 h-4 w-4" aria-hidden />
                Usar outro e-mail
              </Button>
            </>
          )}

          {erro !== null && <p className="text-center text-sm text-destructive">{erro}</p>}

          <p className="text-center text-xs text-muted-foreground">
            É da equipe de portaria? Peça um link de convite a quem organiza o evento.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
