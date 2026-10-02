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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      custom_links: {
        Row: {
          created_at: string
          enabled: boolean
          icon: string
          id: string
          link_type: string
          name: string
          position: number
          profile_id: string
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          icon?: string
          id?: string
          link_type?: string
          name: string
          position?: number
          profile_id: string
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          icon?: string
          id?: string
          link_type?: string
          name?: string
          position?: number
          profile_id?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_links_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      probe_apply_marker: {
        Row: {
          id: number | null
        }
        Insert: {
          id?: number | null
        }
        Update: {
          id?: number | null
        }
        Relationships: []
      }
      profile_events: {
        Row: {
          created_at: string
          custom_link_id: string | null
          event_type: string
          id: string
          platform: string | null
          profile_id: string
          visitor_id: string | null
        }
        Insert: {
          created_at?: string
          custom_link_id?: string | null
          event_type: string
          id?: string
          platform?: string | null
          profile_id: string
          visitor_id?: string | null
        }
        Update: {
          created_at?: string
          custom_link_id?: string | null
          event_type?: string
          id?: string
          platform?: string | null
          profile_id?: string
          visitor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profile_events_custom_link_id_fkey"
            columns: ["custom_link_id"]
            isOneToOne: false
            referencedRelation: "custom_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_events_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_path: string | null
          bio: string | null
          bio_color: string | null
          bio_font_family: string
          bio_font_style: string
          bio_font_weight: number
          card_background_color: string
          card_background_type: string
          card_gradient_angle: number
          card_gradient_color: string
          cover_photo_path: string | null
          cover_photo_x: number
          cover_photo_y: number
          created_at: string
          discord_url: string | null
          display_name: string | null
          epicgames_url: string | null
          facebook_url: string | null
          github_url: string | null
          id: string
          instagram_url: string | null
          linkedin_url: string | null
          name_color: string | null
          name_font_family: string
          name_font_style: string
          name_font_weight: number
          page_background_color: string
          page_background_image_mode: string
          page_background_image_url: string | null
          page_background_media_type: string
          page_background_type: string
          page_background_use_image: boolean
          page_background_video_url: string | null
          page_gradient_angle: number
          page_gradient_color: string
          qr_background_color: string
          qr_error_correction: string
          qr_eye_shape: string
          qr_foreground_color: string
          qr_margin: number
          qr_module_shape: string
          reddit_url: string | null
          show_qr_button: boolean
          snapchat_url: string | null
          social_icon_bg_color: string | null
          social_icon_color: string | null
          steam_url: string | null
          telegram_url: string | null
          threads_url: string | null
          tiktok_url: string | null
          twitch_url: string | null
          updated_at: string
          username: string
          verified: boolean
          whatsapp_url: string | null
          x_url: string | null
          youtube_url: string | null
        }
        Insert: {
          avatar_path?: string | null
          bio?: string | null
          bio_color?: string | null
          bio_font_family?: string
          bio_font_style?: string
          bio_font_weight?: number
          card_background_color?: string
          card_background_type?: string
          card_gradient_angle?: number
          card_gradient_color?: string
          cover_photo_path?: string | null
          cover_photo_x?: number
          cover_photo_y?: number
          created_at?: string
          discord_url?: string | null
          display_name?: string | null
          epicgames_url?: string | null
          facebook_url?: string | null
          github_url?: string | null
          id: string
          instagram_url?: string | null
          linkedin_url?: string | null
          name_color?: string | null
          name_font_family?: string
          name_font_style?: string
          name_font_weight?: number
          page_background_color?: string
          page_background_image_mode?: string
          page_background_image_url?: string | null
          page_background_media_type?: string
          page_background_type?: string
          page_background_use_image?: boolean
          page_background_video_url?: string | null
          page_gradient_angle?: number
          page_gradient_color?: string
          qr_background_color?: string
          qr_error_correction?: string
          qr_eye_shape?: string
          qr_foreground_color?: string
          qr_margin?: number
          qr_module_shape?: string
          reddit_url?: string | null
          show_qr_button?: boolean
          snapchat_url?: string | null
          social_icon_bg_color?: string | null
          social_icon_color?: string | null
          steam_url?: string | null
          telegram_url?: string | null
          threads_url?: string | null
          tiktok_url?: string | null
          twitch_url?: string | null
          updated_at?: string
          username: string
          verified?: boolean
          whatsapp_url?: string | null
          x_url?: string | null
          youtube_url?: string | null
        }
        Update: {
          avatar_path?: string | null
          bio?: string | null
          bio_color?: string | null
          bio_font_family?: string
          bio_font_style?: string
          bio_font_weight?: number
          card_background_color?: string
          card_background_type?: string
          card_gradient_angle?: number
          card_gradient_color?: string
          cover_photo_path?: string | null
          cover_photo_x?: number
          cover_photo_y?: number
          created_at?: string
          discord_url?: string | null
          display_name?: string | null
          epicgames_url?: string | null
          facebook_url?: string | null
          github_url?: string | null
          id?: string
          instagram_url?: string | null
          linkedin_url?: string | null
          name_color?: string | null
          name_font_family?: string
          name_font_style?: string
          name_font_weight?: number
          page_background_color?: string
          page_background_image_mode?: string
          page_background_image_url?: string | null
          page_background_media_type?: string
          page_background_type?: string
          page_background_use_image?: boolean
          page_background_video_url?: string | null
          page_gradient_angle?: number
          page_gradient_color?: string
          qr_background_color?: string
          qr_error_correction?: string
          qr_eye_shape?: string
          qr_foreground_color?: string
          qr_margin?: number
          qr_module_shape?: string
          reddit_url?: string | null
          show_qr_button?: boolean
          snapchat_url?: string | null
          social_icon_bg_color?: string | null
          social_icon_color?: string | null
          steam_url?: string | null
          telegram_url?: string | null
          threads_url?: string | null
          tiktok_url?: string | null
          twitch_url?: string | null
          updated_at?: string
          username?: string
          verified?: boolean
          whatsapp_url?: string | null
          x_url?: string | null
          youtube_url?: string | null
        }
        Relationships: []
      }
      social_link_settings: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          platform: string
          position: number
          profile_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          platform: string
          position?: number
          profile_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          platform?: string
          position?: number
          profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_link_settings_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_custom_link: {
        Args: {
          link_icon?: string
          link_name: string
          link_type?: string
          link_url: string
        }
        Returns: {
          created_at: string
          enabled: boolean
          icon: string
          id: string
          link_type: string
          name: string
          position: number
          profile_id: string
          updated_at: string
          url: string
        }
        SetofOptions: {
          from: "*"
          to: "custom_links"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_profile_analytics: {
        Args: { target_profile_id: string }
        Returns: Json
      }
      is_safe_avatar_object: {
        Args: { object_metadata: Json; object_name: string }
        Returns: boolean
      }
      is_username_available: {
        Args: { check_username: string }
        Returns: boolean
      }
      reorder_custom_links: {
        Args: { ordered_ids: string[]; target_profile_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
