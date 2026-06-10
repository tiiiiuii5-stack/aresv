import { NormalizedArtifactPage } from "@/components/artifacts/normalized-artifact-page";
import { normalizeAppraisalArtifact } from "@/lib/artifacts/normalized-artifact";
import type { SoftwareAppraisal } from "@/lib/appraisal/types";
import type { SignedCertificate } from "@/lib/certificates/types";

type PublicAppraisalReportProps = {
  appraisal: SoftwareAppraisal;
  certificate: SignedCertificate | null;
};

export function PublicAppraisalReport({ appraisal, certificate }: PublicAppraisalReportProps) {
  return <NormalizedArtifactPage artifact={normalizeAppraisalArtifact(appraisal, certificate)} />;
}
