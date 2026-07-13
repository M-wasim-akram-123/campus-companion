import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

type Props = {
  testLabel: string;
  disabled?: boolean;
  publishing?: boolean;
  onConfirm: () => Promise<void>;
};

export function PublishTestDialog({ testLabel, disabled, publishing, onConfirm }: Props) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button disabled={disabled || publishing}>Publish results</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Publish test results?</AlertDialogTitle>
          <AlertDialogDescription>
            Students will see <strong>{testLabel}</strong> on the mobile app after publishing. Draft marks
            cannot be edited by exam staff once published.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => void onConfirm()} disabled={publishing}>
            {publishing ? "Publishing…" : "Publish"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
