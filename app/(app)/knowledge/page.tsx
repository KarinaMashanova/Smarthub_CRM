'use client'

import { useState, useEffect, useCallback } from 'react'

interface Section {
  title: string
  color: string
  dot: string
  headerColor: string
  items: { label: string; desc: string }[]
}

const SECTIONS: Section[] = [
  {
    title: 'Заказы',
    color: 'bg-blue-50 border-blue-100',
    dot: 'bg-blue-400',
    headerColor: 'border-blue-100',
    items: [
      { label: 'Источник данных', desc: 'LiveSklad API. Заказы обновляются автоматически каждые 15 минут через дельта-синк по lastAction за последний час.' },
      { label: 'Фильтры', desc: 'Период, салон, менеджер, мастер, статус, оплата, маржа, позиции, возвраты и удалённые заказы. Все фильтры комбинируются.' },
      { label: 'Маржа и выручка', desc: 'Маржа = выручка минус себестоимость позиций. Возвраты и удалённые заказы не участвуют в выручке, марже, ЗП и бонусах.' },
      { label: 'ВМР', desc: 'ВМР — заказ с маржей от 4 000 ₽. Авто-бонус 20% от маржи создаётся в БД как «Бонус / За ВМР» и пересчитывается при обновлении заказа.' },
      { label: 'Бонус за наличность', desc: 'Если заказ оплачен только наличными, создаётся авто-бонус 2,5% от маржи как «Бонус / За наличность».' },
      { label: 'ЗП день в день', desc: 'Плашка появляется только если мастер = менеджеру, заказ активный, не возврат, есть позиции и маржа не ниже 4 000 ₽. По одному заказу оплату за работу можно забрать один раз.' },
      { label: 'Доступ', desc: 'Менеджер видит заказы своего магазина, где он указан менеджером заказа. Администратор видит все заказы.' },
    ],
  },
  {
    title: 'Продажи',
    color: 'bg-cyan-50 border-cyan-100',
    dot: 'bg-cyan-400',
    headerColor: 'border-cyan-100',
    items: [
      { label: 'Источник данных', desc: 'LiveSklad API. Продажи обновляются автоматически каждые 15 минут через дельта-синк за последний час.' },
      { label: 'Фильтры', desc: 'Период, продавец, салон, тип оплаты, наличие позиций и поиск по номеру/продавцу.' },
      { label: 'Маржа', desc: 'Маржа = выручка минус себестоимость позиций. Продажи без позиций отдельно видны в фильтре и статистике.' },
      { label: 'Бонус за наличность', desc: 'Если продажа оплачена наличными и маржа положительная, создаётся авто-бонус 2,5% от маржи.' },
      { label: 'Доступ', desc: 'Администратор видит все салоны. Менеджер работает в рамках доступных ему данных.' },
    ],
  },
  {
    title: 'Касса',
    color: 'bg-emerald-50 border-emerald-100',
    dot: 'bg-emerald-400',
    headerColor: 'border-emerald-100',
    items: [
      { label: 'Назначение', desc: 'Раздел фиксирует ручные доходы и расходы по салонам, а также показывает выручку из заказов и продаж.' },
      { label: 'Периоды', desc: 'Доступен режим за сегодня и по месяцу. Администратор может фильтровать по салону.' },
      { label: 'Операции', desc: 'Типы операций зависят от роли и направления: доход или расход. Все записи сохраняются как CashEntry.' },
      { label: 'Ответственность', desc: 'Автор записи сохраняется автоматически из текущей сессии. Удаление доступно через интерфейс по конкретной записи.' },
    ],
  },
  {
    title: 'График смен',
    color: 'bg-amber-50 border-amber-100',
    dot: 'bg-amber-400',
    headerColor: 'border-amber-100',
    items: [
      { label: 'Сетка расписания', desc: 'Понедельный вид по всем салонам. Кликни на ячейку — введи имя или выбери из списка, Enter — сохранить, Esc — отмена' },
      { label: 'Отпуск и больничный', desc: 'Добавляются отдельной формой (кнопка «Отпуск / Больничный»). Выбери сотрудника и диапазон дат — обновятся все его смены за период. Данные хранятся в БД так же, как смены' },
      { label: 'Статистика — Смены', desc: 'Количество смен по каждому сотруднику за месяц или произвольный период, с разбивкой по салонам' },
      { label: 'Статистика — Отпуска и больничные', desc: 'Отдельная таблица: дней отпуска и дней больничного по каждому сотруднику за выбранный период' },
      { label: 'Доступ', desc: 'Редактирование и добавление отпусков — только администраторы. Менеджер видит только свои смены и свою статистику' },
    ],
  },
  {
    title: 'ЗП и бонусы — бизнес-требования',
    color: 'bg-green-50 border-green-100',
    dot: 'bg-green-400',
    headerColor: 'border-green-100',
    items: [
      { label: 'Что это?', desc: 'Раздел учёта финансовых начислений и удержаний по сотрудникам. Записи бывают ручные, импортированные и автоматические.' },
      { label: 'Авто-бонусы', desc: 'Бонусы за ВМР и наличность создаются автоматически в БД как TargetAction с source=AUTO. Это нужно, чтобы они попадали в статистику ЗП и историю начислений.' },
      { label: 'Выплата Зарплаты', desc: 'Факт фактической выплаты денег сотруднику. Не равна рассчитанной зарплате — это отдельная сущность. Вид: «Зарплата» (выплата на руки), «НДФЛ» → выделить в отдельный тип.' },
      { label: 'НДФЛ', desc: '13% налог, удерживается из зарплаты. В расчёте итога вычитается: Итого = ВЗП + Оклад + Бонусы − НДФЛ − Штрафы. Сейчас хранится как вид «Выплата Зарплаты» — требует рефакторинга в отдельный тип.' },
      { label: 'Добавление до Оклада', desc: 'Фиксированная часть, доначисляемая к зарплате. Добавляется в Итого как положительное значение. Раньше называлось «Доначисление Оклада».' },
      { label: 'Бонус', desc: 'Разовые премиальные выплаты и авто-бонусы. Авто-виды: «За ВМР» и «За наличность». Ручные виды: Отзыв, Отпускные, Работа без выходных, Выход в выходной, Выполнение плана.' },
      { label: 'Штраф', desc: 'Удержания. Виды: Опоздание, Списание за товар, Ревизия, Левак, Отзыв, Невыход, Работа не на потоке / курение / поведение, Неправильно заполненная продажа/заказ.' },
      { label: 'Формула Итого', desc: 'Итого = Выплата ЗП + Добавление до Оклада + Бонусы − НДФЛ − Штрафы. НДФЛ сейчас не вычитается — исправить после рефакторинга типов.' },
      { label: 'Дата начисления', desc: 'Дата когда запись была проставлена (факт начисления).' },
      { label: 'Дата выплаты', desc: 'Дата фактической передачи денег. По умолчанию = дата начисления, может быть изменена.' },
      { label: 'Источник', desc: '«Вручную» — добавлено через UI. «Импорт» — загружено из старых данных. «AUTO» — создано синком заказов или продаж.' },
      { label: 'Как вести', desc: '1. Открыть нужный месяц/год. 2. Нажать «+ Добавить». 3. Выбрать тип, вид, сотрудника, сумму, ответственного, даты. 4. Для просмотра сводки — таб «Статистика», выбрать период «с / по».' },
      { label: 'Открытые вопросы', desc: '① Куда перевести старые записи «Бонус/Оклад» и «Бонус/Зарплата». ② НДФЛ: вынести в отдельный тип и учесть в формуле.' },
    ],
  },
  {
    title: 'Сотрудники',
    color: 'bg-purple-50 border-purple-100',
    dot: 'bg-purple-400',
    headerColor: 'border-purple-100',
    items: [
      { label: 'Управление доступом', desc: 'Раздел «Сотрудники» — выдать/отозвать доступ, назначить роль (Менеджер / Администратор)' },
      { label: 'Роли', desc: 'Администратор — полный доступ ко всем данным. Менеджер — только свой магазин и свои смены' },
      { label: 'Первый вход', desc: 'После выдачи доступа сотрудник сам устанавливает пароль при первом входе' },
      { label: 'Сброс пароля', desc: 'Кнопка «Сбросить пароль» — при следующем входе пароль задаётся заново' },
    ],
  },
  {
    title: 'Синхронизация',
    color: 'bg-gray-50 border-gray-200',
    dot: 'bg-gray-400',
    headerColor: 'border-gray-200',
    items: [
      { label: 'Дельта (авто)', desc: 'Каждые 15 минут: только заказы и продажи. Окно дельты — последний час, чтобы не терять изменения при задержке cron.' },
      { label: 'Еженедельно (авто)', desc: 'Понедельник 06:00 МСК — магазины и список сотрудников из LiveSklad' },
      { label: 'Ручные запуски', desc: 'Отключены: нет POST /api/sync и нет workflow_dispatch в GitHub Actions. Раздел «Синхронизация» только показывает логи и счетчики.' },
      { label: 'Лог', desc: 'История всех запусков: количество записей, длительность, статус, ошибки' },
    ],
  },
  {
    title: 'Отчёты',
    color: 'bg-indigo-50 border-indigo-100',
    dot: 'bg-indigo-400',
    headerColor: 'border-indigo-100',
    items: [
      { label: 'Назначение', desc: 'Сводный аналитический раздел по заказам за выбранный месяц и год.' },
      { label: 'Источник', desc: 'Использует данные из локальной БД, которые попадают туда через синхронизацию LiveSklad.' },
      { label: 'Доступ', desc: 'Раздел доступен администраторам через основную навигацию.' },
    ],
  },
  {
    title: 'Хранение данных',
    color: 'bg-slate-50 border-slate-200',
    dot: 'bg-slate-400',
    headerColor: 'border-slate-200',
    items: [
      { label: 'Заказы и продажи', desc: 'Загружаются из LiveSklad, хранятся в БД. Upsert — повторный запуск не создаёт дубли' },
      { label: 'Смены', desc: 'Таблица ScheduleSlot. Вносятся вручную через UI, не тянутся из внешних систем' },
      { label: 'Отпуска и больничные', desc: 'Таблица EmployeeLeave — независима от смен. Одна запись = один день. Уникальность по (сотрудник, дата)' },
      { label: 'ЗП и бонусы', desc: 'Таблица TargetAction. Источники: MANUAL, IMPORT, AUTO. Авто-бонусы по заказам и продажам пересчитываются при обновлении данных из LiveSklad.' },
    ],
  },
]

const ACCESS_ROWS = [
  ['Заказы', 'Где он менеджер', 'Все магазины'],
  ['Продажи', 'Рабочие продажи', 'Все магазины'],
  ['Касса', 'Свой магазин', 'Все магазины'],
  ['График смен — просмотр', 'Только свои смены', 'Все сотрудники'],
  ['График смен — редактирование', '—', 'Полный доступ'],
  ['Отпуск / больничный', '—', 'Добавление и просмотр'],
  ['Статистика смен', 'Только по себе', 'Все сотрудники'],
  ['ЗП и бонусы', 'Только свои записи', 'Все + добавление'],
  ['Сотрудники', '—', 'Полное управление'],
  ['Синхронизация', '—', 'Просмотр логов и счетчиков'],
  ['Отчёты', '—', 'Полный доступ'],
  ['База знаний', 'Доступно', 'Доступно'],
]

export default function KnowledgePage() {
  const [open, setOpen] = useState<Section | null>(null)
  const [showAccess, setShowAccess] = useState(false)

  const close = useCallback(() => { setOpen(null); setShowAccess(false) }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [close])

  return (
    <div className="flex flex-col h-[calc(100dvh-8.5rem)] overflow-hidden bg-white md:h-screen">
      <div className="shrink-0 border-b border-gray-100 px-4 py-2.5 flex items-center gap-3">
        <h1 className="font-semibold text-gray-900 text-sm">База знаний</h1>
        <span className="text-xs text-gray-400">Smarthub — внутренняя система управления сетью мастерских</span>
      </div>

      <div className="flex-1 overflow-auto px-4 py-4">
        <div className="max-w-3xl space-y-3">

          <div className="bg-[#FFF9E0] border border-[#FFD600]/40 rounded-xl px-4 py-3">
            <p className="text-sm font-medium text-gray-800 mb-1">О системе</p>
            <p className="text-xs text-gray-600 leading-relaxed">
              Smarthub синхронизирует заказы и продажи из <strong>LiveSklad</strong> каждые 15 минут.
              Смены, отпуска, ЗП и бонусы ведутся вручную администраторами.
              По понедельникам обновляются салоны и сотрудники; авто-бонусы пересчитываются при обновлении заказов и продаж.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {SECTIONS.map(section => (
              <button key={section.title} onClick={() => setOpen(section)}
                className={`border rounded-xl px-4 py-3 text-left hover:shadow-sm transition-shadow ${section.color}`}>
                <div className="flex items-center gap-2.5 mb-2">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${section.dot}`} />
                  <span className="font-semibold text-gray-800 text-sm">{section.title}</span>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">
                  {section.items[0].desc}
                </p>
                <p className="text-[11px] text-gray-400 mt-2">{section.items.length} пунктов →</p>
              </button>
            ))}

            <button onClick={() => setShowAccess(true)}
              className="border border-gray-200 rounded-xl px-4 py-3 text-left bg-white hover:shadow-sm transition-shadow">
              <div className="flex items-center gap-2.5 mb-2">
                <span className="w-2 h-2 rounded-full shrink-0 bg-gray-300" />
                <span className="font-semibold text-gray-800 text-sm">Права доступа</span>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">
                Что видит Менеджер, что видит Администратор — по каждому разделу
              </p>
              <p className="text-[11px] text-gray-400 mt-2">{ACCESS_ROWS.length} разделов →</p>
            </button>
          </div>

        </div>
      </div>

      {/* Section modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={close}>
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <div className={`relative w-full max-w-xl max-h-[85vh] flex flex-col rounded-2xl border shadow-xl overflow-hidden ${open.color}`}
            onClick={e => e.stopPropagation()}>
            <div className={`shrink-0 px-5 py-3.5 border-b ${open.headerColor} flex items-center justify-between`}>
              <div className="flex items-center gap-2.5">
                <span className={`w-2.5 h-2.5 rounded-full ${open.dot}`} />
                <span className="font-semibold text-gray-800">{open.title}</span>
              </div>
              <button onClick={close}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none transition-colors">×</button>
            </div>
            <div className="flex-1 overflow-auto divide-y divide-black/5">
              {open.items.map(item => (
                <div key={item.label} className="px-5 py-3 flex gap-4">
                  <span className="text-xs font-medium text-gray-700 w-44 shrink-0 pt-0.5">{item.label}</span>
                  <span className="text-xs text-gray-500 leading-relaxed">{item.desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Access modal */}
      {showAccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={close}>
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <div className="relative w-full max-w-xl max-h-[85vh] flex flex-col rounded-2xl border border-gray-200 shadow-xl overflow-hidden bg-white"
            onClick={e => e.stopPropagation()}>
            <div className="shrink-0 px-5 py-3.5 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-gray-300" />
                <span className="font-semibold text-gray-800">Права доступа</span>
              </div>
              <button onClick={close}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none transition-colors">×</button>
            </div>
            <div className="flex-1 overflow-auto">
              <table className="w-full min-w-[680px] text-xs">
                <thead className="sticky top-0 bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-medium text-gray-500">Раздел</th>
                    <th className="px-4 py-2.5 text-center font-medium text-gray-500">Менеджер</th>
                    <th className="px-4 py-2.5 text-center font-medium text-gray-500">Администратор</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {ACCESS_ROWS.map(([section, manager, admin]) => (
                    <tr key={section} className="hover:bg-gray-50/50">
                      <td className="px-4 py-2.5 font-medium text-gray-700">{section}</td>
                      <td className="px-4 py-2.5 text-center text-gray-500">{manager}</td>
                      <td className="px-4 py-2.5 text-center text-gray-500">{admin}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
