import { createHash, createHmac, randomUUID } from "crypto";

import { z } from "zod";

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const UPLOAD_EXPIRES_SECONDS = 300;
const UNSIGNED_PAYLOAD = "UNSIGNED-PAYLOAD";

const logoContentTypes = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
} as const;

export const logoUploadRequestSchema = z.object({
  fileName: z.string().trim().min(1).max(180),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]),
  size: z.number().int().positive().max(MAX_LOGO_BYTES),
});

export type LogoUploadRequest = z.infer<typeof logoUploadRequestSchema>;

type StorageConfig = {
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  endpoint: string;
  region: string;
  publicBaseUrl: string;
};

export type LogoUploadTarget = {
  uploadUrl: string;
  publicUrl: string;
  method: "PUT";
  headers: Record<string, string>;
  expiresIn: number;
};

function envValue(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) {
      return value;
    }
  }

  return "";
}

function requireStorageConfig(): StorageConfig {
  const endpoint = envValue("S3_ENDPOINT", "OBJECT_STORAGE_ENDPOINT").replace(/\/+$/, "");
  const bucket = envValue("S3_BUCKET", "OBJECT_STORAGE_BUCKET");
  const accessKeyId = envValue("S3_ACCESS_KEY_ID", "OBJECT_STORAGE_ACCESS_KEY_ID");
  const secretAccessKey = envValue("S3_SECRET_ACCESS_KEY", "OBJECT_STORAGE_SECRET_ACCESS_KEY");
  const publicBaseUrl = envValue("S3_PUBLIC_BASE_URL", "OBJECT_STORAGE_PUBLIC_BASE_URL") || "";

  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error("object_storage_not_configured");
  }

  return {
    accessKeyId,
    secretAccessKey,
    bucket,
    endpoint,
    region: envValue("S3_REGION", "OBJECT_STORAGE_REGION") || "auto",
    publicBaseUrl: (publicBaseUrl || `${endpoint}/${bucket}`).replace(/\/+$/, ""),
  };
}

function hmac(key: string | Buffer, value: string) {
  return createHmac("sha256", key).update(value).digest();
}

function hexHmac(key: string | Buffer, value: string) {
  return createHmac("sha256", key).update(value).digest("hex");
}

function encodePathSegment(value: string) {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function signingKey(secretAccessKey: string, date: string, region: string) {
  const dateKey = hmac(`AWS4${secretAccessKey}`, date);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, "s3");
  return hmac(serviceKey, "aws4_request");
}

function formatAmzDate(date: Date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function objectKey(tenantId: string, request: LogoUploadRequest) {
  const extension = logoContentTypes[request.contentType];
  return `tenants/${tenantId}/settings/logo-${Date.now()}-${randomUUID()}.${extension}`;
}

export function createLogoUploadTarget(
  tenantId: string,
  request: LogoUploadRequest,
  now = new Date()
): LogoUploadTarget {
  const config = requireStorageConfig();
  const key = objectKey(tenantId, request);
  const amzDate = formatAmzDate(now);
  const dateStamp = amzDate.slice(0, 8);
  const host = new URL(config.endpoint).host;
  const scope = `${dateStamp}/${config.region}/s3/aws4_request`;
  const credential = `${config.accessKeyId}/${scope}`;
  const signedHeaders = "content-type;host;x-amz-content-sha256";
  const canonicalUri = `/${encodePathSegment(config.bucket)}/${key.split("/").map(encodePathSegment).join("/")}`;
  const query = new Map<string, string>([
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Credential", credential],
    ["X-Amz-Date", amzDate],
    ["X-Amz-Expires", String(UPLOAD_EXPIRES_SECONDS)],
    ["X-Amz-SignedHeaders", signedHeaders],
  ]);
  const canonicalQueryString = [...query.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => `${encodePathSegment(name)}=${encodePathSegment(value)}`)
    .join("&");
  const canonicalHeaders = [
    `content-type:${request.contentType}`,
    `host:${host}`,
    `x-amz-content-sha256:${UNSIGNED_PAYLOAD}`,
    "",
  ].join("\n");
  const canonicalRequest = [
    "PUT",
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    UNSIGNED_PAYLOAD,
  ].join("\n");
  const hashedCanonicalRequest = createHash("sha256").update(canonicalRequest).digest("hex");
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, hashedCanonicalRequest].join("\n");
  const signature = hexHmac(
    signingKey(config.secretAccessKey, dateStamp, config.region),
    stringToSign
  );
  const uploadUrl = `${config.endpoint}${canonicalUri}?${canonicalQueryString}&X-Amz-Signature=${signature}`;

  return {
    uploadUrl,
    publicUrl: `${config.publicBaseUrl}/${key.split("/").map(encodePathSegment).join("/")}`,
    method: "PUT",
    headers: {
      "Content-Type": request.contentType,
      "x-amz-content-sha256": UNSIGNED_PAYLOAD,
    },
    expiresIn: UPLOAD_EXPIRES_SECONDS,
  };
}
