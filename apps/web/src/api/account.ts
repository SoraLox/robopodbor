import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { authKeys, useSession } from './auth';
import type { PasswordChange, ProfilePatch, User } from './types';

/**
 * Личный кабинет: профиль, смена пароля и избранные роботы каталога.
 * Избранное хранится на сервере у пользователя, поэтому оно одно на все устройства.
 */

export const favoriteKeys = { all: ['favorites'] as const };

function messageOf(error: unknown, fallback: string) {
  return (error as { message?: string } | undefined)?.message ?? fallback;
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: ProfilePatch): Promise<User> => {
      const { data, error } = await api.PATCH('/auth/profile', { body });
      if (error || !data) throw new Error(messageOf(error, 'Не удалось сохранить профиль'));
      return data;
    },
    onSuccess: (user) => queryClient.setQueryData(authKeys.session, user),
  });
}

export function useChangePassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: PasswordChange) => {
      const { error, response } = await api.POST('/auth/password', { body });
      if (!response.ok) throw new Error(messageOf(error, 'Не удалось сменить пароль'));
    },
    // Дата смены пароля приходит в сессии — перечитываем её.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: authKeys.session }),
  });
}

/** id избранных решений; гостю — пустой список без запроса. */
export function useFavorites() {
  const { data: user } = useSession();
  return useQuery({
    queryKey: [...favoriteKeys.all, user?.id ?? 'guest'] as const,
    enabled: Boolean(user),
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await api.GET('/auth/favorites');
      if (error || !data) throw new Error('Не удалось загрузить избранное');
      return data;
    },
  });
}

/** Добавить или убрать робота из избранного; список обновляется сразу, без ожидания ответа. */
export function useToggleFavorite() {
  const queryClient = useQueryClient();
  const { data: user } = useSession();
  const key = [...favoriteKeys.all, user?.id ?? 'guest'] as const;
  return useMutation({
    mutationFn: async ({ id, favorite }: { id: string; favorite: boolean }): Promise<string[]> => {
      const params = { params: { path: { solutionId: id } } };
      const { data, error } = favorite
        ? await api.PUT('/auth/favorites/{solutionId}', params)
        : await api.DELETE('/auth/favorites/{solutionId}', params);
      if (error || !data) throw new Error(messageOf(error, 'Не удалось обновить избранное'));
      return data;
    },
    onMutate: async ({ id, favorite }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<string[]>(key);
      const rest = (previous ?? []).filter((item) => item !== id);
      queryClient.setQueryData(key, favorite ? [id, ...rest] : rest);
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSuccess: (list) => queryClient.setQueryData(key, list),
  });
}
