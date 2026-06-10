import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Analyze Software | VentureOS",
  description: "Run a VentureOS software review and see readiness, risk, and launch evidence.",
};

export default function AnalyzeCompatibilityPage() {
  redirect("/free-review");
}
