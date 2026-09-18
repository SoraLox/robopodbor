import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { Credentials, User } from './types';

export const authKeys = { session: ['auth', 'session'] as const };

/**
 * Текущая сессия. 401 — это не ошибка загрузки, а «гость»:
 * возвращаем null, чтобы гостевой путь не ломался.
 */
export function useSession() {
  return useQuery({
    queryKey: authKeys.session,
    queryFn: async (): Promise<User | null> => {
      const { data, response } = await api.GET('/auth/session');
      if (response.status === 401) return null;
      return data ?? null;
    },
    staleTime: 60_000,
    retry: false,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: Credentials): Promise<User> => {
      const { data, error, response } = await api.POST('/auth/login', { body });
      if (response.status === 401) throw new Error('Неверная почта или пароль');
      if (error || !data) throw new Error('Не удалось войти');
      return data;
    },
    onSuccess: (user) => {
      queryClient.setQueryData(authKeys.session, user);
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useRegister() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: Credentials): Promise<User> => {
      const { data, error, response } = await api.POST('/auth/register', { body });
      if (response.status === 409) throw new Error('Такой пользователь уже зарегистрирован');
      if (error || !data) throw new Error('Не удалось зарегистрироваться');
      return data;
    },
    onSuccess: (user) => queryClient.setQueryData(authKeys.session, user),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await api.POST('/auth/logout');
    },
    onSuccess: () => {
      queryClient.setQueryData(authKeys.session, null);
      queryClient.removeQueries({ queryKey: ['projects'] });
    },
  });
}
