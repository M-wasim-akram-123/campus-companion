import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/_authenticated/exams/tests/new")({
  component: RedirectToSeriesNew,
});

function RedirectToSeriesNew() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate({ to: "/exams/series/new", replace: true });
  }, [navigate]);

  return <div className="p-8 text-center text-muted-foreground">Redirecting…</div>;
}
