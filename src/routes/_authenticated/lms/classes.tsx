import { createFileRoute, redirect } from "@tanstack/react-router";

/** Class groups removed — each semester instance is the single program class. */
export const Route = createFileRoute("/_authenticated/lms/classes")({
  beforeLoad: () => {
    throw redirect({ to: "/lms/offerings" });
  },
  component: () => null,
});
