"use server";

import { revalidatePath } from "next/cache";

// Called by office_admin / superadmin tables after toggling the
// Hide flag on a contact or deal. Without this, Next's Router
// Cache keeps stale renders of /contacts, /pipeline, /network and
// the unhidden record doesn't reappear until the cache expires.
export async function revalidateVisibilityCaches() {
  revalidatePath("/contacts");
  revalidatePath("/pipeline");
  revalidatePath("/network");
}
