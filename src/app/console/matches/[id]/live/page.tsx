"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * The form-based Live Entry screen is retired. The route stays as a
 * redirect so old links and bookmarks keep working — it now lands on the
 * Spike Tracker.
 */
export default function LiveEntryRedirect() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  useEffect(() => {
    router.replace(`/console/matches/${id}/spikes`);
  }, [id, router]);
  return null;
}
