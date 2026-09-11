import { createClient } from "@supabase/supabase-js";
import { MODO_MOCK } from "@/lib/mock-flag";

const url = import.meta.env.VITE_SUPABASE_URL;
const chave = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// No modo de demonstração ninguém chama o Supabase: os hooks desviam antes.
// O client existe só para os imports continuarem resolvendo.
if (!MODO_MOCK && (!url || !chave)) {
  throw new Error(
    "VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY são obrigatórias. " +
      "Copie .env.example para .env.local — ou use VITE_MOCK=true para ver as telas sem banco.",
  );
}

export const supabase = createClient(
  url ?? "http://localhost:54321",
  chave ?? "modo-mock-sem-chave",
  {
    auth: {
      storage: localStorage,
      persistSession: true,
      autoRefreshToken: true,
    },
  },
);
