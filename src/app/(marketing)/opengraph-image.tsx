import { ImageResponse } from "next/og";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";
export const alt = "PropLink · All your properties in one place";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const heroPath = path.join(process.cwd(), "public/landing/hero.jpg");
  const heroData = fs.readFileSync(heroPath);
  const heroBase64 = `data:image/jpeg;base64,${heroData.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          alignItems: "center",
          justifyContent: "flex-start",
          backgroundColor: "#0E1E45",
        }}
      >
        {/* Background hero image */}
        <img
          src={heroBase64}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
        {/* Navy gradient overlay */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            background:
              "linear-gradient(90deg, rgba(14, 30, 69, 0.96) 0%, rgba(14, 30, 69, 0.88) 55%, rgba(14, 30, 69, 0.45) 100%)",
          }}
        />
        {/* Content */}
        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            padding: "80px",
            maxWidth: "840px",
          }}
        >
          {/* Logo badge */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "16px",
              marginBottom: "36px",
            }}
          >
            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "12px",
                backgroundColor: "#0E1E45",
                border: "2px solid #C9A23A",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#C9A23A"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
            </div>
            <span
              style={{
                fontSize: "32px",
                fontWeight: 800,
                color: "#FFFFFF",
                letterSpacing: "-0.02em",
              }}
            >
              PropLink
            </span>
          </div>

          {/* Heading */}
          <div
            style={{
              fontSize: "64px",
              fontWeight: 800,
              lineHeight: 1.1,
              color: "#FFFFFF",
              letterSpacing: "-0.03em",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <span>All your properties</span>
            <span style={{ color: "#C9A23A", fontStyle: "italic" }}>
              in one place.
            </span>
          </div>

          {/* Tagline */}
          <p
            style={{
              fontSize: "24px",
              color: "rgba(255, 255, 255, 0.75)",
              marginTop: "24px",
              lineHeight: 1.4,
            }}
          >
            Track leases, rent and tenants without spreadsheets or WhatsApp threads.
          </p>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
