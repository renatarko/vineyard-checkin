import { useEffect, useState } from "react";

/** Abaixo disso é a barra de endereço encolhendo, não o teclado. */
const MINIMO_TECLADO = 80;

/**
 * Quantos pixels o teclado virtual cobre da janela.
 *
 * No iOS o teclado não encolhe o layout viewport: um elemento `fixed bottom-0`
 * continua ancorado no fim da página, atrás das teclas. Quem enxerga a área que
 * sobrou é a visualViewport — e é ela que diz o quanto é preciso subir.
 *
 * No Android o `interactive-widget=resizes-content` do index.html já encolhe a
 * janela inteira; lá a conta dá zero e nada é somado duas vezes.
 */
export function useAlturaTeclado(ativo: boolean) {
  const [altura, setAltura] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!ativo || !vv) return;

    const medir = () => {
      // offsetTop entra na conta porque o iOS empurra a visualViewport para
      // cima quando o campo focado cairia embaixo do teclado.
      const coberto = window.innerHeight - vv.height - vv.offsetTop;
      setAltura(coberto > MINIMO_TECLADO ? Math.round(coberto) : 0);
    };

    medir();
    vv.addEventListener("resize", medir);
    vv.addEventListener("scroll", medir);
    return () => {
      vv.removeEventListener("resize", medir);
      vv.removeEventListener("scroll", medir);
      setAltura(0);
    };
  }, [ativo]);

  return altura;
}
