import fs from 'node:fs';
import path from 'node:path';

export type TchaE2eState = {
  generatedAt: string;
  databaseUrl: string;
  tenantId: string | null;
  tenantName: string;
  admin: {
    email: string;
    password: string;
  };
  teacher: {
    email: string;
    password: string;
  };
  proof: {
    title: string;
    lessonItemId: string;
    lessonDate: string;
    lessonDateLabel: string;
    lesson: {
      subjectName: string;
      seriesName: string;
      className: string;
      startTime: string;
      endTime: string;
    };
  };
  studentA: {
    id: string;
    name: string;
    email: string;
    score: number;
  };
  studentB: {
    id: string;
    name: string;
    email: string;
    score: number;
  };
  guardianA: {
    id: string;
    name: string;
    email: string;
    studentId: string;
    studentName: string;
    score: number;
  };
  guardianB: {
    id: string;
    name: string;
    email: string;
    studentId: string;
    studentName: string;
    score: number;
  };
  uiEdits: {
    attendanceNote: string;
    score: string;
    scoreNumeric: number;
    remarks: string;
  };
};

let cachedState: TchaE2eState | null = null;

export function loadTchaE2eState(): TchaE2eState {
  if (cachedState) {
    return cachedState;
  }

  const statePath = path.resolve(process.cwd(), 'tests', 'e2e', '.artifacts', 'tcha-e2e-state.json');
  if (!fs.existsSync(statePath)) {
    throw new Error(
      `Arquivo de estado do E2E não encontrado em ${statePath}. Rode "npm run test:e2e:prepare" antes dos testes.`,
    );
  }

  cachedState = JSON.parse(fs.readFileSync(statePath, 'utf8')) as TchaE2eState;
  return cachedState;
}
