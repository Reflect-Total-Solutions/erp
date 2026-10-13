"use client";

import React from "react";
import { useParams } from "next/navigation";
import { JobDetailsView } from "@/components/admin/views/job-details-view";

export default function JobDetailsPage() {
  const params = useParams();
  const id = typeof params?.id === "string" ? params.id : Array.isArray(params?.id) ? params.id[0] : "";

  return <JobDetailsView jobId={id} />;
}
