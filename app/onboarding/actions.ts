"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizeUsername, USERNAME_RULES } from "@/lib/usernames";

export type SetUsernameResult = { error: string } | undefined;

export async function setUsername(
  _prevState: SetUsernameResult,
  formData: FormData
): Promise<SetUsernameResult> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/signin");

  // Same rule as the settings page — lib/usernames.ts is the single source of
  // truth, so the two can't drift.
  const username = normalizeUsername(formData.get("username"));
  if (!username) {
    return { error: USERNAME_RULES };
  }

  try {
    const current = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { image: true, providerImage: true },
    });

    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        username,
        // Whatever the avatar is right now is the Google photo — no upload can
        // exist yet. Remembering it is what makes "remove profile picture"
        // restorable later.
        providerImage: current?.providerImage ?? current?.image ?? null,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { error: "That username is already taken." };
    }
    throw error;
  }

  revalidatePath("/");
  redirect("/");
}
