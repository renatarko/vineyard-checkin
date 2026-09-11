import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  aplicarTema,
  outroTema,
  salvarTema,
  temaAtual,
  type Tema,
} from "@/lib/tema";

/**
 * Alterna entre claro e escuro.
 *
 * O estado inicial vem do DOM, não do localStorage: o script no `index.html`
 * já resolveu o tema antes do React montar, para a tela não piscar clara
 * antes de escurecer. Ler daqui de novo poderia divergir do que está na tela.
 */
export function BotaoTema() {
  const [tema, setTema] = useState<Tema>(() => temaAtual());

  // Mantém em dia se outra aba trocar o tema no mesmo navegador.
  useEffect(() => {
    const aoMudar = () => setTema(temaAtual());
    window.addEventListener("storage", aoMudar);
    return () => window.removeEventListener("storage", aoMudar);
  }, []);

  const alternar = () => {
    const novo = outroTema(tema);
    aplicarTema(novo);
    salvarTema(novo);
    setTema(novo);
  };

  const Icone = tema === "escuro" ? Sun : Moon;

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={alternar}
      aria-label={`Mudar para o tema ${outroTema(tema)}`}
      title={`Tema ${tema}`}
    >
      <Icone className="h-4 w-4" aria-hidden />
    </Button>
  );
}
