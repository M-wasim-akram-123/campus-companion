import { useEffect, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { runAcademicPromotionsIfDue } from "@/lib/student-promotion-api";
import { toast } from "sonner";

const PROMOTION_CHECK_KEY = "academic-promotion-last-check";

/** Runs session promotion once per calendar day when staff opens the app (from 1 July). */
export function useAcademicPromotionAutoRun() {
  const { user, roles } = useAuth();
  const ran = useRef(false);

  useEffect(() => {
    if (!user || ran.current) return;
    const isStaff = roles.some((r) =>
      ["super_admin", "registrar", "admission_officer"].includes(r),
    );
    if (!isStaff) return;

    const today = new Date().toISOString().slice(0, 10);
    const last = localStorage.getItem(PROMOTION_CHECK_KEY);
    if (last === today) return;

    ran.current = true;
    runAcademicPromotionsIfDue()
      .then((result) => {
        localStorage.setItem(PROMOTION_CHECK_KEY, today);
        if (result.closeResult?.closedYears > 0) {
          toast.success(
            `Year-end ledger closed for ${result.closeResult.closedYears} academic year(s). ${result.closeResult.studentsSnapshotted} student snapshot(s) saved.`,
          );
        }
        if (result.promoted > 0) {
          toast.success(
            `Promoted ${result.promoted} student(s) to the next year. ${result.inchargeSectionsMirrored} campus incharge assignment(s) mirrored.`,
          );
        }
        if (result.errors.length) {
          toast.error(
            `${result.errors.length} student(s) could not be promoted. Check Academic settings.`,
          );
        }
      })
      .catch(() => {
        // Silent — table may not exist until patch is applied.
      });
  }, [user, roles]);
}
