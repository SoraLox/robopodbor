import { AppShell } from '@/app/AppShell';
import { SectionHeading } from '@/shared/components';

const SECTIONS = [
  {
    title: '1. Какие данные мы собираем',
    text: 'Имя, рабочую почту и организацию — при регистрации. Параметры объекта, которые вы вводите в расчёт: площадь, смены, штат. Технические данные о посещении сайта — для статистики и защиты от сбоев.',
  },
  {
    title: '2. Зачем нам эти данные',
    text: 'Чтобы построить расчёт, сохранить черновик на 30 дней и показать историю проектов в личном кабинете. Мы не используем эти данные для рекламы и не продаём их.',
  },
  {
    title: '3. Кто видит расчёт',
    text: 'Только вы и участники вашей организации, если вы дали им доступ. Поставщикам оборудования расчёты не передаются ни в каком виде.',
  },
  {
    title: '4. Хранение и удаление',
    text: 'Черновик расчёта хранится 30 дней с момента последнего изменения, затем удаляется автоматически. Данные аккаунта хранятся, пока аккаунт активен. Удалить аккаунт и все данные можно по запросу на почту ниже.',
  },
  {
    title: '5. Передача третьим лицам',
    text: 'Мы не передаём персональные данные третьим лицам, кроме случаев, когда этого требует закон. Обезличенная статистика (например, средняя окупаемость по отрасли) может использоваться в публичных материалах.',
  },
  {
    title: '6. Связь с нами',
    text: 'По вопросам о персональных данных пишите на privacy@robopodbor.ru — ответим в течение пяти рабочих дней.',
  },
];

export function PrivacyPage() {
  return (
    <AppShell>
      <div className="px-5 py-8 sm:px-8">
        <div className="mb-8 max-w-[640px]">
          <SectionHeading size="h1">Политика конфиденциальности</SectionHeading>
          <p className="mt-3 text-[15px] leading-[1.6] text-muted-foreground">
            Действует с 1 января 2026 года. Здесь простыми словами написано,
            какие данные мы собираем и что с ними делаем.
          </p>
        </div>

        <div className="grid gap-4 max-w-[760px]">
          {SECTIONS.map((section) => (
            <div key={section.title} className="rounded-2xl border border-border bg-background p-6">
              <h3 className="font-heading text-[16px] font-semibold">{section.title}</h3>
              <p className="mt-2.5 text-[14px] leading-[1.6] text-muted-foreground">
                {section.text}
              </p>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}

export default PrivacyPage;
