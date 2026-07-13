"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * The form-based Live Entry screen is retired — the Rally Tracker's
 * court + ✓ O ✗ system replaced it (Match Setup & Live Rally redesign).
 * The route stays as a redirect so old links and bookmarks keep working.
 */
export default function LiveEntryRedirect() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  useEffect(() => {
    router.replace(`/console/matches/${id}/rally`);
  }, [id, router]);
  return null;
}
