import type { PlanDTO } from '@dialed/contracts';
import { randomUUID } from 'expo-crypto';
import { File, UploadType } from 'expo-file-system';
import type { ApiClient } from '../api/client';

export interface CalendarEvent {
  title: string;
  start: string;
  end: string;
  rrule?: string;
  calendar?: string;
}

/** Only files the pickers copied into this app's sandbox may be uploaded (deep links can't name others). */
export function isUploadableUri(uri: string, sandboxRoots: string[]): boolean {
  if (!uri.startsWith('file://') || uri.includes('/../')) return false;
  return sandboxRoots.some((root) => root && uri.startsWith(root));
}

/**
 * Upload a timetable file (image / PDF / DOCX) as multipart form data.
 * Uses the expo-file-system upload task (the legacy `uploadAsync` throws in SDK 54+);
 * aborting `signal` cancels the native request.
 */
export async function uploadTimetable(
  baseUrl: string,
  accessToken: string,
  fileUri: string,
  fileName: string,
  mimeType: string,
  signal?: AbortSignal,
): Promise<PlanDTO> {
  const key = randomUUID();
  const task = new File(fileUri).createUploadTask(`${baseUrl}/v1/imports/timetable`, {
    httpMethod: 'POST',
    uploadType: UploadType.MULTIPART,
    fieldName: 'file',
    mimeType,
    parameters: { fileName },
    sessionType: 'foreground',
    signal,
    headers: {
      authorization: `Bearer ${accessToken}`,
      'idempotency-key': key,
      'x-request-id': randomUUID(),
    },
  });
  const result = await task.uploadAsync();

  if (result.status >= 200 && result.status < 300) {
    return JSON.parse(result.body) as PlanDTO;
  }

  let err: { code?: string; message?: string } | undefined;
  try {
    err = (JSON.parse(result.body) as { error?: { code?: string; message?: string } }).error;
  } catch {
    /* non-JSON error body (e.g. a proxy 413) */
  }
  throw Object.assign(new Error(err?.message ?? 'Upload failed'), {
    code: err?.code ?? (result.status === 413 ? 'file_too_large' : 'server_error'),
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
