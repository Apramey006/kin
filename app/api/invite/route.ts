import { NextResponse } from "next/server";
import { z } from "zod";
import { requireFamily, requireUser, AccessError } from "@/lib/auth/server";
import { getServiceClient } from "@/lib/supabase";
import { jsonError } from "@/lib/api";

// Preview is available only after sign-in and exposes no email/member list.
export async function GET(request: Request) {
  try {
    await requireUser();
    const token = z
      .string()
      .uuid()
      .safeParse(new URL(request.url).searchParams.get("token"));
    if (!token.success)
      throw new AccessError("Enter a valid invitation link.", 400);
    const sb = getServiceClient();
    const result = await sb
      .from("family_invites")
      .select("*")
      .eq("token", token.data)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (result.error) throw result.error;
    if (!result.data || result.data.used_at)
      throw new AccessError(
        "This invitation has expired or has already been used.",
        404,
      );
    const wearer = await sb
      .from("wearer")
      .select("name")
      .eq("family_id", result.data.family_id)
      .single();
    if (wearer.error) throw wearer.error;
    return NextResponse.json(
      { role: result.data.role ?? "contributor", lovedOne: wearer.data.name },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return jsonError(e, "Could not open this invitation.");
  }
}
export async function POST(request: Request) {
  try {
    const { sb, familyId, isOwner } = await requireFamily();
    if (!isOwner)
      throw new AccessError(
        "Ask the person who created this family for an invitation.",
        403,
      );
    const raw = await request.text();
    const input = z
      .object({
        role: z.enum(["contributor", "loved_one"]).default("contributor"),
      })
      .safeParse(raw ? JSON.parse(raw) : {});
    if (!input.success)
      throw new AccessError("Choose who you want to invite.", 400);
    const role = input.data.role;
    if (role === "loved_one") {
      const existing = await sb
        .from("family_members")
        .select("*")
        .eq("family_id", familyId);
      if (existing.error) throw existing.error;
      if (existing.data.some((m) => m.role === "loved_one"))
        throw new AccessError(
          "Your loved one is already connected to this family.",
          409,
        );
    }
    const result = await sb
      .from("family_invites")
      .insert({
        family_id: familyId,
        ...(role === "loved_one" ? { role } : {}),
      })
      .select("*")
      .single();
    if (result.error) {
      if (
        role === "loved_one" &&
        ["PGRST204", "42703"].includes(result.error.code)
      )
        throw new AccessError(
          "Loved-one invitations need database update 009. Ask your family organizer to finish setup.",
          503,
        );
      throw result.error;
    }
    return NextResponse.json({
      token: result.data.token,
      expires_at: result.data.expires_at,
      role: result.data.role ?? "contributor",
    });
  } catch (e) {
    return jsonError(e, "Could not create your invitation.");
  }
}
