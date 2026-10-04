// In-memory stand-in for the OtpCode delegate of the Prisma client, shared
// across module instances through a single table so tests can prove codes are
// stored outside the OtpStore object.
export type OtpRow = { phone: string; hash: string; expiresAt: Date; attempts: number };

export const otpTable = new Map<string, OtpRow>();

type Where = { phone: string; hash?: string; attempts?: number };

const matches = (row: OtpRow | undefined, where: Where): row is OtpRow =>
  !!row &&
  (where.hash === undefined || row.hash === where.hash) &&
  (where.attempts === undefined || row.attempts === where.attempts);

export const fakePrisma = {
  otpCode: {
    findUnique: async ({ where }: { where: { phone: string } }) => {
      const row = otpTable.get(where.phone);
      return row ? { ...row } : null;
    },
    upsert: async ({
      where,
      create,
      update,
    }: {
      where: { phone: string };
      create: OtpRow;
      update: Omit<OtpRow, "phone">;
    }) => {
      const existing = otpTable.get(where.phone);
      otpTable.set(where.phone, existing ? { ...existing, ...update } : { ...create });
    },
    updateMany: async ({
      where,
      data,
    }: {
      where: Where;
      data: { attempts: { increment: number } };
    }) => {
      const row = otpTable.get(where.phone);
      if (!matches(row, where)) return { count: 0 };
      row.attempts += data.attempts.increment;
      return { count: 1 };
    },
    deleteMany: async ({ where }: { where: Partial<Where> }) => {
      if (where.phone === undefined) {
        const count = otpTable.size;
        otpTable.clear();
        return { count };
      }
      const row = otpTable.get(where.phone);
      if (!matches(row, where as Where)) return { count: 0 };
      otpTable.delete(where.phone);
      return { count: 1 };
    },
  },
};
