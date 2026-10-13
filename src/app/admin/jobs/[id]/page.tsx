import React, { Suspense } from "react";
import { JobDetailsView } from "@/components/admin/views/job-details-view";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function JobDetailsPage({ params }: PageProps) {
  const resolvedParams = await params;
  const id = resolvedParams.id || "";

  return (
    <Suspense
      fallback={
        <div className="flex h-48 items-center justify-center text-xs text-slate-500">
          Loading job details...
        </div>
      }
    >
      <JobDetailsView jobId={id} />
    </Suspense>
  );
}
