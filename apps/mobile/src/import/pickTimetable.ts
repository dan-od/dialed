import { ActionSheetIOS, Linking } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { aiName } from '../config';

export interface PickedFile {
  uri: string;
  name: string;
  mimeType: string;
}

const IMAGE_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  heic: 'image/heic',
  heif: 'image/heif',
};

async function pickFromCamera(): Promise<PickedFile | null> {
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    quality: 0.9,
  });
  if (result.canceled || !result.assets[0]) return null;
  const asset = result.assets[0];
  const ext = asset.uri.split('.').pop()?.toLowerCase() ?? 'jpeg';
  return {
    uri: asset.uri,
    name: asset.fileName ?? `timetable.${ext}`,
    mimeType: asset.mimeType ?? IMAGE_MIME[ext] ?? 'image/jpeg',
  };
}

async function pickFromPhotos(): Promise<PickedFile | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.9,
  });
  if (result.canceled || !result.assets[0]) return null;
  const asset = result.assets[0];
  const ext = asset.uri.split('.').pop()?.toLowerCase() ?? 'jpeg';
  return {
    uri: asset.uri,
    name: asset.fileName ?? `timetable.${ext}`,
    mimeType: asset.mimeType ?? IMAGE_MIME[ext] ?? 'image/jpeg',
  };
}

const DOC_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
];

async function pickFromFiles(): Promise<PickedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: DOC_TYPES,
    copyToCacheDirectory: true,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  return {
    uri: asset.uri,
    name: asset.name,
    mimeType: asset.mimeType ?? 'application/octet-stream',
  };
}

export type TimetableSource = 'camera' | 'photos' | 'files';

export type TimetablePickResult =
  | { kind: 'file'; file: PickedFile; source: TimetableSource }
  | { kind: 'cancelled' }
  | { kind: 'camera_denied' };

/** Opens one source directly (Retake goes straight back to the camera). */
export async function pickTimetableFrom(source: TimetableSource): Promise<TimetablePickResult> {
  try {
    let file: PickedFile | null = null;
    if (source === 'camera') {
      const perm = await ImagePicker.getCameraPermissionsAsync();
      if (!perm.granted) {
        const req = await ImagePicker.requestCameraPermissionsAsync();
        if (!req.granted)
          return req.canAskAgain ? { kind: 'cancelled' } : { kind: 'camera_denied' };
      }
      file = await pickFromCamera();
    } else if (source === 'photos') {
      file = await pickFromPhotos();
    } else {
      file = await pickFromFiles();
    }
    return file ? { kind: 'file', file, source } : { kind: 'cancelled' };
  } catch {
    return { kind: 'cancelled' };
  }
}

const SHEET_SOURCES: TimetableSource[] = ['camera', 'photos', 'files'];

export function showTimetableSourceSheet(isLight: boolean): Promise<TimetablePickResult> {
  return new Promise((resolve) => {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: 'Add your timetable',
        message: `${aiName()} reads it once and shows you what it found. Nothing is added until you approve.`,
        options: ['Take a photo', 'Choose from Photos', 'Import a file (PDF or Word)', 'Cancel'],
        cancelButtonIndex: 3,
        userInterfaceStyle: isLight ? 'light' : 'dark',
      },
      (index) => {
        const source = SHEET_SOURCES[index];
        if (!source) {
          resolve({ kind: 'cancelled' });
          return;
        }
        void pickTimetableFrom(source).then(resolve);
      },
    );
  });
}

export function openSettings() {
  void Linking.openSettings();
}
