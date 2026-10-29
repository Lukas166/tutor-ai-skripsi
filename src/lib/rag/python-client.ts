import { z } from "zod";

const chunkSchema = z.object({
  chunkId: z.string(), materialId: z.string(), sessionId: z.string(),
  pageNumber: z.number().int(), chunkIndex: z.number().int(), content: z.string(),
  similarity: z.number().finite(), materialTitle: z.string(),
  fileName: z.string(), sessionTitle: z.string(),
});

const preparedSchema = z.object({
  chunks: z.array(chunkSchema), systemInstruction: z.string(), prompt: z.string(),
});

export type RetrievedChunk = z.infer<typeof chunkSchema>;

export type PrepareRagInput = {
  course: { id: string; title: string; description: string | null };
  user: { name: string | null; role: string; academicLevel: string | null };
  question: string;
  selectedMaterialIds: string[];
  activeMaterials: { id: string; title: string; fileName: string }[];
  history: { senderType: string; content: string }[];
  responseMode: "chat" | "avatar";
  academicStyle: string;
};

type GenerateInput = { systemInstruction: string; prompt: string; signal?: AbortSignal };

async function pythonRequest(path: string, body: unknown, signal?: AbortSignal) {
  // Penghubung berjalan pada server LMS; browser tidak menerima token backend AI.
  const token = process.env.RAG_SERVICE_TOKEN;
  if (!token) throw new Error("RAG_SERVICE_TOKEN belum diatur.");
  const baseUrl = (process.env.RAG_SERVICE_URL || "http://127.0.0.1:8001").replace(/\/$/, "");
  const timeout = AbortSignal.timeout(120_000);
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Layanan RAG Python gagal (HTTP ${response.status}).`);
  }
  return response;
}

export async function preparePythonRag(input: PrepareRagInput, signal?: AbortSignal) {
  const response = await pythonRequest("/v1/prepare", input, signal);
  return preparedSchema.parse(await response.json());
}

export async function generatePythonAnswer(input: GenerateInput) {
  const response = await pythonRequest("/v1/generate", {
    systemInstruction: input.systemInstruction, prompt: input.prompt,
  }, input.signal);
  return z.object({ text: z.string() }).parse(await response.json()).text;
}

export async function getPythonAvatarExpression(input: {
  answer: string;
  question: string;
  responseMode: "chat" | "avatar";
}) {
  if (input.responseMode !== "avatar") return "neutral" as const;
  try {
    const response = await pythonRequest("/v1/avatar-expression", input);
    return z.object({ expression: z.enum(["neutral", "happy", "concerned"]) })
      .parse(await response.json()).expression;
  } catch {
    // Kegagalan metadata ekspresi tidak membatalkan jawaban RAG yang sudah berhasil.
    return "neutral" as const;
  }
}

const streamEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string() }),
  z.object({ type: z.literal("done") }),
  z.object({ type: z.literal("error"), error: z.string() }),
]);

export async function* streamPythonAnswer(input: GenerateInput): AsyncGenerator<string> {
  const response = await pythonRequest("/v1/generate/stream", {
    systemInstruction: input.systemInstruction, prompt: input.prompt,
  }, input.signal);
  if (!response.body) throw new Error("Streaming RAG Python kosong.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      // Satu event NDJSON atau karakter UTF-8 dapat terpotong di beberapa paket jaringan.
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      if (done && buffer.trim()) lines.push(buffer);
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = streamEventSchema.parse(JSON.parse(line));
        if (event.type === "error") throw new Error(event.error);
        if (event.type === "done") return;
        yield event.text;
      }
      if (done) throw new Error("Streaming RAG Python terputus sebelum selesai.");
    }
  } finally {
    // Pembatalan permintaan LMS juga menutup pembacaan respons internal dari Python.
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
