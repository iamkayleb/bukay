export type ClientRecord = {
  id: string;
  tenantId: string;
  name: string;
  phone: string;
  email: string | null;
  notes: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

function toIso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : value;
}

export function serializeClient(client: ClientRecord) {
  return {
    id: client.id,
    tenantId: client.tenantId,
    name: client.name,
    phone: client.phone,
    email: client.email,
    notes: client.notes,
    createdAt: toIso(client.createdAt),
    updatedAt: toIso(client.updatedAt),
  };
}
