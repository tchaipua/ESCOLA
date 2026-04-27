'use client';

import { useCallback } from 'react';
import { useParams } from 'next/navigation';
import StudentsDetailPanel, {
  mapApiStudentToCard,
  type StudentApiRecord,
  type StudentsFetchResult,
} from '@/app/principal/dashboard/components/students-detail-panel';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001/api/v1';

type SeriesClassStudentsResponse = {
  classId: string | null;
  className?: string | null;
  seriesId?: string | null;
  seriesName?: string | null;
  students?: StudentApiRecord[] | null;
};

export default function ResumoTurmaDetailPage() {
  const params = useParams();
  const seriesClassId = params?.seriesClassId;

  const fetchStudents = useCallback(
    async (token: string): Promise<StudentsFetchResult> => {
      if (!seriesClassId) {
        throw new Error('Turma inválida.');
      }

      const response = await fetch(`${API_BASE_URL}/series-classes/${seriesClassId}/students`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.message || 'Não foi possível carregar os alunos desta turma.');
      }

      const payload = (data as SeriesClassStudentsResponse) ?? null;
      const normalized = Array.isArray(payload?.students)
        ? payload.students.map(mapApiStudentToCard)
        : [];
      const sorted = [...normalized].sort((a, b) => a.name.localeCompare(b.name));

      return {
        entityName: payload?.className ?? 'TURMA NÃO INFORMADA',
        students: sorted,
      };
    },
    [seriesClassId],
  );

  return (
    <StudentsDetailPanel
      fetchStudents={fetchStudents}
      headerLabel="Resumo por turma"
      headerTitle="Alunos da turma"
      headerDescription={(entityName) =>
        `Lista completa dos alunos vinculados a ${entityName}. Utilize a pesquisa para encontrar rapidamente um aluno pelo nome.`
      }
      highlightLabel="TURMA SELECIONADA"
      entityFallbackLabel="TURMA NÃO INFORMADA"
    />
  );
}
