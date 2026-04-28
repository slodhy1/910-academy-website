import { createAdminClient } from "./admin";

export async function getSignedResourceUrl(
  path: string,
  expiresInSec = 3600
): Promise<string | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from("product-resources")
    .createSignedUrl(path, expiresInSec);

  if (error) {
    console.error("Signed URL error:", error);
    return null;
  }
  return data?.signedUrl ?? null;
}
