"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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
import { Skeleton } from "@/components/ui/skeleton";
import { assessmentRequest } from "./types";

type Score = {
  percentage: number;
  correctCount: number;
  totalQuestions: number;
  status: string;
};
type Comparison = {
  completed: boolean;
  pretest: Score | null;
  posttest: Score | null;
  delta: number | null;
  topics: {
    id: string;
    code: string;
    title: string;
    preCorrect: number;
    postCorrect: number;
    indicators: {
      id: string;
      code: string;
      description: string;
      preCorrect: boolean;
      postCorrect: boolean;
    }[];
  }[];
};

export function LearningResults({ courseId }: { courseId: string }) {
  const [data, setData] = useState<Comparison | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    assessmentRequest<Comparison>(`/api/mahasiswa/courses/${courseId}/learning`)
      .then((result) => {
        if (active) setData(result);
      })
      .catch((cause) => {
        if (active) setError(cause.message);
      });
    return () => {
      active = false;
    };
  }, [courseId]);
  if (!data && !error) return <Skeleton className="h-96 w-full" />;
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <Button asChild variant="ghost" className="self-start">
        <Link href={`/mahasiswa/courses/${courseId}`}>
          Kembali ke Mata Kuliah
        </Link>
      </Button>
      <div>
        <h1 className="text-3xl font-bold">Hasil Pembelajaran</h1>
        <p className="mt-2 text-muted-foreground">
          Perbandingan pre-test dan post-test dengan paket soal yang sama.
        </p>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {data && !data.completed && (
        <Card>
          <CardHeader>
            <CardTitle>Rangkaian asesmen belum selesai</CardTitle>
            <CardDescription>
              Selesaikan pre-test, belajar dengan tutor, lalu kirim post-test
              untuk melihat perbandingan.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button asChild>
              <Link href={`/mahasiswa/courses/${courseId}`}>
                Lanjutkan Pembelajaran
              </Link>
            </Button>
          </CardFooter>
        </Card>
      )}
      {data?.completed && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { label: "Pre-test", score: data.pretest },
              { label: "Post-test", score: data.posttest },
            ].map(({ label, score }) => (
              <Card key={label}>
                <CardHeader>
                  <CardDescription>{label}</CardDescription>
                  <CardTitle>{score?.percentage.toFixed(1)}%</CardTitle>
                </CardHeader>
                <CardContent>
                  {score?.correctCount}/{score?.totalQuestions} jawaban benar
                </CardContent>
              </Card>
            ))}
            <Card>
              <CardHeader>
                <CardDescription>Perubahan nilai</CardDescription>
                <CardTitle>
                  {data.delta! > 0 ? "+" : ""}
                  {data.delta?.toFixed(1)} poin persentase
                </CardTitle>
              </CardHeader>
              <CardContent>
                Baseline dan EMA pembelajaran tetap terpisah dari hasil
                post-test.
              </CardContent>
            </Card>
          </div>
          {data.topics.map((topic) => (
            <Card key={topic.id}>
              <CardHeader>
                <CardTitle>{topic.title}</CardTitle>
                <CardDescription>
                  {topic.code} · Benar {topic.preCorrect}/
                  {topic.indicators.length} → {topic.postCorrect}/
                  {topic.indicators.length}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col gap-4">
                  {topic.indicators.map((indicator) => (
                    <li
                      key={indicator.id}
                      className="flex flex-wrap items-start justify-between gap-3"
                    >
                      <div className="max-w-3xl">
                        <p className="text-xs text-muted-foreground">
                          {indicator.code}
                        </p>
                        <p className="text-sm">{indicator.description}</p>
                      </div>
                      <Badge variant="secondary">
                        {indicator.preCorrect ? "Benar" : "Salah"} →{" "}
                        {indicator.postCorrect ? "Benar" : "Salah"}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </>
      )}
      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href={`/courses/${courseId}/tutor`}>
            Kembali ke AI Tutor
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={`/mahasiswa/courses/${courseId}/student-profile`}>
            Ringkasan Profil Belajar
          </Link>
        </Button>
      </div>
    </div>
  );
}
