import { input, select } from "@inquirer/prompts";

export interface ProjectConfig {
  name: string;
  template: string;
  apiKey: string;
}

export const TEMPLATES = [
  { name: "cs-chatbot     - Customer support agent with RAG", value: "cs-chatbot" },
  { name: "blank          - Empty agent project", value: "blank" },
] as const;

export async function collectConfig(): Promise<ProjectConfig> {
  const name = await input({
    message: "Project name:",
    default: "my-agent",
    validate: (v) => {
      if (!v.trim()) return "Project name is required";
      if (!/^[a-z0-9][a-z0-9-]*$/.test(v))
        return "Use lowercase letters (a-z), numbers, and hyphens only. Korean/Unicode characters are not supported.";
      return true;
    },
  });

  const template = await select({
    message: "Template:",
    choices: [...TEMPLATES],
  });

  const apiKey = await input({
    message: "Schift API key (get one at schift.io):",
    validate: (v) => {
      if (!v.trim()) return "API key is required";
      if (!v.startsWith("sch_")) return "API key should start with 'sch_'";
      if (v.length < 20) return "API key looks too short. Check your key at schift.io/app.";
      return true;
    },
  });

  return { name, template, apiKey };
}
