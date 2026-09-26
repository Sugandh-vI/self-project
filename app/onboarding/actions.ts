"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/i;

export type SetUsernameResult = { error: string } | undefined;

export async function setUsername(
  _prevState: SetUsernameResult,
  formData: FormData
): Promise<SetUsernameResult> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/signin");

  const username = String(formData.get("username") ?? "")
    .trim()
    .toLowerCase();

  if (!USERNAME_PATTERN.test(username)) {
    return {
      error: "3–20 characters, letters, numbers and underscores only.",
    };
  }

  try {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { username },
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
