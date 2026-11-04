import { PrismaClient } from "@prisma/client";

export type DeadLetterRow = {
  id: string;
  tenantId: string | null;
  source: string;
  eventType: string;
  payload: string;
  reason: string | null;
  createdAt: Date;
};

export type DeadLetterListDb = {
  deadLetter: {
    findMany(args: { orderBy: { createdAt: "desc" }; take: number }): Promise<DeadLetterRow[]>;
  };
};

const globalForDlq = globalThis as unknown as { adminDlqDb?: PrismaClient };

function defaultDb(): DeadLetterListDb {
  if (!globalForDlq.adminDlqDb) {
    globalForDlq.adminDlqDb = new PrismaClient();
  }
  return globalForDlq.adminDlqDb;
}

/** List recent dead-letter rows for the admin DLQ view (newest first). */
export async function listDeadLetters(
  db: DeadLetterListDb = defaultDb(),
  take = 100
): Promise<DeadLetterRow[]> {
  return db.deadLetter.findMany({
    orderBy: { createdAt: "desc" },
    take,
  });
}
