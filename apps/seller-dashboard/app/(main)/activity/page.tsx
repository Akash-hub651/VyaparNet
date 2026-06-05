/**
 * Activity Center Placeholder — apps/seller-dashboard/app/(main)/activity/page.tsx
 *
 * Authority: seller_dashboard_screen_system.md §19.3
 *
 * Sprint 8 State: DEFERRED.
 * "If direct URL accessed: redirect to /dashboard. No 'coming soon' page needed for internal routes."
 */

import { redirect } from "next/navigation";

export default function ActivityPage() {
  redirect("/dashboard");
}
