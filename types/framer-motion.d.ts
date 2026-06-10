declare module "framer-motion" {
  import type { ComponentType, PropsWithChildren } from "react";

  type MotionProps = PropsWithChildren<Record<string, unknown>>;

  export const motion: {
    div: ComponentType<MotionProps>;
    span: ComponentType<MotionProps>;
  };
  export const AnimatePresence: ComponentType<MotionProps>;
}
