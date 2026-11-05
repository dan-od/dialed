import type { PlanDTO } from '@dialed/contracts';
import { randomUUID } from 'expo-crypto';
import { uploadAsync } from 'expo-file-system';
import type { ApiClient } from '../api/client';

export interface CalendarEvent {
  title: string;
  start: string;
  end: string;
  rrule?: string;
  calendar?: string;
}

/**
 * Upload a timetable file (image / PDF / DOCX) via multipart form.
 * expo-file-system.uploadAsync handles the multipart encoding natively.
 */
export async function uploadTimetable(
  baseUrl: string,
  accessToken: string,
  fileUri: string,
  fileName: string,
  mimeType: string,
): Promise<PlanDTO> {
  const key = randomUUID();
  const result = await uploadAsync(`${baseUrl}/v1/imports/timetable`, fileUri, {
    httpMethod: 'POST',
    uploadType: 1 as 1,
    fieldName: 'file',
    mimeType,
    parameters: { fileName },
    headers: {
      authorization: `Bearer ${accessToken}`,
      'idempotency-key': key,
      'x-request-id': randomUUID(),
    },
  });

  if (result.status >= 200 && result.status < 300) {
    return JSON.parse(result.body) as PlanDTO;
  }

  const body = result.body ? JSON.parse(result.body) : null;
  const err = (body as { error?: { code?: string; message?: string } })?.error;
  throw Object.assign(new Error(err?.message ?? 'Upload failed'), {
    code: err?.code ?? 'server_error',
    status: result.status,
  });
}

export async function importCalendar(client: ApiClient, events: CalendarEvent[]): Promise<PlanDTO> {
  return client.request<PlanDTO>(
    'POST',
    '/v1/imports/calendar',
    { events },
    {
      headers: { 'idempotency-key': randomUUID() },
    },
  );
}
