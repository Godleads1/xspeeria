/**
 * Profile photo and banner picking (ADR-011). The picked image is cropped by the system
 * picker, then re-encoded as JPEG at a fixed size, which also drops EXIF metadata such as
 * GPS location. The server must re-encode and moderate again on upload.
 */

import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

export type PhotoKind = 'avatar' | 'banner';

const SHAPE: Record<PhotoKind, { aspect: [number, number]; width: number }> = {
  avatar: { aspect: [1, 1], width: 512 },
  banner: { aspect: [3, 1], width: 1200 },
};

export type PickOutcome = { kind: 'picked'; uri: string } | { kind: 'cancelled' } | { kind: 'denied' };

export async function pickPhoto(kind: PhotoKind): Promise<PickOutcome> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return { kind: 'denied' };
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: SHAPE[kind].aspect,
    quality: 1,
    exif: false,
  });
  if (res.canceled || !res.assets[0]) return { kind: 'cancelled' };
  const ctx = ImageManipulator.manipulate(res.assets[0].uri);
  ctx.resize({ width: SHAPE[kind].width });
  const image = await ctx.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
  return { kind: 'picked', uri: saved.uri };
}

/** ID document photo for a date-of-birth check. Not stored on the device after submission. */
export async function pickDocument(): Promise<PickOutcome> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return { kind: 'denied' };
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9, exif: false });
  if (res.canceled || !res.assets[0]) return { kind: 'cancelled' };
  return { kind: 'picked', uri: res.assets[0].uri };
}
