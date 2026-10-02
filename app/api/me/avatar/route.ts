import { NextRequest, NextResponse } from "next/server";
import { currentUserId, unauthorized } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import {
  AVATAR_MAX_BYTES,
  AVATAR_MIME_TYPES,
  isCloudinaryConfigured,
  uploadAvatar,
} from "@/lib/cloudinary";

/**
 * POST   — upload a profile picture (multipart field `file`).
 * DELETE — drop the upload and restore the Google photo.
 *
 * The Google photo is kept in `User.providerImage` precisely so DELETE can
 * restore it; without that column, removing an upload could only fall back to
 * initials and the original would be gone for good.
 */
export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return unauthorized();

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected a multipart form with a `file` field." },
      { status: 400 }
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Expected a multipart form with a `file` field." },
      { status: 400 }
    );
  }
  if (!AVATAR_MIME_TYPES.includes(file.type as (typeof AVATAR_MIME_TYPES)[number])) {
    return NextResponse.json(
      { error: "Upload a JPEG, PNG or WebP image." },
      { status: 400 }
    );
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "That file is empty." }, { status: 400 });
  }
  if (file.size > AVATAR_MAX_BYTES) {
    return NextResponse.json(
      { error: "Images must be 2 MB or smaller." },
      { status: 413 }
    );
  }

  if (!isCloudinaryConfigured()) {
    return NextResponse.json(
      {
        error:
          "Image upload isn't configured (Cloudinary credentials missing).",
        code: "upload_unavailable",
      },
      { status: 503 }
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const dataUri = `data:${file.type};base64,${bytes.toString("base64")}`;

  try {
    const url = await uploadAvatar(userId, dataUri);
    const user = await prisma.user.update({
      where: { id: userId },
      data: { image: url },
      select: { image: true, providerImage: true },
    });
    return NextResponse.json({ imageUrl: user.image, providerImage: user.providerImage });
  } catch {
    // Cloudinary validates the actual bytes, so a mislabelled file lands here
    // rather than at the mime check above.
    return NextResponse.json(
      { error: "That file could not be processed as an image." },
      { status: 400 }
    );
  }
}

export async function DELETE() {
  const userId = await currentUserId();
  if (!userId) return unauthorized();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { providerImage: true },
  });
  if (!user) return unauthorized();

  // Falls back to null (initials) if the account never had a Google photo.
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { image: user.providerImage },
    select: { image: true, providerImage: true },
  });

  return NextResponse.json({ imageUrl: updated.image });
}
