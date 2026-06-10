import {
  ArtifactCard,
  ArtifactPageLayout,
  EvidenceBlock,
  MetadataPanel,
  RiskBlock,
  TimelinePanel,
  TrustBlock,
} from "@/components/asset-intelligence";
import type { NormalizedArtifact } from "@/lib/artifacts/normalized-artifact";

type NormalizedArtifactPageProps = {
  artifact: NormalizedArtifact;
};

export function NormalizedArtifactPage({ artifact }: NormalizedArtifactPageProps) {
  return (
    <ArtifactPageLayout
      artifactType={artifact.purposeLabel}
      assetName={artifact.assetName}
      assetId={artifact.assetId}
      statusLabel={artifact.statusLabel}
      status={artifact.status}
      trustScore={artifact.trustScore}
      trustRating={artifact.trustRating}
      generatedAt={artifact.generatedAt}
      headerActions={artifact.headerActions}
      sections={{
        trustOverview: (
          <TrustBlock
            title="Trust Overview"
            rating={artifact.trustOverview.rating}
            score={artifact.trustOverview.score}
            scoreLabel={artifact.trustOverview.scoreLabel}
            status={artifact.trustOverview.status}
            rows={artifact.trustOverview.rows}
            actions={artifact.trustOverview.actions}
          />
        ),
        evidenceCoverage: (
          <EvidenceBlock
            title="Evidence Coverage"
            description="Public claims are limited to the evidence recorded for this artifact."
            coverage={artifact.evidenceCoverage.metric}
            sections={artifact.evidenceCoverage.sections}
          />
        ),
        riskSummary: (
          <RiskBlock
            title="Risk Summary"
            description="Only evidence-backed public risks are shown."
            risks={artifact.riskSummary.risks}
          />
        ),
        metadata: (
          <MetadataPanel
            title="Metadata"
            items={artifact.metadata.items}
            actions={artifact.metadata.actions || []}
          />
        ),
        timeline: (
          <TimelinePanel
            title="Timeline / History"
            description="Public history events attached to this software asset."
            status={artifact.timeline.status}
            items={artifact.timeline.items}
            emptyState={artifact.timeline.emptyState}
          />
        ),
        linkedArtifacts: (
          <ArtifactCard
            title="Linked Artifacts"
            description="Public proof links connected to this artifact."
            status={artifact.linkedArtifacts.status}
            metadata={artifact.linkedArtifacts.metadata}
            actions={artifact.linkedArtifacts.actions}
          />
        ),
      }}
    />
  );
}
