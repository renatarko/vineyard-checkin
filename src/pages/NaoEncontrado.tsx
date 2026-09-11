import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function NaoEncontrado() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background p-4 text-center">
      <p className="text-5xl font-bold text-muted-foreground">404</p>
      <p className="text-muted-foreground">Essa página não existe.</p>
      <Button asChild variant="outline">
        <Link to="/">Ir para o credenciamento</Link>
      </Button>
    </div>
  );
}
