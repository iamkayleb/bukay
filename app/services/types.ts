export type ServiceDto = {
  id: string;
  name: string;
  durationMinutes: number;
  priceKobo: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type FieldErrors = Record<string, string[]>;

export type ServiceFormValues = {
  name: string;
  durationMinutes: string;
  priceKobo: string;
  bufferMinutes: string;
  active: boolean;
};

export const emptyForm: ServiceFormValues = {
  name: "",
  durationMinutes: "30",
  priceKobo: "0",
  bufferMinutes: "0",
  active: true,
};

export function formFromService(service: ServiceDto): ServiceFormValues {
  return {
    name: service.name,
    durationMinutes: String(service.durationMinutes),
    priceKobo: String(service.priceKobo),
    bufferMinutes: "0",
    active: service.active,
  };
}

export function formToPayload(values: ServiceFormValues) {
  return {
    name: values.name.trim(),
    durationMinutes: Number(values.durationMinutes),
    priceKobo: Number(values.priceKobo),
    bufferMinutes: Number(values.bufferMinutes),
    active: values.active,
  };
}

export function formatKobo(kobo: number): string {
  const naira = kobo / 100;
  return naira.toLocaleString("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 2,
  });
}
