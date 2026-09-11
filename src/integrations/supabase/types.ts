export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      checkin_eventos: {
        Row: {
          acao: string
          ator: string | null
          em: string
          id: number
          nome_real: string | null
          participante_id: string
        }
        Insert: {
          acao: string
          ator?: string | null
          em?: string
          id?: number
          nome_real?: string | null
          participante_id: string
        }
        Update: {
          acao?: string
          ator?: string | null
          em?: string
          id?: number
          nome_real?: string | null
          participante_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkin_eventos_participante_id_fkey"
            columns: ["participante_id"]
            isOneToOne: false
            referencedRelation: "participantes"
            referencedColumns: ["id"]
          },
        ]
      }
      configuracao: {
        Row: {
          atualizado_em: string
          checkin_aberto: boolean
          evento_nome: string
          id: boolean
        }
        Insert: {
          atualizado_em?: string
          checkin_aberto?: boolean
          evento_nome?: string
          id?: boolean
        }
        Update: {
          atualizado_em?: string
          checkin_aberto?: boolean
          evento_nome?: string
          id?: boolean
        }
        Relationships: []
      }
      convites: {
        Row: {
          auth_user_id: string | null
          criado_em: string
          criado_por: string | null
          email: string | null
          expira_em: string
          id: string
          max_usos: number
          papel: string
          primeiro_ip: string | null
          primeiro_user_agent: string | null
          resgatado_em: string | null
          revogado_em: string | null
          rotulo: string
          token_hash: string
          usos: number
        }
        Insert: {
          auth_user_id?: string | null
          criado_em?: string
          criado_por?: string | null
          email?: string | null
          expira_em?: string
          id?: string
          max_usos?: number
          papel: string
          primeiro_ip?: string | null
          primeiro_user_agent?: string | null
          resgatado_em?: string | null
          revogado_em?: string | null
          rotulo: string
          token_hash: string
          usos?: number
        }
        Update: {
          auth_user_id?: string | null
          criado_em?: string
          criado_por?: string | null
          email?: string | null
          expira_em?: string
          id?: string
          max_usos?: number
          papel?: string
          primeiro_ip?: string | null
          primeiro_user_agent?: string | null
          resgatado_em?: string | null
          revogado_em?: string | null
          rotulo?: string
          token_hash?: string
          usos?: number
        }
        Relationships: []
      }
      importacoes: {
        Row: {
          arquivo_nome: string | null
          atualizados: number | null
          criado_em: string
          criado_por: string | null
          id: string
          inalterados: number | null
          linhas_total: number | null
          novos: number | null
          sumidos: number | null
        }
        Insert: {
          arquivo_nome?: string | null
          atualizados?: number | null
          criado_em?: string
          criado_por?: string | null
          id?: string
          inalterados?: number | null
          linhas_total?: number | null
          novos?: number | null
          sumidos?: number | null
        }
        Update: {
          arquivo_nome?: string | null
          atualizados?: number | null
          criado_em?: string
          criado_por?: string | null
          id?: string
          inalterados?: number | null
          linhas_total?: number | null
          novos?: number | null
          sumidos?: number | null
        }
        Relationships: []
      }
      participantes: {
        Row: {
          assinatura: string
          atualizado_em: string
          checkin_em: string | null
          checkin_por: string | null
          comprador_nome: string | null
          criado_em: string
          documento_hash: string
          documento_tipo: string | null
          email: string | null
          fatura: string | null
          fatura_norm: string
          id: string
          linha_csv: number | null
          lote: string | null
          nome_exibicao: string | null
          nome_origem: string
          nome_real: string | null
          nome_real_em: string | null
          nome_real_por: string | null
          ocorrencia: number
          precisa_identificacao: boolean
          sumido_em: string | null
        }
        Insert: {
          assinatura: string
          atualizado_em?: string
          checkin_em?: string | null
          checkin_por?: string | null
          comprador_nome?: string | null
          criado_em?: string
          documento_hash?: string
          documento_tipo?: string | null
          email?: string | null
          fatura?: string | null
          fatura_norm: string
          id?: string
          linha_csv?: number | null
          lote?: string | null
          nome_exibicao?: string | null
          nome_origem: string
          nome_real?: string | null
          nome_real_em?: string | null
          nome_real_por?: string | null
          ocorrencia: number
          precisa_identificacao?: boolean
          sumido_em?: string | null
        }
        Update: {
          assinatura?: string
          atualizado_em?: string
          checkin_em?: string | null
          checkin_por?: string | null
          comprador_nome?: string | null
          criado_em?: string
          documento_hash?: string
          documento_tipo?: string | null
          email?: string | null
          fatura?: string | null
          fatura_norm?: string
          id?: string
          linha_csv?: number | null
          lote?: string | null
          nome_exibicao?: string | null
          nome_origem?: string
          nome_real?: string | null
          nome_real_em?: string | null
          nome_real_por?: string | null
          ocorrencia?: number
          precisa_identificacao?: boolean
          sumido_em?: string | null
        }
        Relationships: []
      }
      participantes_documento: {
        Row: {
          cifrado: string
          criado_em: string
          participante_id: string
        }
        Insert: {
          cifrado: string
          criado_em?: string
          participante_id: string
        }
        Update: {
          cifrado?: string
          criado_em?: string
          participante_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "participantes_documento_participante_id_fkey"
            columns: ["participante_id"]
            isOneToOne: true
            referencedRelation: "participantes"
            referencedColumns: ["id"]
          },
        ]
      }
      perfis: {
        Row: {
          ativo: boolean
          criado_em: string
          nome: string
          papel: string
          user_id: string
        }
        Insert: {
          ativo?: boolean
          criado_em?: string
          nome: string
          papel: string
          user_id: string
        }
        Update: {
          ativo?: boolean
          criado_em?: string
          nome?: string
          papel?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      atualizar_nome_real: {
        Args: { p_id: string; p_nome_real: string }
        Returns: {
          assinatura: string
          atualizado_em: string
          checkin_em: string | null
          checkin_por: string | null
          comprador_nome: string | null
          criado_em: string
          documento_hash: string
          documento_tipo: string | null
          email: string | null
          fatura: string | null
          fatura_norm: string
          id: string
          linha_csv: number | null
          lote: string | null
          nome_exibicao: string | null
          nome_origem: string
          nome_real: string | null
          nome_real_em: string | null
          nome_real_por: string | null
          ocorrencia: number
          precisa_identificacao: boolean
          sumido_em: string | null
        }
        SetofOptions: {
          from: "*"
          to: "participantes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      buscar_por_documento: { Args: { p_texto: string }; Returns: string[] }
      chave_documento: { Args: never; Returns: string }
      cifrar_documento: { Args: { p_documento: string }; Returns: string }
      consumir_convite: {
        Args: { p_ip: string; p_token: string; p_user_agent: string }
        Returns: {
          auth_user_id: string
          convite_id: string
          email: string
          papel: string
          rotulo: string
        }[]
      }
      credenciar: {
        Args: { p_id: string; p_nome_real?: string }
        Returns: {
          assinatura: string
          atualizado_em: string
          checkin_em: string | null
          checkin_por: string | null
          comprador_nome: string | null
          criado_em: string
          documento_hash: string
          documento_tipo: string | null
          email: string | null
          fatura: string | null
          fatura_norm: string
          id: string
          linha_csv: number | null
          lote: string | null
          nome_exibicao: string | null
          nome_origem: string
          nome_real: string | null
          nome_real_em: string | null
          nome_real_por: string | null
          ocorrencia: number
          precisa_identificacao: boolean
          sumido_em: string | null
        }
        SetofOptions: {
          from: "*"
          to: "participantes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      decifrar_documento: {
        Args: { p_participante_id: string }
        Returns: string
      }
      desfazer_credenciamento: {
        Args: { p_id: string }
        Returns: {
          assinatura: string
          atualizado_em: string
          checkin_em: string | null
          checkin_por: string | null
          comprador_nome: string | null
          criado_em: string
          documento_hash: string
          documento_tipo: string | null
          email: string | null
          fatura: string | null
          fatura_norm: string
          id: string
          linha_csv: number | null
          lote: string | null
          nome_exibicao: string | null
          nome_origem: string
          nome_real: string | null
          nome_real_em: string | null
          nome_real_por: string | null
          ocorrencia: number
          precisa_identificacao: boolean
          sumido_em: string | null
        }
        SetofOptions: {
          from: "*"
          to: "participantes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      exigir_evento_aberto: { Args: never; Returns: undefined }
      hash_documento: { Args: { p_documento: string }; Returns: string }
      importar_participantes: {
        Args: { p_arquivo?: string; p_confirmar?: boolean; p_linhas: Json }
        Returns: Json
      }
      is_admin: { Args: never; Returns: boolean }
      is_equipe: { Args: never; Returns: boolean }
      limpar_nome: { Args: { p: string }; Returns: string }
      norm_texto: { Args: { p: string }; Returns: string }
      revogar_convite: { Args: { p_convite_id: string }; Returns: undefined }
      so_digitos: { Args: { p: string }; Returns: string }
      tipo_documento: { Args: { p_documento: string }; Returns: string }
      validar_convite: {
        Args: { p_token: string }
        Returns: {
          papel: string
          rotulo: string
        }[]
      }
      vincular_usuario_ao_convite: {
        Args: { p_convite_id: string; p_user_id: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
