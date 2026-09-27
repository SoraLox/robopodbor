import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { solutions } from '@/mocks/fixtures';
import { robotPhoto } from '@/features/objects/previewImages';

const byId = (id: string) => solutions.find((s) => s.id === id)!;
const publicDir = path.resolve(__dirname, '../../../../public');

describe('previewImages', () => {
  it('берёт превью фото робота из каталога', () => {
    expect(robotPhoto(byId('AM0001'))).toBe('/robots_photo/preview/AM0001.webp');
    // у робота несколько фото — показываем первое
    expect(robotPhoto(byId('AV0001'))).toBe('/robots_photo/preview/AV0001_1.webp');
  });

  it('без фото блок не показываем — фото нет', () => {
    const noPhoto = solutions.find((s) => !s.photos?.length)!;
    expect(robotPhoto(noPhoto)).toBeUndefined();
  });

  it('у каждого фото из каталога есть файл превью', () => {
    const missing = solutions
      .map((s) => robotPhoto(s))
      .filter((src): src is string => !!src)
      .filter((src) => !existsSync(path.join(publicDir, src)));
    expect(missing).toEqual([]);
  });
});
