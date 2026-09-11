import { Link, useLocation } from "react-router-dom";
import { LogOut, ScanLine, Upload, Users } from "lucide-react";
import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FaixaMock } from "@/components/FaixaMock";

const ABAS = [
  { para: "/", rotulo: "Credenciar", Icone: ScanLine, soAdmin: false },
  { para: "/importar", rotulo: "Importar", Icone: Upload, soAdmin: true },
  { para: "/equipe", rotulo: "Equipe", Icone: Users, soAdmin: true },
];

export function AppLayout({ children }: { children: ReactNode }) {
  const { perfil, ehAdmin, sair } = useAuth();
  const { pathname } = useLocation();

  const abas = ABAS.filter((a) => !a.soAdmin || ehAdmin);

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <FaixaMock />
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-2 px-4">
          <span className="truncate text-sm font-semibold">Vineyard Check-in</span>
          <div className="flex items-center gap-2">
            <span className="hidden truncate text-sm text-muted-foreground sm:inline">
              {perfil?.nome}
            </span>
            <Button variant="ghost" size="icon" onClick={sair} aria-label="Sair">
              <LogOut className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        </div>

        {abas.length > 1 && (
          <nav className="mx-auto flex max-w-3xl gap-1 px-2 pb-2">
            {abas.map(({ para, rotulo, Icone }) => (
              <Link
                key={para}
                to={para}
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  pathname === para
                    ? "bg-secondary text-secondary-foreground"
                    : "text-muted-foreground hover:bg-secondary/60",
                )}
              >
                <Icone className="h-4 w-4" aria-hidden />
                {rotulo}
              </Link>
            ))}
          </nav>
        )}
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-4">{children}</main>
    </div>
  );
}
