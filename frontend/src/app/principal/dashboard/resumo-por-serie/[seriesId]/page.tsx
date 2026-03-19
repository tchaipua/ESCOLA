'use client';

import { useCallback } from 'react';
import { useParams } from 'next/navigation';
import StudentsDetailPanel, {
  type StudentApiRecord,
  type StudentsFetchResult,
  mapApiStudentToCard,
} from '@/app/principal/dashboard/components/students-detail-panel';

const API_BASE_URL = 'http://localhost:3001/api/v1';

type SeriesStudentsResponse = {
  seriesId: string;
  seriesName?: string | null;
  students?: StudentApiRecord[] | null;
};

export default function DashboardSeriesStudentsPage() {
  const params = useParams();
  const seriesId = params?.seriesId;

  const fetchStudents = useCallback(
    async (token: string): Promise<StudentsFetchResult> => {
      if (!seriesId) {
        throw new Error('Série inválida.');
      }
      const response = await fetch(`${API_BASE_URL}/series-classes/series/${seriesId}/students`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.message || 'Não foi possível carregar os alunos desta série.');
      }

      const payload = (data as SeriesStudentsResponse) ?? null;
      const normalizedStudents = Array.isArray(payload?.students)
        ? payload.students.map(mapApiStudentToCard)
        : [];

      const sortedStudents = [...normalizedStudents].sort((a, b) => a.name.localeCompare(b.name));

      return {
        entityName: payload?.seriesName ?? '',
        students: sortedStudents,
      };
    },
    [seriesId],
  );

  return (
    <StudentsDetailPanel
      fetchStudents={fetchStudents}
      headerLabel="Resumo geral"
      headerTitle="Alunos da série"
      headerDescription={(entityName) =>
        `Lista completa dos alunos vinculados a ${entityName || 'esta série'}. Utilize a pesquisa para encontrar rapidamente um aluno pelo nome.`
      }
      highlightLabel="SÉRIE SELECIONADA"
      entityFallbackLabel="SÉRIE NÃO INFORMADA"
    />
  );
}
