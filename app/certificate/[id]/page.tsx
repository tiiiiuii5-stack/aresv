import { notFound } from "next/navigation";

import { PublicCertificateReport } from "@/components/certificates/public-certificate-report";
import { loadCertificateHistory, loadPublicCertificate, verifyStoredCertificate } from "@/lib/certificates/certificateService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const certificate = await loadPublicCertificate(decodeURIComponent(id || ""));
  if (!certificate) return { title: "VentureOS Signed Evidence Receipt" };

  return {
    title: `${certificate.payload.softwareAsset.name} Signed Evidence Receipt | VentureOS`,
    description: `VentureOS Signed Evidence Receipt ${certificate.certificateId} for ${certificate.payload.softwareAsset.name}.`,
  };
}

export default async function VentureOSCertificatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const certificateId = decodeURIComponent(id || "");
  const certificate = await loadPublicCertificate(certificateId);
  if (!certificate) notFound();

  const [verification, history] = await Promise.all([
    verifyStoredCertificate(certificate.certificateId),
    loadCertificateHistory(certificate.certificateId),
  ]);

  return <PublicCertificateReport certificate={certificate} verification={verification} history={history} />;
}
