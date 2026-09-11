/**
 * Liga o modo de demonstração: as telas rodam com dados falsos, em memória,
 * sem Supabase nenhum. Serve para trabalhar no layout sem subir banco.
 *
 * Ligue com `VITE_MOCK=true` no `.env.local` (ou `npm run dev:mock`).
 *
 * Fica num arquivo só para o client do Supabase poder consultar a flag sem
 * arrastar os dados de demonstração para dentro do bundle de produção.
 */
export const MODO_MOCK = import.meta.env.VITE_MOCK === "true";
