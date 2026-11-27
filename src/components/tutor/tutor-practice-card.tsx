"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { assessmentRequest, type Option } from "@/components/assessment/types";

type Practice = {
  id: string;
  status: "OFFERED" | "ACTIVE" | "DISMISSED" | "COMPLETED";
  hintCount: number;
  answerCount: number;
  indicatorCode: string;
  concept: string;
  code: string;
  question: string | null;
  options: Partial<Record<Option, string>> | null;
  events: {
    id: string;
    kind: "HINT" | "ANSWER";
    selectedOption: Option | null;
    isCorrect: boolean | null;
    feedback: string;
    sources: { materialTitle: string; fileName: string; pageNumber: number }[];
  }[];
};

export function practiceIdFrom(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const adaptive = (metadata as { adaptive?: { practiceId?: unknown } }).adaptive;
  return typeof adaptive?.practiceId === "string" ? adaptive.practiceId : null;
}

function learningFeedback(feedback: string) {
  // Riwayat latihan lama masih menyimpan istilah teknis; tampilkan isi bantuannya saja.
  return feedback
    .replaceAll("Jawaban belum tepat. ", "")
    .replaceAll(" Bukti mandiri dicatat pada profil.", "")
    .replaceAll(" Latihan berbantuan/ulang; EMA tidak berubah.", "")
    .replaceAll("\\*", "*")
    .trim();
}

export function TutorPracticeCard({ courseId, practiceId, onAnswered, onLockChange }: {
  courseId: string;
  practiceId: string;
  onAnswered?: () => void;
  onLockChange?: (practiceId: string, locked: boolean) => void;
}) {
  const [practice, setPractice] = useState<Practice | null>(null);
  const [option, setOption] = useState<Option | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const locked = useRef(false);
  const requestIds = useRef<Record<string, string>>({});
  const url = `/api/mahasiswa/courses/${courseId}/learning`;
  const lastAnswer = practice?.events.filter((event) => event.kind === "ANSWER").at(-1);
  const selectedOption = option ?? lastAnswer?.selectedOption ?? null;

  useEffect(() => {
    let active = true;
    assessmentRequest<Practice>(url, "POST", { operation: "practice-current", practiceId })
      .then((data) => {
        if (!active) return;
        setPractice(data);
        onLockChange?.(practiceId, data.status === "ACTIVE" && data.answerCount === 0);
      })
      .catch((cause) => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, [url, practiceId, onLockChange]);

  async function act(operation: string) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    const key = operation + (operation === "practice-answer" ? selectedOption : "");
    const requestId = requestIds.current[key] ?? crypto.randomUUID();
    requestIds.current[key] = requestId;
    try {
      const data = await assessmentRequest<Practice>(url, "POST", {
        operation, practiceId, requestId,
        ...(operation === "practice-answer" ? { selectedOption } : {}),
      });
      setPractice(data);
      onLockChange?.(practiceId, data.status === "ACTIVE" && data.answerCount === 0);
      if (operation === "practice-answer") {
        // Biarkan pilihan tetap tampak saat chat memproses pembahasan.
        onAnswered?.();
      }
      delete requestIds.current[key];
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Latihan belum dapat diproses.");
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  if (practice?.status === "DISMISSED" && !practice.answerCount && !practice.hintCount) return null;
  const finished = practice?.status === "COMPLETED" || practice?.status === "DISMISSED";

  return (
    <Card className="mt-5">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Latihan pemahaman</CardTitle>
          <Badge variant="secondary">{practice?.indicatorCode ?? "Memuat"}</Badge>
        </div>
        <CardDescription>{practice?.concept ?? "Menyiapkan soal dari bank latihan."}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        {!practice && !error && <Loader2 className="animate-spin" />}
        {practice?.status === "OFFERED" && (
          <p className="text-sm">Satu soal tersedia untuk menguji pemahaman indikator ini. Mulai saat Anda siap.</p>
        )}
        {practice?.question && (
          <div className="border-t pt-5">
            <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Soal latihan</span>
              <span aria-hidden="true">·</span><span>{practice.code}</span>
            </div>
            <h3 className="max-w-3xl text-lg font-semibold leading-relaxed sm:text-xl">{practice.question}</h3>
            <RadioGroup
              className="mt-6 gap-1"
              value={selectedOption ?? ""}
              onValueChange={(value) => setOption(value as Option)}
              disabled={busy || finished}
              aria-label={`Jawaban soal latihan ${practice.code}`}
            >
              {(["A", "B", "C", "D"] as Option[])
                .filter((letter) => practice.options?.[letter])
                .map((letter) => (
                  <label key={letter} htmlFor={`${practiceId}-${letter}`} className="flex cursor-pointer items-start gap-5 py-3 leading-6">
                    <RadioGroupItem
                      className="mt-1 border-foreground/60 data-checked:border-brand data-checked:bg-brand [&[data-checked]_span]:bg-black"
                      id={`${practiceId}-${letter}`}
                      value={letter}
                      disabled={busy || finished}
                    />
                    <span className="flex min-w-0 items-start gap-2">
                      <span className="shrink-0 font-semibold">{letter}.</span>
                      <span>{practice.options?.[letter]}</span>
                    </span>
                  </label>
                ))}
            </RadioGroup>
            {practice.answerCount === 0 && (
              <p className="mt-4 text-sm text-muted-foreground">
                {practice.hintCount > 0
                  ? "Jawaban pertama akan memperbarui Performa belajar. Benar dengan petunjuk bernilai 0,5; salah bernilai 0."
                  : "Jawaban pertama akan memperbarui Performa belajar. Benar tanpa petunjuk bernilai 1; salah bernilai 0."}
              </p>
            )}
          </div>
        )}
        {practice?.events.map((event) => (
          <Alert key={event.id}>
            <AlertDescription className="flex flex-col gap-2">
              <p className="font-medium">
                {event.kind === "HINT"
                  ? "Petunjuk untuk soal ini"
                  : event.isCorrect ? "Jawaban tepat" : "Jawaban belum tepat"}
              </p>
              {event.kind === "ANSWER" && (
                <p className="text-xs text-muted-foreground">Pilihan {event.selectedOption}</p>
              )}
              {event.kind === "HINT" && (
                <div className="prose prose-sm max-w-none text-foreground dark:prose-invert">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{learningFeedback(event.feedback)}</ReactMarkdown>
                </div>
              )}
              {event.kind === "HINT" && event.sources.length > 0 && (
                <p className="text-xs">Sumber: {event.sources.map((source) => `${source.fileName}, hal. ${source.pageNumber}`).join("; ")}</p>
              )}
            </AlertDescription>
          </Alert>
        ))}
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        {!practice && <Button variant="outline" disabled={busy} onClick={() => act("practice-current")}>Coba lagi</Button>}
        {practice?.status === "OFFERED" && (
          <>
            <Button disabled={busy} onClick={() => act("practice-accept")}>Mulai latihan</Button>
            <Button variant="ghost" disabled={busy} onClick={() => act("practice-dismiss")}>Lewati</Button>
          </>
        )}
        {practice?.status === "ACTIVE" && (
          <>
            <Button disabled={busy || !selectedOption} onClick={() => act("practice-answer")}>
              {busy && <Loader2 className="animate-spin" />}
              {practice.answerCount > 0 ? "Coba lagi" : "Kirim jawaban"}
            </Button>
            <Button variant="outline" disabled={busy || practice.hintCount >= 1} onClick={() => act("practice-hint")}>Minta Petunjuk</Button>
          </>
        )}
      </CardFooter>
    </Card>
  );
}
