import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import SettingsPage from "@/app/(app)/settings/page";
import { DEFAULT_BRAND_COLOR } from "@/app/lib/settings/schemas";

describe("settings form", () => {
  it("exposes brand color editing controls", () => {
    const html = renderToStaticMarkup(<SettingsPage />);

    expect(html).toContain('type="color"');
    expect(html).toContain('aria-label="Brand color"');
    expect(html).toContain('aria-label="Brand color hex"');
    expect(html).toContain(`value="${DEFAULT_BRAND_COLOR}"`);
  });
});
