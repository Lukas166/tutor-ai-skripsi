"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Field,
  FieldContent,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
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
    independent: boolean;
    feedback: string;
    scoreBefore: number | null;
    scoreAfter: number | null;
    sources: { materialTitle: string; fileName: string; pageNumber: number }[];
  }[];
};

export function practiceIdFrom(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const adaptive = (metadata as { adaptive?: { practiceId?: unknown } })
    .adaptive;
  return typeof adaptive?.practiceId === "string" ? adaptive.practiceId : null;
}

export function TutorPracticeCard({
  courseId,
  practiceId,
}: {
  courseId: string;
  practiceId: string;
}) {
  const [practice, setPractice] = useState<Practice | null>(null);
  const [option, setOption] = useState<Option | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const locked = useRef(false);
  const requestIds = useRef<Record<string, string>>({});
  const url = `/api/mahasiswa/courses/${courseId}/learning`;
  useEffect(() => {
    let active = true;
    assessmentRequest<Practice>(url, "POST", {
      operation: "practice-current",
      practiceId,
    })
      .then((data) => {
        if (active) setPractice(data);
      })
      .catch((cause) => {
        if (active) setError(cause.message);
      });
    return () => {
      active = false;
    };
  }, [url, practiceId]);

  async function act(operation: string) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    const key = operation + (operation === "practice-answer" ? option : "");
    const requestId = requestIds.current[key] ?? crypto.randomUUID();
    requestIds.current[key] = requestId;
    try {
      const data = await assessmentRequest<Practice>(url, "POST", {
        operation,
        practiceId,
        requestId,
        ...(operation === "practice-answer" ? { selectedOption: option } : {}),
      });
      setPractice(data);
      if (operation === "practice-answer" || operation === "practice-hint")
        setOption(null);
      delete requestIds.current[key];
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Latihan belum dapat diproses.",
      );
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  if (
    practice?.status === "DISMISSED" &&
    !practice.answerCount &&
    !practice.hintCount
  )
    return null;
  const finished =
    practice?.status === "COMPLETED" || practice?.status === "DISMISSED";
  return (
    <Card className="mt-5">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Latihan konsep</CardTitle>
          <Badge variant="secondary">
            {practice?.indicatorCode ?? "Memuat"}
          </Badge>
        </div>
        <CardDescription>
          {practice?.concept ?? "Menyiapkan latihan dari bank soal."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {!practice && !error && <Loader2 className="animate-spin" />}
        {practice?.status === "OFFERED" && (
          <p className="text-sm">
            Ingin mencoba satu soal untuk konsep ini? Anda dapat menerima atau
            melewatinya.
          </p>
        )}
        {practice?.question && (
          <>
            <FieldSet disabled={busy || finished}>
              <FieldLegend>{practice.question}</FieldLegend>
              <RadioGroup
                value={option ?? ""}
                onValueChange={(value) => setOption(value as Option)}
              >
                <FieldGroup>
                  {(["A", "B", "C", "D", "E"] as Option[])
                    .filter((letter) => practice.options?.[letter])
                    .map((letter) => (
                    <Field orientation="horizontal" key={letter}>
                      <RadioGroupItem
                        id={`${practiceId}-${letter}`}
                        value={letter}
                        disabled={busy || finished}
                      />
                      <FieldContent>
                        <FieldLabel htmlFor={`${practiceId}-${letter}`}>
                          {letter}. {practice.options?.[letter]}
                        </FieldLabel>
                      </FieldContent>
                    </Field>
                    ))}
                </FieldGroup>
              </RadioGroup>
            </FieldSet>
            <p className="text-xs text-muted-foreground">
              {practice.code} · {practice.answerCount} jawaban ·{" "}
              {practice.hintCount}/3 hint. Hanya jawaban pertama tanpa bantuan
              menjadi bukti mandiri.
            </p>
          </>
        )}
        {practice?.events.map((event) => (
          <Alert key={event.id}>
            <AlertDescription className="flex flex-col gap-2">
              <p className="font-medium">
                {event.kind === "HINT"
                  ? "Petunjuk"
                  : `Pilihan ${event.selectedOption} · ${event.independent ? "Mandiri" : "Berbantuan / ulang"}`}
              </p>
              <p className="whitespace-pre-wrap">{event.feedback}</p>
              {event.scoreAfter !== null && (
                <p>
                  EMA: {event.scoreBefore?.toFixed(2)} →{" "}
                  {event.scoreAfter.toFixed(2)}
                </p>
              )}
              {event.sources.length > 0 && (
                <p className="text-xs">
                  Sumber:{" "}
                  {event.sources
                    .map(
                      (source) =>
                        `${source.fileName}, hal. ${source.pageNumber}`,
                    )
                    .join("; ")}
                </p>
              )}
            </AlertDescription>
          </Alert>
        ))}
        {finished && (
          <p className="text-sm">
            Latihan selesai. Lanjutkan diskusi tentang konsep ini atau pilih
            materi berikutnya. Soal baru hanya berasal dari bank soal yang
            tersedia.
          </p>
        )}
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        {!practice && (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => act("practice-current")}
          >
            Coba Lagi
          </Button>
        )}
        {practice?.status === "OFFERED" && (
          <>
            <Button disabled={busy} onClick={() => act("practice-accept")}>
              Terima Latihan
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => act("practice-dismiss")}
            >
              Lewati
            </Button>
          </>
        )}
        {practice?.status === "ACTIVE" && (
          <>
            <Button
              disabled={busy || !option}
              onClick={() => act("practice-answer")}
            >
              {busy && <Loader2 className="animate-spin" />}Kirim Jawaban
            </Button>
            <Button
              variant="outline"
              disabled={busy || practice.hintCount >= 3}
              onClick={() => act("practice-hint")}
            >
              Minta Hint {Math.min(3, practice.hintCount + 1)}
            </Button>
            {(practice.answerCount > 0 || practice.hintCount > 0) && (
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => act("practice-dismiss")}
              >
                Akhiri Latihan
              </Button>
            )}
          </>
        )}
        {finished && (
          <Button asChild variant="outline">
            <Link href={`/mahasiswa/courses/${courseId}#materi`}>
              Lanjut ke Materi
            </Link>
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
