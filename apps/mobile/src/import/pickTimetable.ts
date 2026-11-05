import { ActionSheetIOS, Linking } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';

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

export type TimetablePickResult =
  { kind: 'file'; file: PickedFile } | { kind: 'cancelled' } | { kind: 'camera_denied' };

export function showTimetableSourceSheet(isLight: boolean): Promise<TimetablePickResult> {
  return new Promise((resolve) => {
    const options = ['Take a photo', 'Choose from Photos', 'Import a file', 'Cancel'];
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: 'Add your timetable',
        options,
        cancelButtonIndex: 3,
        userInterfaceStyle: isLight ? 'light' : 'dark',
      },
      async (index) => {
        try {
          let file: PickedFile | null = null;
          switch (index) {
            case 0: {
              const perm = await ImagePicker.getCameraPermissionsAsync();
              if (!perm.granted) {
                const req = await ImagePicker.requestCameraPermissionsAsync();
                if (!req.granted) {
                  resolve(req.canAskAgain ? { kind: 'cancelled' } : { kind: 'camera_denied' });
                  return;
                }
              }
              file = await pickFromCamera();
              break;
            }
            case 1:
              file = await pickFromPhotos();
              break;
            case 2:
              file = await pickFromFiles();
              break;
            default:
              resolve({ kind: 'cancelled' });
              return;
          }
          resolve(file ? { kind: 'file', file } : { kind: 'cancelled' });
        } catch {
          resolve({ kind: 'cancelled' });
        }
      },
    );
  });
}

export function openSettings() {
  void Linking.openSettings();
}
