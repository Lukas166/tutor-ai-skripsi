-- CreateTable
CREATE TABLE "tutor_prompt_config" (
    "id" TEXT NOT NULL,
    "academicLevel" TEXT NOT NULL,
    "responseMode" TEXT NOT NULL,
    "promptContent" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT true,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tutor_prompt_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tutor_prompt_config_academicLevel_responseMode_key" ON "tutor_prompt_config"("academicLevel", "responseMode");
