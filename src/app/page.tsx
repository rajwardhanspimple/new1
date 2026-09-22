import { Uploader } from "@/components/uploader";

export const dynamic = "force-dynamic";

export default function HomePage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  return <Uploader initialError={searchParams.error} />;
}
