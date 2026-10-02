import type { SupabaseClient } from "@supabase/supabase-js";

import { supabase as generatedClient } from "@/integrations/supabase/client";
import type { AppDatabase } from "@/lib/app-database";

// Typing only: the same generated client, credentials, and RLS are used.
export const supabase = generatedClient as unknown as SupabaseClient<AppDatabase>;
