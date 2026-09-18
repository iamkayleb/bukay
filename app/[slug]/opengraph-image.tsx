import { ImageResponse } from "next/og";
import { notFound } from "next/navigation";

import { getShopfrontTenant } from "./data";

export const alt = "Bukay shopfront booking page";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

type ShopfrontImageProps = {
  params: { slug: string };
};

export default async function OpenGraphImage({ params }: ShopfrontImageProps) {
  const tenant = await getShopfrontTenant(params.slug);

  // Keep the image route within the same tenant boundary as the rendered
  // shopfront. Otherwise a deleted or unknown slug would still advertise a
  // successful social-preview image even though its booking page is a 404.
  if (!tenant) {
    notFound();
  }

  const shopfrontName = tenant.name.trim() || "Bukay Shopfront";

  return new ImageResponse(
    <div
      style={{
        alignItems: "flex-start",
        background: "#020617",
        color: "#f8fafc",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        justifyContent: "center",
        padding: "96px",
        width: "100%",
      }}
    >
      <div style={{ color: "#6ee7b7", display: "flex", fontSize: 36, fontWeight: 700 }}>BUKAY</div>
      <div style={{ display: "flex", fontSize: 72, fontWeight: 700, marginTop: 28 }}>
        {shopfrontName}
      </div>
      <div style={{ color: "#cbd5e1", display: "flex", fontSize: 36, marginTop: 28 }}>
        Book an appointment online
      </div>
    </div>,
    size
  );
}
