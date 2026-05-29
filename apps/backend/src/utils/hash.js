import { createHash } from "node:crypto";

export const sha256 = (value) =>
  createHash("sha256").update(String(value)).digest("hex");
