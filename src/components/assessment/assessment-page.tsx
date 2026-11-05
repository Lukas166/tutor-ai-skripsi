"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ClipboardList,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { assessmentRequest, type Attempt, type Option } from "./types";

const OPTIONS: Option[] = ["A", "B", "C", "D"];

export function AssessmentPage({
  courseId,
  kind = "pretest",
}: {
  courseId: string;
  kind?: "pretest" | "posttest";
}) {
  const router = useRouter();
  const label = kind === "posttest" ? "Post-test" : "Pre-test";
  const resultUrl = kind === "pretest"
    ? `/mahasiswa/courses/${courseId}/student-profile`
    : `/mahasiswa/courses/${courseId}/posttest/result`;
  const url = `/api/mahasiswa/courses/${courseId}/${kind}`;
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(0);
  const [index, setIndex] = useState(0);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const pending = useRef<Record<string, Option | null>>({});

  const persistLocal = useCallback((id: string) => {
    try {
      localStorage.setItem(`pretest:${id}`, JSON.stringify(pending.current));
    } catch {
      /* Database tetap menjadi penyimpanan utama. */
    }
  }, []);

  const save = useCallback(
    (id: string, questionId: string, selectedOption: Option | null) => {
      pending.current[questionId] = selectedOption;
      persistLocal(id);
      setSaving((value) => value + 1);
      queue.current = queue.current.then(async () => {
        try {
          await assessmentRequest(url, "PATCH", {
            attemptId: id,
            questionId,
            selectedOption,
          });
          if (pending.current[questionId] === selectedOption) {
            delete pending.current[questionId];
          }
          persistLocal(id);
          if (Object.keys(pending.current).length === 0) setSaveError("");
        } catch (cause) {
          setSaveError(
            cause instanceof Error ? cause.message : "Jawaban belum tersimpan.",
          );
        } finally {
          setSaving((value) => value - 1);
        }
      });
    },
    [persistLocal, url],
  );

  const acceptAttempt = useCallback(
    (data: Attempt | null) => {
      if (data?.status === "SUBMITTED") {
        router.replace(resultUrl);
        return;
      }
      if (data) {
        let local: Record<string, Option | null> = {};
        try {
          local = JSON.parse(
            localStorage.getItem(`pretest:${data.id}`) || "{}",
          );
        } catch {
          /* Abaikan cache rusak. */
        }
        if (!local || typeof local !== "object" || Array.isArray(local)) {
          local = {};
        }
        data.questions = data.questions.map((question) => {
          const option = local[question.id];
          if (
            Object.prototype.hasOwnProperty.call(local, question.id) &&
            (option === null ||
              (typeof option === "string" &&
                OPTIONS.includes(option) &&
                question.options[option]))
          ) {
            save(data.id, question.id, option);
            return { ...question, selectedOption: option };
          }
          return question;
        });
      }
      setAttempt(data);
    },
    [resultUrl, router, save],
  );

  useEffect(() => {
    let active = true;
    assessmentRequest<Attempt | null>(url)
      .then((data) => {
        if (active) acceptAttempt(data);
      })
      .catch((cause) => {
        if (active) setError(cause.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [url, acceptAttempt]);

  async function start() {
    setBusy(true);
    setError("");
    try {
      acceptAttempt(await assessmentRequest<Attempt>(url, "POST"));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : `${label} tidak dapat dimulai.`,
      );
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!attempt || attempt.questions.some((item) => !item.selectedOption)) return;
    setBusy(true);
    await queue.current;
    if (Object.keys(pending.current).length) {
      setBusy(false);
      toast.error("Simpan seluruh draf sebelum mengirim.");
      return;
    }
    try {
      await assessmentRequest(`${url}/submit`, "POST", {
        attemptId: attempt.id,
      });
      try {
        localStorage.removeItem(`pretest:${attempt.id}`);
      } catch {
        /* Hasil permanen sudah disimpan backend. */
      }
      router.replace(resultUrl);
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : "Pengiriman gagal. Silakan coba lagi.",
      );
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <Skeleton className="h-10 w-52" />
        <Skeleton className="h-[32rem] w-full" />
      </div>
    );
  }

  const answered =
    attempt?.questions.filter((item) => item.selectedOption).length || 0;
  const unanswered = (attempt?.totalQuestions || 0) - answered;
  const question = attempt?.questions[index];
  const allAnswered = Boolean(attempt && unanswered === 0);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <Button variant="ghost" asChild className="-ml-3 self-start">
        <Link href={`/mahasiswa/courses/${courseId}`}>
          <ArrowLeft data-icon="inline-start" />
          Kembali ke Mata Kuliah
        </Link>
      </Button>

      <div>
        <h1 className="text-3xl font-bold tracking-tight">{label}</h1>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>{label} belum dapat dibuka</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!attempt ? (
        <section className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm">
          <div className="flex flex-col gap-5 p-6">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-lg bg-brand/10 text-brand">
                <ClipboardList className="size-5" />
              </span>
              <h2 className="text-xl font-bold">Sebelum mulai</h2>
            </div>
            <p className="max-w-3xl leading-relaxed text-muted-foreground">
              Pilih satu jawaban per soal. Jawaban tersimpan otomatis dan tidak
              dapat diubah setelah dikirim.
            </p>
            <Button variant="brand" className="self-start" onClick={start} disabled={busy}>
              {busy && <Loader2 className="animate-spin" />}
              Mulai {label}
              <ArrowRight data-icon="inline-end" />
            </Button>
          </div>
        </section>
      ) : (
        question && (
          <>
            {saveError && (
              <Alert variant="destructive">
                <AlertTitle>Jawaban belum tersimpan</AlertTitle>
                <AlertDescription className="flex flex-col gap-3">
                  <p>{saveError} Pilihan Anda masih tersimpan di perangkat ini.</p>
                  <Button
                    variant="outline"
                    className="self-start"
                    disabled={saving > 0}
                    onClick={() => {
                      for (const [id, option] of Object.entries(
                        pending.current,
                      )) {
                        save(attempt.id, id, option);
                      }
                    }}
                  >
                    Simpan ulang
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_17rem]">
              <section className="min-w-0 px-1 py-1 sm:px-2">
                <div>
                  <div className="mb-3 flex min-h-8 items-center justify-between gap-4">
                    <p className="text-sm font-medium text-muted-foreground">
                      Soal {index + 1}
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={cn(
                        "text-destructive hover:bg-destructive/10 hover:text-destructive",
                        !question.selectedOption && "invisible",
                      )}
                      disabled={busy || !question.selectedOption}
                      aria-hidden={!question.selectedOption}
                      onClick={() => {
                        setAttempt((current) =>
                          current
                            ? {
                                ...current,
                                questions: current.questions.map((item) =>
                                  item.id === question.id
                                    ? { ...item, selectedOption: null }
                                    : item,
                                ),
                              }
                            : current,
                        );
                        save(attempt.id, question.id, null);
                      }}
                    >
                      Hapus pilihan
                    </Button>
                  </div>
                  <h2 className="max-w-3xl text-lg font-semibold leading-relaxed sm:text-xl">
                    {question.question}
                  </h2>
                  <RadioGroup
                    className="mt-6 gap-1"
                    value={question.selectedOption || ""}
                    onValueChange={(value) => {
                      const option = value as Option;
                      setAttempt((current) =>
                        current
                          ? {
                              ...current,
                              questions: current.questions.map((item) =>
                                item.id === question.id
                                  ? { ...item, selectedOption: option }
                                  : item,
                              ),
                            }
                          : current,
                      );
                      save(attempt.id, question.id, option);
                    }}
                    aria-label={`Jawaban soal ${index + 1}`}
                    disabled={busy}
                  >
                    {OPTIONS.filter((option) => question.options[option]).map(
                      (option) => {
                        return (
                          <label
                            key={option}
                            htmlFor={`${question.id}-${option}`}
                            className="flex cursor-pointer items-start gap-5 py-3 leading-6"
                          >
                            <RadioGroupItem
                              className="mt-1 border-foreground/60 data-checked:border-brand data-checked:bg-brand [&[data-checked]_span]:bg-black"
                              value={option}
                              id={`${question.id}-${option}`}
                            />
                            <span className="flex min-w-0 items-start gap-2">
                              <span className="shrink-0 font-semibold">{option}.</span>
                              <span className="leading-6">
                                {question.options[option]}
                              </span>
                            </span>
                          </label>
                        );
                      },
                    )}
                  </RadioGroup>
                </div>

                <div className="mt-8 flex justify-between gap-3">
                  <Button
                    variant="outline"
                    disabled={index === 0 || busy}
                    onClick={() => setIndex(index - 1)}
                  >
                    <ArrowLeft data-icon="inline-start" />
                    Sebelumnya
                  </Button>
                  <Button
                    variant="outline"
                    disabled={index === attempt.questions.length - 1 || busy}
                    onClick={() => setIndex(index + 1)}
                  >
                    Berikutnya
                    <ArrowRight data-icon="inline-end" />
                  </Button>
                </div>
              </section>

              <aside className="rounded-xl border border-border/70 bg-card p-5 shadow-sm lg:sticky lg:top-6">
                <div className="flex flex-col gap-5">
                  <div className="flex items-baseline justify-between gap-3">
                    <h2 className="font-bold">Daftar soal</h2>
                    <span className="text-sm font-semibold tabular-nums">
                      {answered}/{attempt.totalQuestions}
                    </span>
                  </div>
                  <nav aria-label="Nomor soal" className="grid grid-cols-5 gap-2">
                    {attempt.questions.map((item, position) => (
                      <Button
                        key={item.id}
                        variant={position === index ? "brand" : "outline"}
                        size="icon-sm"
                        className={cn(
                          item.selectedOption &&
                            position !== index &&
                            "border-foreground/60",
                          !item.selectedOption && position !== index &&
                            "border-dashed text-muted-foreground",
                        )}
                        aria-label={`Soal ${position + 1}${item.selectedOption ? ", sudah dijawab" : ", belum dijawab"}`}
                        aria-current={position === index ? "step" : undefined}
                        onClick={() => setIndex(position)}
                        disabled={busy}
                      >
                        {position + 1}
                      </Button>
                    ))}
                  </nav>

                  <div className="flex flex-col gap-2 text-xs text-muted-foreground">
                    <p className="flex items-center gap-2">
                      <span className="size-2 rounded-full border border-foreground/60" />
                      Sudah dijawab
                    </p>
                    <p className="flex items-center gap-2">
                      <span className="size-2 rounded-full border border-dashed border-border" />
                      Belum dijawab
                    </p>
                  </div>

                  <Button
                    variant="brand"
                    className="w-full"
                    disabled={!allAnswered || busy}
                    onClick={submit}
                  >
                    {busy ? (
                      <Loader2 data-icon="inline-start" className="animate-spin" />
                    ) : (
                      <Check data-icon="inline-start" />
                    )}
                    {busy ? "Mengirim…" : "Kirim Jawaban"}
                  </Button>
                </div>
              </aside>
            </div>
          </>
        )
      )}
    </div>
  );
}
