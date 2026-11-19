/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      {
        source: "/landlord/profile",
        destination: "/landlord/settings",
        permanent: true,
      },
      {
        source: "/tenant/profile",
        destination: "/tenant/settings",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
