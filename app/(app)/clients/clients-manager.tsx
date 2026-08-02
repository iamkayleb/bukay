"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { TAG_NAME_MAX_LENGTH, normalizeTagName } from "@/app/lib/clients/tags";

export type ClientTag = {
  id: string;
  name: string;
};

export type ClientProfile = {
  id: string;
  name: string;
  email: string | null;
  phone: string;
  notes: string | null;
  tags: ClientTag[];
};

export type ClientTagFormState = {
  name: string;
};

export type ClientTagFieldErrors = Partial<Record<keyof ClientTagFormState | "_form", string>>;

type ApiValidationError = {
  ok: false;
  error?: string;
  fieldErrors?: Partial<Record<string, string[]>>;
  formErrors?: string[];
};

export function validateClientTagForm(form: ClientTagFormState): ClientTagFieldErrors {
  const name = normalizeTagName(form.name);
  if (!name) {
    return { name: "Tag name is required" };
  }

  if (name.length > TAG_NAME_MAX_LENGTH) {
    return { name: `Tag name must be ${TAG_NAME_MAX_LENGTH} characters or fewer` };
  }

  return {};
}

export function clientTagPayload(form: ClientTagFormState) {
  return { name: normalizeTagName(form.name) };
}

export function clientListPath({
  search,
  selectedTagId,
  pageSize = 25,
}: {
  search: string;
  selectedTagId: string | null;
  pageSize?: number;
}) {
  const params = new URLSearchParams({ pageSize: String(pageSize) });
  const normalizedSearch = normalizeTagName(search);

  if (normalizedSearch) {
    params.set("search", normalizedSearch);
  }

  if (selectedTagId) {
    params.set("tagId", selectedTagId);
  }

  return `/api/clients?${params.toString()}`;
}

export function clientTagAssignPath(clientId: string) {
  return `/api/clients/${encodeURIComponent(clientId)}/tags`;
}

export function clientTagRemovePath(clientId: string, tagId: string) {
  return `/api/clients/${encodeURIComponent(clientId)}/tags/${encodeURIComponent(tagId)}`;
}

function hasErrors(errors: ClientTagFieldErrors) {
  return Object.keys(errors).length > 0;
}

function firstError(errors: string[] | undefined) {
  return errors?.[0];
}

function mapApiErrors(error: ApiValidationError): ClientTagFieldErrors {
  const fieldErrors = error.fieldErrors ?? {};

  return {
    name: firstError(fieldErrors.name),
    _form: firstError(error.formErrors) ?? error.error,
  };
}

function TagPill({ tag, onRemove }: { tag: ClientTag; onRemove: (tag: ClientTag) => void }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-md border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs font-medium text-slate-200">
      {tag.name}
      <button
        aria-label={`Remove ${tag.name}`}
        className="text-slate-500 hover:text-red-300"
        type="button"
        onClick={() => onRemove(tag)}
      >
        x
      </button>
    </span>
  );
}

export function ClientsManager() {
  const [clients, setClients] = useState<ClientProfile[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [form, setForm] = useState<ClientTagFormState>({ name: "" });
  const [search, setSearch] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);
  const [errors, setErrors] = useState<ClientTagFieldErrors>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const loadClients = useCallback(async () => {
    setIsLoading(true);
    setNotice(null);

    try {
      const response = await fetch(clientListPath({ search: submittedSearch, selectedTagId }), {
        headers: { Accept: "application/json" },
      });
      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? "Unable to load clients");
      }

      setClients(data.clients);
      setSelectedClientId((current) => current ?? data.clients[0]?.id ?? null);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to load clients");
    } finally {
      setIsLoading(false);
    }
  }, [selectedTagId, submittedSearch]);

  useEffect(() => {
    void loadClients();
  }, [loadClients]);

  const selectedClient = useMemo(
    () => clients.find((client) => client.id === selectedClientId) ?? clients[0] ?? null,
    [clients, selectedClientId]
  );

  const availableTags = useMemo(() => {
    const tags = new Map<string, ClientTag>();

    clients.forEach((client) => {
      client.tags.forEach((tag) => tags.set(tag.id, tag));
    });

    return Array.from(tags.values()).sort((left, right) => left.name.localeCompare(right.name));
  }, [clients]);

  function applySearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmittedSearch(search);
  }

  async function assignTag(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);

    if (!selectedClient) {
      setErrors({ _form: "Select a client before adding a tag" });
      return;
    }

    const nextErrors = validateClientTagForm(form);
    if (hasErrors(nextErrors)) {
      setErrors(nextErrors);
      return;
    }

    setIsSaving(true);
    setErrors({});

    try {
      const response = await fetch(clientTagAssignPath(selectedClient.id), {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(clientTagPayload(form)),
      });
      const data = await response.json();

      if (!response.ok || !data.ok) {
        if (data.error === "validation_failed") {
          setErrors(mapApiErrors(data));
          return;
        }

        throw new Error(data.error ?? "Unable to save tag");
      }

      await loadClients();
      setForm({ name: "" });
      setNotice("Tag saved.");
    } catch (error) {
      setErrors({ _form: error instanceof Error ? error.message : "Unable to save tag" });
    } finally {
      setIsSaving(false);
    }
  }

  async function removeTag(client: ClientProfile, tag: ClientTag) {
    setNotice(null);
    const response = await fetch(clientTagRemovePath(client.id, tag.id), {
      method: "DELETE",
      headers: { Accept: "application/json" },
    });
    const data = await response.json();

    if (!response.ok || !data.ok) {
      setNotice(data.error ?? "Unable to remove tag");
      return;
    }

    await loadClients();
    setNotice("Tag removed.");
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="space-y-5">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-emerald-300">
              Clients
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-white">Client profiles</h1>
          </div>

          <form className="flex flex-col gap-3 sm:flex-row" onSubmit={applySearch}>
            <label className="min-w-0 flex-1">
              <span className="sr-only">Search clients</span>
              <input
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                placeholder="Search by name or phone"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <button
              className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
              type="submit"
            >
              Search
            </button>
          </form>

          {availableTags.length > 0 || selectedTagId ? (
            <div className="flex flex-wrap gap-2">
              <button
                className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
                  selectedTagId === null
                    ? "border-emerald-400 bg-emerald-400 text-slate-950"
                    : "border-slate-700 bg-slate-950 text-slate-300"
                }`}
                type="button"
                onClick={() => setSelectedTagId(null)}
              >
                All tags
              </button>
              {availableTags.map((tag) => (
                <button
                  className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
                    selectedTagId === tag.id
                      ? "border-emerald-400 bg-emerald-400 text-slate-950"
                      : "border-slate-700 bg-slate-950 text-slate-300"
                  }`}
                  key={tag.id}
                  type="button"
                  onClick={() => setSelectedTagId(tag.id)}
                >
                  {tag.name}
                </button>
              ))}
            </div>
          ) : null}

          {notice ? (
            <p className="rounded-md border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-slate-200">
              {notice}
            </p>
          ) : null}

          <div className="overflow-hidden rounded-lg border border-slate-800">
            <div className="grid grid-cols-[1fr_160px_220px] bg-slate-900 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
              <span>Name</span>
              <span>Phone</span>
              <span>Tags</span>
            </div>

            {isLoading ? (
              <p className="px-4 py-6 text-sm text-slate-400">Loading clients...</p>
            ) : clients.length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-400">No clients added yet.</p>
            ) : (
              <ul className="divide-y divide-slate-800">
                {clients.map((client) => (
                  <li
                    className="grid grid-cols-[1fr_160px_220px] items-center gap-3 px-4 py-4 text-sm"
                    key={client.id}
                  >
                    <button
                      className="min-w-0 text-left"
                      type="button"
                      onClick={() => {
                        setSelectedClientId(client.id);
                        setErrors({});
                        setNotice(null);
                      }}
                    >
                      <span className="block truncate font-medium text-white">{client.name}</span>
                      <span className="mt-1 block truncate text-xs text-slate-500">
                        {client.email ?? "No email"}
                      </span>
                    </button>
                    <span className="text-slate-300">{client.phone}</span>
                    <div className="flex flex-wrap gap-2">
                      {client.tags.length > 0 ? (
                        client.tags.map((tag) => (
                          <TagPill
                            key={tag.id}
                            tag={tag}
                            onRemove={() => void removeTag(client, tag)}
                          />
                        ))
                      ) : (
                        <span className="text-xs text-slate-500">No tags</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <form
          className="h-fit rounded-lg border border-slate-800 bg-slate-900 p-5"
          onSubmit={(event) => void assignTag(event)}
        >
          <h2 className="text-lg font-semibold text-white">Manage tags</h2>

          {selectedClient ? (
            <p className="mt-2 text-sm text-slate-400">{selectedClient.name}</p>
          ) : (
            <p className="mt-2 text-sm text-slate-400">Select a client</p>
          )}

          {errors._form ? (
            <p className="mt-4 rounded-md border border-red-900/70 bg-red-950/50 px-3 py-2 text-sm text-red-200">
              {errors._form}
            </p>
          ) : null}

          <label className="mt-5 block">
            <span className="text-sm font-medium text-slate-200">Tag name</span>
            <input
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
              maxLength={TAG_NAME_MAX_LENGTH}
              value={form.name}
              onChange={(event) => setForm({ name: event.target.value })}
            />
            {errors.name ? (
              <span className="mt-1 block text-xs text-red-300">{errors.name}</span>
            ) : null}
          </label>

          <button
            className="mt-6 rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSaving || !selectedClient}
            type="submit"
          >
            {isSaving ? "Saving..." : "Add tag"}
          </button>
        </form>
      </div>
    </main>
  );
}
