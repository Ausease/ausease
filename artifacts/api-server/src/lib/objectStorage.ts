import { randomUUID } from "node:crypto";
import { Storage } from "@google-cloud/storage";

const SIDECAR = "http://127.0.0.1:1106";
export const objectStorageClient = new Storage({
  credentials: {
    audience: "replit", subject_token_type: "access_token", token_url: `${SIDECAR}/token`,
    type: "external_account", credential_source: { url: `${SIDECAR}/credential`, format: { type: "json", subject_token_field_name: "access_token" } },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

export class ObjectNotFoundError extends Error {
  constructor() { super("Object not found"); this.name = "ObjectNotFoundError"; }
}

const parsePath = (value: string) => {
  const parts = value.replace(/^\/+/, "").split("/");
  if (parts.length < 2 || !parts[0] || !parts.slice(1).join("/")) throw new Error("Invalid object path");
  return { bucket: parts[0], name: parts.slice(1).join("/") };
};

export class ObjectStorageService {
  private privateDir() {
    const dir = process.env.PRIVATE_OBJECT_DIR;
    if (!dir) throw new Error("PRIVATE_OBJECT_DIR is not configured.");
    return dir.replace(/\/+$/, "");
  }
  async createUploadUrl() {
    const objectName = `${this.privateDir()}/uploads/${randomUUID()}`;
    const { bucket, name } = parsePath(objectName);
    const response = await fetch(`${SIDECAR}/object-storage/signed-object-url`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bucket_name: bucket, object_name: name, method: "PUT", expires_at: new Date(Date.now() + 15 * 60_000).toISOString() }),
    });
    if (!response.ok) throw new Error(`Unable to create upload URL (${response.status}).`);
    const body = await response.json() as { signed_url: string };
    return { uploadURL: body.signed_url, objectPath: `/objects/${name.slice(this.privateDir().length + 1)}` };
  }
  async getFile(objectPath: string) {
    if (!objectPath.startsWith("/objects/")) throw new ObjectNotFoundError();
    const { bucket, name } = parsePath(`${this.privateDir()}/${objectPath.slice("/objects/".length)}`);
    const file = objectStorageClient.bucket(bucket).file(name);
    const [exists] = await file.exists();
    if (!exists) throw new ObjectNotFoundError();
    return file;
  }
}