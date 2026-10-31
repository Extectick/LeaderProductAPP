import type { AudienceItem, KnowledgeClient, KnowledgeDocument, KnowledgeSource, KnowledgeVersion, KnowledgeAudit } from '../../src/features/knowledge/types';
const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const text = `ПРИНТЕР НЕ ПЕЧАТАЕТ\n\nНазначение\nЭта инструкция помогает проверить подключение и очередь печати, прежде чем передавать обращение специалисту IT.\n\n1. Проверьте состояние устройства\nУбедитесь, что принтер включён. Посмотрите, нет ли сообщения о замятии бумаги, пустом лотке или замене картриджа. Запишите текст ошибки, если она есть.\n\n2. Проверьте подключение\nУбедитесь, что кабель подключён к принтеру и компьютеру. Для сетевого принтера проверьте подключение к рабочей сети.\n\n3. Проверьте очередь печати\nОткройте настройки принтера и посмотрите, нет ли приостановленных заданий. Не удаляйте чужие задания без согласования.\n\n4. Подготовьте данные для IT\nЕсли проблема сохранилась, укажите модель принтера, рабочее место и текст ошибки. Приложите фотографию экрана устройства.\n\nКонтроль результата\nПосле восстановления печати проверьте один тестовый документ и сообщите результат в обращении.`;
export function createKnowledgeFixture(scenario = 'normal') {
  const timestamp = new Date().toISOString();
  const source: KnowledgeSource = { id: id(900), key: 'qa', name: 'База знаний компании', enabled: true, lastScanAt: timestamp, lastSuccessAt: timestamp, lastErrorCode: scenario === 'offline' ? 'DAV_UNAVAILABLE' : null, nextScanAt: timestamp };
  const rows: KnowledgeDocument[] = [
    ['Принтер не печатает.docx','Оборудование/Принтеры', 'READY','COMPANY'],
    ['Вход в 1С и восстановление доступа.pdf','Рабочие системы/1С','READY','COMPANY'],
    ['Приёмка товара на складе.md','Рабочие процессы/Склад','READY','COMPANY'],
    ['Настройка сканера ТСД.pdf','Оборудование/Сканеры и ТСД','ERROR','COMPANY'],
    ['Регламент передачи смены.docx','Регламенты','PROCESSING','COMPANY'],
    ['Инструкция по обмену заказами.md','Рабочие системы/Лидер Продукт','READY','COMPANY'],
    ['Черновик решения по печати.md','На проверке','READY','AI_WORKSPACE'],
    ['Старый регламент.md','Материалы компании','SKIPPED','ARCHIVE'],
  ].map(([title,folder,status,section], index) => ({ id: id(index + 1), sourceId: source.id, title, path: `${section === 'AI_WORKSPACE' ? 'Рабочая область ИИ' : section === 'ARCHIVE' ? 'Архив' : 'Материалы компании'}/${folder}/${title}`, section: section as KnowledgeDocument['section'], size: 35640, mimeType: 'text/plain', currentRevision: index === 0 ? 3 : 1, publishedRevision: index === 5 ? 1 : null, publishedAt: index === 5 ? timestamp : null, deletedAt: null, allEmployees: index === 5, allowedUserIds: [], allowedDepartmentIds: [], updatedAt: timestamp,
    versions: [{ id: id(100 + index), revision: index === 0 ? 3 : 1, status: status as KnowledgeVersion['status'], errorCode: status === 'ERROR' ? 'NO_TEXT_OCR_REQUIRED' : status === 'SKIPPED' ? 'EXCLUDED_SECTION' : null, createdAt: timestamp, extractedAt: status === 'READY' ? timestamp : null }] }));
  const events: KnowledgeAudit[] = [];
  const users: AudienceItem[] = [{ id: 1, name: 'Анна Смирнова', description: 'IT' }, { id: 2, name: 'Иван Петров', description: 'Склад' }, { id: 3, name: 'Мария Орлова', description: 'Логистика' }];
  const departments: AudienceItem[] = [{ id: 1, name: 'IT' }, { id: 2, name: 'Склад' }, { id: 3, name: 'Логистика' }, { id: 4, name: 'Продажи' }];
  const get = (key: string) => rows.find(row => row.id === key)!;
  const wait = async (signal?: AbortSignal) => { await new Promise(resolve => setTimeout(resolve, 140)); if (signal?.aborted) throw new Error('Aborted'); };
  const audit = (documentId: string, action: string) => events.unshift({ id: String(events.length + 1), action, actorId: 1, versionId: get(documentId).versions![0].id, createdAt: new Date().toISOString(), detail: { revision: get(documentId).currentRevision, documentId } });
  const client: KnowledgeClient = {
    config: async signal => { await wait(signal); return { canManage: scenario !== 'denied' }; },
    sources: async signal => { await wait(signal); return [copy(source)]; },
    documents: async (query, signal) => { await wait(signal); return { documents: copy(rows.filter(row => {
      const status = row.versions![0].status;
      return (!query.q || row.path.toLowerCase().includes(query.q.toLowerCase())) && (!query.section || row.section === query.section) &&
        (query.view === 'all' || query.view === 'pending' && status === 'READY' && row.section === 'COMPANY' && row.publishedRevision === null || query.view === 'published' && row.publishedRevision !== null || query.view === 'processing' && ['PROCESSING','QUEUED'].includes(status) || query.view === 'errors' && status === 'ERROR');
    })), nextCursor: null }; },
    document: async (key, signal) => { await wait(signal); return copy(get(key)); },
    preview: async (key, revision, signal) => { await wait(signal); const row = get(key); return { document: copy(row), version: { ...copy(row.versions![0]), id: revision === row.currentRevision ? row.versions![0].id : id(200 + revision), revision, text: row.versions![0].status === 'READY' ? text : null, path: row.path, sha256: 'fixture' } }; },
    versions: async (key, before, signal) => { await wait(signal); const row = get(key); return { versions: Array.from({ length: row.currentRevision }, (_, index) => ({ ...copy(row.versions![0]), revision: row.currentRevision - index, id: id(200 + row.currentRevision - index) })), nextBefore: null }; },
    audit: async (key, signal) => { await wait(signal); return copy(events.filter(event => event.detail.documentId === key)); },
    audience: async (kind, query, signal) => { await wait(signal); return { items: (kind === 'user' ? users : departments).filter(item => (!query.q || item.name.toLowerCase().includes(query.q.toLowerCase())) && (!query.ids || query.ids.includes(item.id))), nextCursor: null }; },
    publish: async (key, versionId, audience) => { await wait(); if (scenario === 'conflict') throw { code: 'KNOWLEDGE_VERSION_CHANGED', status: 409 };
      const row = get(key); if (row.versions![0].id !== versionId) throw { code: 'KNOWLEDGE_VERSION_CHANGED', status: 409 };
      Object.assign(row, { allEmployees: audience.allEmployees, allowedUserIds: audience.userIds, allowedDepartmentIds: audience.departmentIds, publishedRevision: row.currentRevision, publishedAt: new Date().toISOString() }); audit(key, 'PUBLISHED'); },
    revoke: async key => { await wait(); Object.assign(get(key), { publishedRevision: null, publishedAt: null }); audit(key, 'REVOKED'); },
    retry: async key => { await wait(); get(key).versions![0].status = 'QUEUED'; audit(key, 'RETRY_REQUESTED'); },
    sync: async () => { await wait(); source.lastSuccessAt = new Date().toISOString(); source.lastErrorCode = null; },
  };
  return client;
}
