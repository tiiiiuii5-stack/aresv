import { NormalizedArtifactPage } from "@/components/artifacts/normalized-artifact-page";
import { normalizeCertificateArtifact } from "@/lib/artifacts/normalized-artifact";
import type {
  CertificateHistoryItem,
  CertificateVerificationResult,
  SignedCertificate,
} from "@/lib/certificates/types";

type PublicCertificateReportProps = {
  certificate: SignedCertificate;
  verification: CertificateVerificationResult;
  history: CertificateHistoryItem[];
};

export function PublicCertificateReport({ certificate, verification, history }: PublicCertificateReportProps) {
  return <NormalizedArtifactPage artifact={normalizeCertificateArtifact(certificate, verification, history)} />;
}
