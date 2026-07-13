import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Square } from "lucide-react";

type Props = {
  onRecorded: (blob: Blob) => void;
  disabled?: boolean;
};

export function VoiceRecorder({ onRecorded, disabled }: Props) {
  const [recording, setRecording] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const startRecording = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      recorderRef.current = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(URL.createObjectURL(blob));
        onRecorded(blob);
        stopStream();
      };
      recorder.start();
      setRecording(true);
    } catch {
      setError("Microphone access is required to record a voice announcement.");
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    setRecording(false);
  };

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <p className="text-sm text-muted-foreground">
        Record a voice message now. Students will be able to play it in the mobile app.
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-2">
        {!recording ? (
          <Button type="button" variant="outline" disabled={disabled} onClick={() => void startRecording()}>
            <Mic className="mr-2 h-4 w-4" />
            Start recording
          </Button>
        ) : (
          <Button type="button" variant="destructive" disabled={disabled} onClick={stopRecording}>
            <Square className="mr-2 h-4 w-4" />
            Stop recording
          </Button>
        )}
      </div>
      {previewUrl && (
        <audio controls src={previewUrl} className="w-full">
          <track kind="captions" />
        </audio>
      )}
    </div>
  );
}
