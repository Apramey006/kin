import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/server";
import { jsonError } from "@/lib/api";
const schema = z.object({
  mode: z.enum(["create", "join"]),
  name: z.string().trim().min(1).max(80).optional(),
  relationship: z.string().trim().min(1).max(60).optional(),
  lovedOne: z.string().trim().min(1).max(80).optional(),
  invite: z.string().uuid().optional(),
});
export async function POST(request: Request) {
  try {
    const { auth, user } = await requireUser();
    const input = schema.safeParse(await request.json());
    if (!input.success)
      return NextResponse.json(
        { error: "Please complete your name and relationship." },
        { status: 400 },
      );
    const data = input.data;
    if (
      (data.mode === "create" &&
        (!data.lovedOne || !data.name || !data.relationship)) ||
      (data.mode === "join" && !data.invite)
    )
      return NextResponse.json(
        { error: "Enter your loved one's name or a valid invitation." },
        { status: 400 },
      );
    const result =
      data.mode === "create"
        ? await auth.rpc("create_kin_family", {
            loved_one: data.lovedOne,
            member_name: data.name ?? null,
            relationship: data.relationship ?? null,
          })
        : await auth.rpc("join_kin_family", {
            invite_code: data.invite,
            member_name: data.name ?? null,
            relationship: data.relationship ?? null,
          });
    if (result.error)
      return NextResponse.json(
        {
          error:
            result.error.code === "P0001"
              ? result.error.message
              : "Your family couldn't be set up. Please try again.",
        },
        { status: 400 },
      );
    const member = await auth
      .from("family_members")
      .select("*")
      .eq("user_id", user.id)
      .single();
    if (member.error) throw member.error;
    await auth.auth.refreshSession();
    return NextResponse.json({
      ok: true,
      familyId: result.data,
      destination: member.data.role === "loved_one" ? "/wearer" : "/family",
    });
  } catch (e) {
    return jsonError(e, "Could not set up your family.");
  }
}
