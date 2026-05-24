export type PiiPreset = "strong" | "default" | "full";

export interface RedactionEntity {
  type: string;
  text: string;
  start: number;
  end: number;
  score: number;
}

export interface RedactRequest {
  text: string;
  preset?: PiiPreset;
}

export interface RedactResponse {
  redactionSessionId: string;
  originalHash: string;
  redactedHash: string;
  redactedText: string;
  entities: RedactionEntity[];
  summary: Record<string, number>;
  canIngest: boolean;
  dataUse: string | null;
}

export interface IngestRequest {
  redactionSessionId: string;
  redactedText: string;
  title?: string;
}

export interface IngestResponse {
  bucketId: string;
  bucketName: string;
  bucketCreated: boolean;
  jobs: Array<{
    job_id?: string;
    document_id?: string;
    file_name?: string;
    status?: string;
  }>;
  safetyTrace: {
    redactedBeforeIngest: true;
    redactionSessionId: string;
    entityCount: number;
  };
}

export interface AskRequest {
  question: string;
  bucketId?: string;
}

export interface AskResponse {
  answer: string;
  sources: unknown[];
  disclaimer: string;
  safetyTrace: {
    bucketContainsRedactedTextOnly: boolean;
    redactionSessionId: string | null;
  };
}
