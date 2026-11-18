import React, { Suspense } from "react";
import { JobDetailsView } from "@/components/admin/views/job-details-view";

interface PageProps {
  params: Promise<{ id: string }>;
}

async function JobDetailsContent({ params }: PageProps) {
  const { id } = await params;
  return <JobDetailsView jobId={id || ""} />;
}

export default function JobDetailsPage({ params }: PageProps) {
  return (
    <Suspense
      fallback={
        <div className="flex h-48 items-center justify-center text-xs text-slate-500">
          Loading job details...
        </div>
      }
    >
      <JobDetailsContent params={params} />
    </Suspense>
  );
}
