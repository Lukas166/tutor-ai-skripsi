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
  Save,
} from "lucide-react";
import { toast } from "sonner";
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
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
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
import { assessmentRequest, type Attempt, type Option } from "./types";

const OPTIONS: Option[] = ["A", "B", "C", "D", "E"];

export function PretestPage({ courseId }: { courseId: string }) {
  const router = useRouter();
  const url = `/api/mahasiswa/courses/${courseId}/pretest`;
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(0);
  const [unsaved, setUnsaved] = useState(0);
  const [index, setIndex] = useState(0);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const pending = useRef<Record<string, Option>>({});

  const persistLocal = useCallback((id: string) => {
    try {
      localStorage.setItem(`pretest:${id}`, JSON.stringify(pending.current));
    } catch {
      /* Database tetap menjadi penyimpanan utama. */
    }
    setUnsaved(Object.keys(pending.current).length);
  }, []);

  const save = useCallback(
    (id: string, questionId: string, selectedOption: Option) => {
      pending.current[questionId] = selectedOption;
      persistLocal(id);
      setSaving((value) => value + 1);
      // Antrean berurutan mencegah respons pilihan lama menimpa pilihan terbaru.
      queue.current = queue.current.then(async () => {
        try {
          await assessmentRequest(url, "PATCH", {
            attemptId: id,
            questionId,
            selectedOption,
          });
          if (pending.current[questionId] === selectedOption)
            delete pending.current[questionId];
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
        router.replace(`/mahasiswa/courses/${courseId}/pretest/result`);
        return;
      }
      if (data) {
        // Hanya draf yang belum mendapat konfirmasi server dipulihkan dari perangkat ini.
        let local: Record<string, Option> = {};
        try {
          local = JSON.parse(
            localStorage.getItem(`pretest:${data.id}`) || "{}",
          );
        } catch {
          /* Abaikan cache rusak. */
        }
        if (!local || typeof local !== "object" || Array.isArray(local))
          local = {};
        data.questions = data.questions.map((question) => {
          const option = local[question.id];
          if (OPTIONS.includes(option)) {
            save(data.id, question.id, option);
            return { ...question, selectedOption: option };
          }
          return question;
        });
      }
      setAttempt(data);
    },
    [courseId, router, save],
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
          : "Pre-test tidak dapat dimulai.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!attempt) return;
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
      router.replace(`/mahasiswa/courses/${courseId}/pretest/result`);
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : "Pengiriman gagal. Silakan coba lagi.",
      );
      setBusy(false);
    }
  }

  if (loading)
    return (
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  const answered =
    attempt?.questions.filter((question) => question.selectedOption).length ||
    0;
  const question = attempt?.questions[index];
  const allAnswered = Boolean(attempt && answered === attempt.totalQuestions);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <Button variant="ghost" asChild className="self-start">
        <Link href={`/mahasiswa/courses/${courseId}`}>
          <ArrowLeft data-icon="inline-start" />
          Kembali ke Mata Kuliah
        </Link>
      </Button>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            ASESMEN DIAGNOSTIK
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">
            Pre-test Kemampuan Awal
          </h1>
          <p className="mt-2 text-muted-foreground">
            Jawab sesuai pemahaman Anda saat ini. Hasil membantu mengenali
            kebutuhan belajar.
          </p>
        </div>
        <Badge variant="secondary">
          {attempt
            ? `${attempt.totalQuestions} soal · 5 opsi`
            : "Satu sesi pre-test final"}
        </Badge>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Pre-test belum dapat dibuka</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {!attempt ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="size-5" />
              Sebelum memulai
            </CardTitle>
            <CardDescription>
              Pre-test dapat diselesaikan satu kali untuk mata kuliah ini.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
            <p>
              Setiap soal mewakili satu indikator kemampuan. Pilih satu dari
              lima opsi dan jawab seluruh soal sebelum mengirim.
            </p>
            <p>
              Jawaban disimpan otomatis. Anda dapat kembali melanjutkan draf
              yang sama. Setelah difinalisasi, jawaban tidak dapat diubah.
            </p>
            <p>
              Kunci dan pembahasan belum ditampilkan karena paket soal digunakan
              kembali pada post-test.
            </p>
          </CardContent>
          <CardFooter>
            <Button onClick={start} disabled={busy}>
              {busy && <Loader2 className="animate-spin" />}Mulai Pre-test
              <ArrowRight data-icon="inline-end" />
            </Button>
          </CardFooter>
        </Card>
      ) : (
        question && (
          <>
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap justify-between gap-2 text-sm">
                <span>
                  {answered} dari {attempt.totalQuestions} soal terisi
                </span>
                <span
                  className="flex items-center gap-2 text-muted-foreground"
                  role="status"
                  aria-live="polite"
                >
                  {saving ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Menyimpan…
                    </>
                  ) : unsaved ? (
                    "Ada jawaban belum tersimpan"
                  ) : (
                    <>
                      <Save className="size-4" />
                      Semua jawaban tersimpan
                    </>
                  )}
                </span>
              </div>
              <Progress
                value={(answered / attempt.totalQuestions) * 100}
                aria-label="Progres jawaban pre-test"
              />
            </div>
            {saveError && (
              <Alert variant="destructive">
                <AlertTitle>Draf belum tersimpan ke server</AlertTitle>
                <AlertDescription className="flex flex-col gap-3">
                  <p>
                    {saveError} Pilihan Anda tetap disimpan pada perangkat ini.
                  </p>
                  <Button
                    variant="outline"
                    disabled={saving > 0}
                    onClick={() => {
                      for (const [id, option] of Object.entries(
                        pending.current,
                      ))
                        save(attempt.id, id, option);
                    }}
                  >
                    Simpan ulang jawaban
                  </Button>
                </AlertDescription>
              </Alert>
            )}
            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_240px]">
              <Card>
                <CardHeader>
                  <CardDescription>
                    Soal {index + 1} dari {attempt.totalQuestions}
                  </CardDescription>
                  <CardTitle className="text-xl leading-relaxed">
                    {question.question}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <FieldSet disabled={busy}>
                    <FieldLegend className="sr-only">
                      Pilih satu jawaban
                    </FieldLegend>
                    <RadioGroup
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
                    >
                      <FieldGroup>
                        {OPTIONS.map((option) => (
                          <FieldLabel
                            key={option}
                            htmlFor={`${question.id}-${option}`}
                          >
                            <Field orientation="horizontal">
                              <RadioGroupItem
                                value={option}
                                id={`${question.id}-${option}`}
                              />
                              <FieldContent>
                                <span className="font-semibold">
                                  Opsi {option}
                                </span>
                                <FieldDescription className="text-foreground">
                                  {question.options[option]}
                                </FieldDescription>
                              </FieldContent>
                            </Field>
                          </FieldLabel>
                        ))}
                      </FieldGroup>
                    </RadioGroup>
                  </FieldSet>
                </CardContent>
                <CardFooter className="flex justify-between gap-3">
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
                </CardFooter>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Navigasi soal</CardTitle>
                  <CardDescription>
                    Pilih nomor untuk meninjau jawaban.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <nav
                    aria-label="Nomor soal"
                    className="grid grid-cols-5 gap-2"
                  >
                    {attempt.questions.map((item, position) => (
                      <Button
                        key={item.id}
                        variant={
                          position === index
                            ? "default"
                            : item.selectedOption
                              ? "secondary"
                              : "outline"
                        }
                        size="icon"
                        aria-label={`Soal ${position + 1}${item.selectedOption ? ", sudah dijawab" : ", belum dijawab"}`}
                        aria-current={position === index ? "step" : undefined}
                        onClick={() => setIndex(position)}
                        disabled={busy}
                      >
                        {position + 1}
                      </Button>
                    ))}
                  </nav>
                  <p className="mt-4 text-xs text-muted-foreground">
                    {attempt.totalQuestions - answered} soal belum terisi. Anda
                    dapat meninjau kembali sebelum mengirim.
                  </p>
                </CardContent>
                <CardFooter>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        className="w-full"
                        disabled={
                          !allAnswered || saving > 0 || unsaved > 0 || busy
                        }
                      >
                        <Check data-icon="inline-start" />
                        {busy ? "Mengirim…" : "Kirim Jawaban"}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          Finalisasi pre-test?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          Seluruh {answered} jawaban sudah terisi. Setelah
                          dikirim, jawaban tidak dapat diubah dan profil
                          kemampuan awal akan terbentuk.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Tinjau Kembali</AlertDialogCancel>
                        <AlertDialogAction onClick={submit}>
                          Ya, Kirim Jawaban
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </CardFooter>
              </Card>
            </div>
          </>
        )
      )}
    </div>
  );
}
