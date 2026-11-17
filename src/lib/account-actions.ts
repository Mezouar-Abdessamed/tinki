import { authApi } from "@/lib/api-client";

export async function deleteMyAccount(input: {
  data: { username: string; password?: string };
}): Promise<{ success: boolean }> {
  await authApi.deleteAccount(input.data);
  return { success: true };
}
