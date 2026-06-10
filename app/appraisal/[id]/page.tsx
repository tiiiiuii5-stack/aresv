import { notFound } from "next/navigation";

import { PublicAppraisalReport } from "@/components/appraisal/public-appraisal-report";
import { loadPublicSoftwareAppraisal } from "@/lib/appraisal/appraisalEngine";
import { loadLatestPublicCertificateForAppraisal } from "@/lib/certificates/certificateService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const appraisal = await loadPublicSoftwareAppraisal(decodeURIComponent(id || ""));
  if (!appraisal) {
    return {
      title: "VentureOS Verified Report",
    };
  }
  return {
    title: `${appraisal.appName} Verified System Report | VentureOS`,
    description: `${appraisal.appName} is graded ${appraisal.grade} with a ${appraisal.launchVerdict.replace(/_/g, " ")} launch verdict.`,
  };
}

export default async function AppraisalCertificatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const appraisal = await loadPublicSoftwareAppraisal(decodeURIComponent(id || ""));
  if (!appraisal) notFound();

  const certificate = await loadLatestPublicCertificateForAppraisal(appraisal.publicId);
  return <PublicAppraisalReport appraisal={appraisal} certificate={certificate} />;
}
