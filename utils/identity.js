// Free identity checks — no paid NIN lookup. A person submits an ID
// photo and a selfie (private uploads) plus a bank account; the bank's
// account name (Paystack resolve) is compared with the name on the ID, and
// an admin makes the final call looking at the photos.
const cloudinary = require("../config/cloudinary");

const ID_TYPES = ["nin_slip", "drivers_licence", "international_passport", "voters_card"];

const nameTokens = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[^a-z\s-]/g, " ")
    .split(/[\s-]+/)
    .filter((t) => t.length > 1);

/**
 * Nigerian account names are usually "SURNAME FIRSTNAME MIDDLENAME", so
 * order is ignored. Two shared names = match, one = partial.
 * @returns {"match"|"partial"|"mismatch"|"unchecked"}
 */
const compareNames = (idName, accountName) => {
  if (!accountName) return "unchecked";
  const id = [...new Set(nameTokens(idName))];
  const account = new Set(nameTokens(accountName));
  const hits = id.filter((t) => account.has(t)).length;
  if (hits >= 2 || (hits === 1 && id.length === 1)) return "match";
  return hits === 1 ? "partial" : "mismatch";
};

/** A private upload must be in the uploader's own folder (see routes/uploads.js). */
const isOwnPrivateUpload = (publicId, userId) =>
  typeof publicId === "string" &&
  new RegExp(`^technest/private/${userId}/[\\w-]+$`).test(publicId);

/**
 * Signed link for admins to view a private upload. Cloudinary signed
 * delivery links don't expire, so they stay valid through a long review.
 * With a known format the link ends in .pdf / .jpg.
 */
const privateUrl = (publicId, format) =>
  publicId
    ? cloudinary.url(publicId, { type: "authenticated", sign_url: true, secure: true, ...(format ? { format } : {}) })
    : null;

const MIME = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic", heif: "image/heif", gif: "image/gif" };

// Uploaded files never change, so a lookup is cached for the process's life
const formatCache = new Map();

/**
 * The file format of a private upload ("pdf", "jpg", ...) from Cloudinary's
 * Admin API, or null if it can't be found out. Never throws.
 */
const privateFormat = async (publicId) => {
  if (!publicId) return null;
  if (formatCache.has(publicId)) return formatCache.get(publicId);
  try {
    const { cloud_name, api_key, api_secret } = cloudinary.config();
    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${cloud_name}/resources/image/authenticated/${publicId.split("/").map(encodeURIComponent).join("/")}`,
      {
        headers: { Authorization: `Basic ${Buffer.from(`${api_key}:${api_secret}`).toString("base64")}` },
        signal: AbortSignal.timeout(4000),
      }
    );
    if (!res.ok) return null; // not cached: may be a passing outage
    const format = String((await res.json()).format || "").toLowerCase() || null;
    if (formatCache.size > 5000) formatCache.delete(formatCache.keys().next().value);
    formatCache.set(publicId, format);
    return format;
  } catch {
    return null;
  }
};

/**
 * Link and file type for an admin document viewer.
 * @returns {Promise<{ url: string|null, mime: string|null }>} mime null = unknown (guess from the URL)
 */
const privateFile = async (publicId) => {
  if (!publicId) return { url: null, mime: null };
  const format = await privateFormat(publicId);
  return { url: privateUrl(publicId, format), mime: format ? MIME[format] || `image/${format}` : null };
};

/**
 * A user's identity check as admins see it, with signed links and file
 * types for the ID photo and selfie. Bank code and raw upload ids left out.
 */
const identityForAdmin = async (identity) => {
  if (!identity || !identity.status || identity.status === "none") return null;
  const { idDocumentId, selfieId, bankCode, ...rest } = identity.toObject ? identity.toObject() : identity;
  const [idDoc, selfie] = await Promise.all([privateFile(idDocumentId), privateFile(selfieId)]);
  return {
    ...rest,
    idDocumentUrl: idDoc.url,
    idDocumentMime: idDoc.mime,
    selfieUrl: selfie.url,
    selfieMime: selfie.mime,
  };
};

module.exports = { ID_TYPES, compareNames, isOwnPrivateUpload, privateUrl, privateFile, identityForAdmin };
