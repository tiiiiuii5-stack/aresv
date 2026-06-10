import { ControlPlane } from "@/lib/control-plane/kernel";
import { PrismaControlPlaneReactionSink, PrismaControlPlaneStore } from "@/lib/control-plane/store";

export * from "@/lib/control-plane/kernel";
export * from "@/lib/control-plane/store";

export function createControlPlane() {
  return new ControlPlane(new PrismaControlPlaneStore(), new PrismaControlPlaneReactionSink());
}

export const controlPlane = createControlPlane();
