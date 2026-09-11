export type Papel = "admin" | "operador";

/** Uma linha de `public.participantes`, como o front a consome. */
export interface Participante {
  id: string;
  nome_origem: string;
  nome_real: string | null;
  nome_exibicao: string;
  /** HMAC do documento. O front não sabe calcular — serve só de identificador. */
  documento_hash: string;
  documento_tipo: "cpf" | "cnpj" | null;
  email: string | null;
  comprador_nome: string | null;
  fatura: string | null;
  fatura_norm: string;
  lote: string | null;
  precisa_identificacao: boolean;
  sumido_em: string | null;
  checkin_em: string | null;
  checkin_por: string | null;
  nome_real_em: string | null;
  nome_real_por: string | null;
}

export interface Perfil {
  user_id: string;
  nome: string;
  /** É por ele que a pessoa entra em /login. Nulo em perfis antigos, de convite sem e-mail. */
  email: string | null;
  papel: Papel;
  ativo: boolean;
}

export interface Convite {
  id: string;
  rotulo: string;
  /** E-mail real de quem foi convidado. Nulo cai no endereço sintético. */
  email: string | null;
  papel: Papel;
  expira_em: string;
  revogado_em: string | null;
  max_usos: number;
  usos: number;
  auth_user_id: string | null;
  resgatado_em: string | null;
  primeiro_user_agent: string | null;
  criado_em: string;
}

/** Resumo devolvido por `importar_participantes`, em preview e em gravação. */
export interface ResumoImportacao {
  confirmado: boolean;
  linhas_total: number;
  ignoradas: number;
  novos: number;
  atualizados: number;
  inalterados: number;
  sumidos: number;
  coletivas: number;
  sumidos_credenciados: { nome: string; fatura: string; checkin_em: string }[];
  amostra_novos: { nome: string; fatura: string | null; lote: string | null; coletiva: boolean }[];
  amostra_sumidos: { nome: string; fatura: string; credenciado: boolean }[];
}
