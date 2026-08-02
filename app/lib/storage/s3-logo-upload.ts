import { createHash, createHmac, randomUUID } from "node:crypto";
import { z } from "zod";

export const LOGO_UPLOAD_MAX_BYTES = 1_048_576;
export const LOGO_UPLOAD_EXPIRES_SECONDS = 300;

const allowedLogoTypes = ["image/png", "image/jpeg", "image/webp"] as const;

export const createLogoUploadSchema = z.object({
  contentLength: z
    .number({
      required_error: "Content length is required",
      invalid_type_error: "Content length must be a number",
    })
    .int("Content length must be a whole number")
    .min(1, "Content length must be greater than zero")
    .max(LOGO_UPLOAD_MAX_BYTES, "Logo must be 1 MB or smaller"),
  contentType: z.enum(allowedLogoTypes, {
    errorMap: () => ({ message: "Logo must be a PNG, JPEG, or WebP image" }),
  }),
  fileName: z
    .string({ invalid_type_error: "File name must be text" })
    .trim()
    .min(1, "File name is required")
    .max(180, "File name must be 180 characters or fewer"),
});

export type CreateLogoUploadInput = z.infer<typeof createLogoUploadSchema>;

export type S3LogoUploadConfig = {
  accessKeyId: string;
  bucket: string;
  endpoint?: string;
  publicBaseUrl?: string;
  region: string;
  secretAccessKey: string;
};

export type S3LogoUpload = {
  contentLength: number;
  contentType: (typeof allowedLogoTypes)[number];
  expiresAt: string;
  headers: Record<string, string>;
  key: string;
  logoUrl: string;
  method: "PUT";
  uploadUrl: string;
};

const extensionByContentType: Record<(typeof allowedLogoTypes)[number], string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function hmac(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value).digest();
}

function hashHex(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function percentEncode(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function formatAmzDate(now: Date) {
  return now.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function signingKey(secretAccessKey: string, dateStamp: string, region: string) {
  const dateKey = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, "s3");

  return hmac(serviceKey, "aws4_request");
}

function normalizeEndpoint(config: S3LogoUploadConfig) {
  if (config.endpoint) {
    return new URL(config.endpoint.replace(/\/+$/, ""));
  }

  return new URL(`https://${config.bucket}.s3.${config.region}.amazonaws.com`);
}

function publicUrlForKey(config: S3LogoUploadConfig, key: string) {
  const base = config.publicBaseUrl?.replace(/\/+$/, "");
  if (base) {
    return `${base}/${key.split("/").map(percentEncode).join("/")}`;
  }

  return `https://${config.bucket}.s3.${config.region}.amazonaws.com/${key
    .split("/")
    .map(percentEncode)
    .join("/")}`;
}

export function loadS3LogoUploadConfig(env: NodeJS.ProcessEnv): S3LogoUploadConfig {
  const bucket = env.S3_LOGO_BUCKET ?? env.S3_BUCKET;
  const region = env.S3_REGION ?? env.AWS_REGION;
  const accessKeyId = env.S3_ACCESS_KEY_ID ?? env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = env.S3_SECRET_ACCESS_KEY ?? env.AWS_SECRET_ACCESS_KEY;

  if (!bucket || !region || !accessKeyId || !secretAccessKey) {
    throw new Error("S3 logo upload is not configured");
  }

  return {
    accessKeyId,
    bucket,
    endpoint: env.S3_ENDPOINT,
    publicBaseUrl: env.S3_LOGO_PUBLIC_BASE_URL,
    region,
    secretAccessKey,
  };
}

export function createS3LogoUpload(
  tenantId: string,
  input: CreateLogoUploadInput,
  config: S3LogoUploadConfig,
  now = new Date()
): S3LogoUpload {
  const amzDate = formatAmzDate(now);
  const dateStamp = amzDate.slice(0, 8);
  const endpoint = normalizeEndpoint(config);
  const key = `tenants/${tenantId}/logos/${randomUUID()}.${extensionByContentType[input.contentType]}`;
  const canonicalUri = `/${key.split("/").map(percentEncode).join("/")}`;
  const host = endpoint.host;
  const credentialScope = `${dateStamp}/${config.region}/s3/aws4_request`;
  const signedHeaders = "content-length;content-type;host";
  const credential = `${config.accessKeyId}/${credentialScope}`;
  const expiresAt = new Date(now.getTime() + LOGO_UPLOAD_EXPIRES_SECONDS * 1000).toISOString();

  const queryParams = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": credential,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(LOGO_UPLOAD_EXPIRES_SECONDS),
    "X-Amz-SignedHeaders": signedHeaders,
  });
  const canonicalQuery = [...queryParams.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([keyPart, value]) => `${percentEncode(keyPart)}=${percentEncode(value)}`)
    .join("&");
  const canonicalHeaders = [
    `content-length:${input.contentLength}`,
    `content-type:${input.contentType}`,
    `host:${host}`,
    "",
  ].join("\n");
  const canonicalRequest = [
    "PUT",
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    hashHex(canonicalRequest),
  ].join("\n");
  const signature = createHmac(
    "sha256",
    signingKey(config.secretAccessKey, dateStamp, config.region)
  )
    .update(stringToSign)
    .digest("hex");

  queryParams.set("X-Amz-Signature", signature);

  return {
    contentLength: input.contentLength,
    contentType: input.contentType,
    expiresAt,
    headers: {
      "content-length": String(input.contentLength),
      "content-type": input.contentType,
    },
    key,
    logoUrl: publicUrlForKey(config, key),
    method: "PUT",
    uploadUrl: `${endpoint.origin}${canonicalUri}?${queryParams.toString()}`,
  };
}
