import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { Skeleton } from "@/components/ui/skeleton";
import Convite from "@/pages/Convite";
import Credenciamento from "@/pages/Credenciamento";
import Importar from "@/pages/Importar";
import Equipe from "@/pages/Equipe";
import Login from "@/pages/Login";
import SemAcesso from "@/pages/SemAcesso";
import NaoEncontrado from "@/pages/NaoEncontrado";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: 2 },
    // Credenciar é idempotente no banco, então insistir é seguro — e é o que
    // salva a fila quando o wi-fi do salão oscila.
    mutations: { retry: 3 },
  },
});

function Carregando() {
  return (
    <div className="mx-auto max-w-lg space-y-3 p-6">
      <Skeleton className="h-10 w-2/3" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

/**
 * Guards de rota.
 *
 * São só navegação — quem barra de verdade é a RLS, que consulta `perfis` a
 * cada query. Uma pessoa revogada que forçar a URL vê a tela, mas a tela vem
 * vazia.
 */
function RotaDaEquipe({ children }: { children: ReactNode }) {
  const { ehEquipe, carregando } = useAuth();
  if (carregando) return <Carregando />;
  // `ehEquipe` exige perfil ativo, e perfil só existe com sessão — checar a
  // sessão à parte era redundante, e barrava o modo de demonstração, que tem
  // perfil sem sessão de verdade.
  if (!ehEquipe) return <Navigate to="/sem-acesso" replace />;
  return <>{children}</>;
}

function RotaDeAdmin({ children }: { children: ReactNode }) {
  const { ehAdmin, carregando } = useAuth();
  if (carregando) return <Carregando />;
  if (!ehAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/convite/:token" element={<Convite />} />
          <Route path="/login" element={<Login />} />
          <Route path="/sem-acesso" element={<SemAcesso />} />
          <Route
            path="/"
            element={
              <RotaDaEquipe>
                <Credenciamento />
              </RotaDaEquipe>
            }
          />
          <Route
            path="/importar"
            element={
              <RotaDaEquipe>
                <RotaDeAdmin>
                  <Importar />
                </RotaDeAdmin>
              </RotaDaEquipe>
            }
          />
          <Route
            path="/equipe"
            element={
              <RotaDaEquipe>
                <RotaDeAdmin>
                  <Equipe />
                </RotaDeAdmin>
              </RotaDaEquipe>
            }
          />
          <Route path="*" element={<NaoEncontrado />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
    <Toaster />
  </QueryClientProvider>
);

export default App;
