// ---------------------------------------------------------------------------
// Cloudinary — the first thing in this app to actually use it.
//
// The stack table in README §10 picked it for two jobs: storing uploaded
// profile pictures, and normalising inconsistent poster sizes via URL
// parameters. This is the first of those. (Poster normalisation isn't wired up
// yet — posters come straight from TMDb/AniList today.)
//
// Uploads go browser → this server → Cloudinary, rather than browser →
// Cloudinary with a signed payload. The API secret then never leaves the
// server, and — unlike the direct-to-Cloudinary flow — the e2e harness can
// exercise the endpoint with a plain multipart POST.
// ---------------------------------------------------------------------------

import { v2 as cloudinary } from "cloudinary";

/** 256px square, cropped toward the face: avatars are always circular crops. */
const AVATAR_TRANSFORM = {
  width: 256,
  height: 256,
  crop: "fill",
  gravity: "face",
} as const;

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export function isCloudinaryConfigured(): boolean {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
  );
}

function configure() {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

/**
 * Upload (or replace) a user's avatar.
 *
 * `public_id` is the user id and `overwrite` is on, so re-uploading replaces
 * the existing asset instead of orphaning it and filling the account with
 * dead images. The transformation is applied on ingest, which means the stored
 * URL is already a 256px face-cropped square and needs no delivery params.
 */
export async function uploadAvatar(
  userId: string,
  dataUri: string
): Promise<string> {
  configure();

  const result = await cloudinary.uploader.upload(dataUri, {
    folder: "avatars",
    public_id: userId,
    overwrite: true,
    invalidate: true,
    resource_type: "image",
    transformation: AVATAR_TRANSFORM,
  });

  if (!result.secure_url) {
    throw new Error("Cloudinary returned no URL for the upload.");
  }
  return result.secure_url;
}
