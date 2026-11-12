import type { TenderPriority, TenderRow, TenderStatus } from './api';

// Order follows the tender funnel from the product spec.
export const tenderStatusLabels: Record<TenderStatus, string> = {
  found: 'Найден',
  analysis: 'Анализ ТЗ',
  product_check: 'Проверка товара',
  pricing: 'Расчёт цены',
  documents: 'Подготовка документов',
  submitted: 'Заявка подана',
  awaiting_result: 'Ожидание итогов',
  won: 'Победа',
  contract: 'Контракт',
  delivery: 'Поставка',
  closing: 'Закрытие документов',
  lost: 'Проигрыш',
  declined: 'Отказ от участия',
  not_held: 'Не состоялся',
  missed: 'Опоздали'
};

export const tenderPriorityLabels: Record<TenderPriority, string> = {
  hot: 'Горячий',
  review: 'На проверку',
  wide: 'Широкий поиск'
};

const FINISHED: TenderStatus[] = ['closing', 'lost', 'declined', 'not_held', 'missed'];
const DAY_MS = 24 * 60 * 60 * 1000;

export function formatMoney(value?: string | number | null) {
  if (value === null || value === undefined || value === '') {
    return '—';
  }

  const amount = Number(value);

  return Number.isFinite(amount)
    ? `${amount.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₽`
    : '—';
}

export function formatDateTime(value?: string | null) {
  return value
    ? new Date(value).toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    : '—';
}

/** How urgent the submission deadline is, for highlighting in lists and cards. */
export function deadlineState(tender: Pick<TenderRow, 'submissionDeadline' | 'status'>) {
  if (!tender.submissionDeadline || FINISHED.includes(tender.status)) {
    return { tone: 'none' as const, label: '' };
  }

  const left = new Date(tender.submissionDeadline).getTime() - Date.now();

  if (left < 0) {
    // Past the deadline matters only while the bid has not been submitted yet.
    return ['found', 'analysis', 'product_check', 'pricing', 'documents'].includes(tender.status)
      ? { tone: 'expired' as const, label: 'Срок подачи истёк' }
      : { tone: 'none' as const, label: '' };
  }

  if (left < DAY_MS) {
    return { tone: 'urgent' as const, label: `Осталось ${Math.max(1, Math.round(left / 3600000))} ч` };
  }

  if (left < 3 * DAY_MS) {
    return { tone: 'soon' as const, label: `Осталось ${Math.ceil(left / DAY_MS)} дн.` };
  }

  return { tone: 'none' as const, label: '' };
}

export function tenderStatusClass(status: TenderStatus) {
  if (['won', 'contract', 'delivery'].includes(status)) {
    return 'status status-good';
  }

  if (['lost', 'declined', 'not_held', 'missed'].includes(status)) {
    return 'status status-warn';
  }

  return status === 'found' ? 'status status-muted' : 'status';
}
