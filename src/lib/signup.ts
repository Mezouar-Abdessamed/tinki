import type { Session, SupabaseClient } from "@supabase/supabase-js";

type SignupValues = { email: string; password: string; username: string; origin: string };

/** Create an account and require a real authenticated session before continuing. */
export async function signUpDirectly(
  auth: Pick<SupabaseClient["auth"], "signUp">,
  values: SignupValues,
): Promise<Session> {
  const { data, error } = await auth.signUp({
    email: values.email,
    password: values.password,
    options: {
      emailRedirectTo: values.origin,
      data: { username: values.username },
    },
  });
  if (error) throw error;
  if (!data.session) {
    throw new Error("We couldn't finish signing you in — please try logging in");
  }
  return data.session;
}