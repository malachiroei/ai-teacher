import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { normalizePreferredTime } from "@/lib/web-push";

export const dynamic = "force-dynamic";

type SubscribeBody = {
  subscription?: {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };
  preferredTime?: string;
  timezone?: string;
  enabled?: boolean;
  tutorName?: string;
  kidName?: string;
  goalMinutes?: number;
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: SubscribeBody = {};
  try {
    body = (await request.json()) as SubscribeBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const endpoint = String(body.subscription?.endpoint || "").trim();
  const p256dh = String(body.subscription?.keys?.p256dh || "").trim();
  const auth = String(body.subscription?.keys?.auth || "").trim();
  const enabled = body.enabled !== false;
  const preferredTime = normalizePreferredTime(body.preferredTime || "17:00");
  const timezone = String(body.timezone || "UTC").trim() || "UTC";

  if (!enabled) {
    if (endpoint) {
      await supabase.from("push_subscriptions").update({ enabled: false, updated_at: new Date().toISOString() }).eq("user_id", user.id).eq("endpoint", endpoint);
    } else {
      await supabase.from("push_subscriptions").update({ enabled: false, updated_at: new Date().toISOString() }).eq("user_id", user.id);
    }
    return NextResponse.json({ ok: true, enabled: false });
  }

  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "Missing push subscription" }, { status: 400 });
  }

  const row = {
    user_id: user.id,
    endpoint,
    p256dh,
    auth,
    preferred_time: preferredTime,
    timezone,
    enabled: true,
    tutor_name: body.tutorName?.trim() || null,
    kid_name: body.kidName?.trim() || null,
    goal_minutes: Number.isFinite(Number(body.goalMinutes)) ? Number(body.goalMinutes) : 10,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("push_subscriptions").upsert(row, { onConflict: "endpoint" });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, enabled: true });
}
