import { createHash, createHmac } from "node:crypto";

type Props = {
  endpoint: string;
  port?: number;
  useSSL: boolean;
  region: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
  key: string;
  /** Signed: the upload must use exactly this type, size and cache header. */
  contentType: string;
  contentLength: number;
  cacheControl: string;
  expiresInSeconds: number;
  now?: Date;
};

/**
 * AWS Signature V4 pre-signed PUT URL (path-style, works with S3, R2, MinIO).
 * Unlike a plain pre-signed PUT, content type, content length and cache
 * control are signed headers: the storage rejects an upload of another type
 * or size than the one the server accepted.
 */
export const createPresignedPutUrl = ({
  endpoint,
  port,
  useSSL,
  region,
  accessKey,
  secretKey,
  bucket,
  key,
  contentType,
  contentLength,
  cacheControl,
  expiresInSeconds,
  now = new Date(),
}: Props) => {
  const host = port ? `${endpoint}:${port}` : endpoint;
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const canonicalUri = `/${encodePathSegment(bucket)}/${key
    .split("/")
    .map(encodePathSegment)
    .join("/")}`;
  const headers: Record<string, string> = {
    "cache-control": cacheControl,
    "content-length": String(contentLength),
    "content-type": contentType,
    host,
  };
  const signedHeaders = Object.keys(headers).sort().join(";");
  const query: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${accessKey}/${credentialScope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expiresInSeconds),
    "X-Amz-SignedHeaders": signedHeaders,
  };
  const canonicalQuery = Object.keys(query)
    .sort()
    .map((name) => `${encodeRfc3986(name)}=${encodeRfc3986(query[name] ?? "")}`)
    .join("&");
  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map((name) => `${name}:${(headers[name] ?? "").trim()}\n`)
    .join("");
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
    sha256Hex(canonicalRequest),
  ].join("\n");
  const signingKey = ["s3", "aws4_request"].reduce(
    (currentKey, data) => hmac(currentKey, data),
    hmac(hmac(`AWS4${secretKey}`, dateStamp), region),
  );
  const signature = createHmac("sha256", signingKey)
    .update(stringToSign)
    .digest("hex");
  return `${useSSL ? "https" : "http"}://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
};

const hmac = (key: string | Buffer, data: string) =>
  createHmac("sha256", key).update(data).digest();

const sha256Hex = (data: string) =>
  createHash("sha256").update(data).digest("hex");

const encodeRfc3986 = (value: string) =>
  encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );

const encodePathSegment = encodeRfc3986;
