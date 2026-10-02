import type { Profile } from "@/lib/profiles";

// Local view of the existing application schema. The generated integration's
// types describe the newly connected, currently empty Cloud database; keep
// application types separate until its existing migrations are restored.
type ProfileRow = Omit<Profile, "show_qr_button"> & {
  show_qr_button: boolean;
  verified: boolean;
};

type Table<Row, Insert, Update> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

type CustomLinkRow = {
  id: string;
  profile_id: string;
  name: string;
  url: string;
  icon: string;
  enabled: boolean;
  position: number;
  link_type: string;
  created_at: string;
  updated_at: string;
};

type SocialLinkRow = {
  id: string;
  profile_id: string;
  platform: string;
  enabled: boolean;
  position: number;
  created_at: string;
  updated_at: string;
};

type EventRow = {
  id: string;
  profile_id: string;
  event_type: string;
  platform: string | null;
  custom_link_id: string | null;
  visitor_id: string | null;
  country: string | null;
  created_at: string;
};

type RoleRow = { id: string; user_id: string; role: "admin" | "user" };

export type AppDatabase = {
  public: {
    Tables: {
      profiles: Table<
        ProfileRow,
        Pick<ProfileRow, "id" | "username"> & Partial<Omit<ProfileRow, "id" | "username">>,
        Partial<ProfileRow>
      >;
      custom_links: Table<
        CustomLinkRow,
        Pick<CustomLinkRow, "profile_id" | "name" | "url"> &
          Partial<Omit<CustomLinkRow, "profile_id" | "name" | "url">>,
        Partial<CustomLinkRow>
      >;
      social_link_settings: Table<
        SocialLinkRow,
        Pick<SocialLinkRow, "profile_id" | "platform"> &
          Partial<Omit<SocialLinkRow, "profile_id" | "platform">>,
        Partial<SocialLinkRow>
      >;
      profile_events: Table<
        EventRow,
        Pick<EventRow, "profile_id" | "event_type"> &
          Partial<Omit<EventRow, "profile_id" | "event_type">>,
        Partial<EventRow>
      >;
      user_roles: Table<
        RoleRow,
        Pick<RoleRow, "user_id" | "role"> & Partial<Omit<RoleRow, "user_id" | "role">>,
        Partial<RoleRow>
      >;
    };
    Views: { [_ in never]: never };
    Functions: {
      is_username_available: { Args: { check_username: string }; Returns: boolean };
      get_profile_analytics: {
        Args: { target_profile_id: string };
        Returns: Record<string, unknown>;
      };
      reorder_custom_links: {
        Args: { target_profile_id: string; ordered_ids: string[] };
        Returns: undefined;
      };
      create_custom_link: {
        Args: { link_name: string; link_url: string; link_icon?: string; link_type?: string };
        Returns: CustomLinkRow;
      };
    };
    Enums: { app_role: "admin" | "user" };
    CompositeTypes: { [_ in never]: never };
  };
};

export type AppTableUpdate<Name extends keyof AppDatabase["public"]["Tables"]> =
  AppDatabase["public"]["Tables"][Name]["Update"];

export type AppTableRow<Name extends keyof AppDatabase["public"]["Tables"]> =
  AppDatabase["public"]["Tables"][Name]["Row"];
