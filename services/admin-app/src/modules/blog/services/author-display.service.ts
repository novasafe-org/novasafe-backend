import { ObjectId } from "mongodb";

import { getDb } from "../../../database/mongo";
import { ADMIN_COLLECTIONS } from "../../../database/mongo";
import type { AdminContext } from "@/types/auth";
import type { PostAuthor } from "@/types/documents/common";

function looksLikeEmail(value: string): boolean {
  return value.includes("@");
}

export function authorFromAdmin(admin: AdminContext): PostAuthor {
  const name = admin.name?.trim() || admin.email;
  return {
    id: admin.id,
    name: looksLikeEmail(name) ? "NovaSafe Team" : name,
    email: admin.email,
  };
}

/** Resolve display name — fixes legacy posts that stored email as author.name. */
export async function resolveAuthorDisplay(author: PostAuthor): Promise<PostAuthor> {
  if (author.name?.trim() && !looksLikeEmail(author.name.trim())) {
    return author;
  }

  if (author.id && ObjectId.isValid(author.id)) {
    try {
      const user = await getDb()
        .collection<{ name?: string; email?: string }>(ADMIN_COLLECTIONS.users)
        .findOne({ _id: new ObjectId(author.id) });
      if (user?.name?.trim()) {
        return { ...author, name: user.name.trim(), email: author.email ?? user.email };
      }
    } catch {
      // fall through
    }
  }

  if (author.email && !looksLikeEmail(author.name ?? "")) {
    return author;
  }

  return { ...author, name: "NovaSafe Team" };
}
